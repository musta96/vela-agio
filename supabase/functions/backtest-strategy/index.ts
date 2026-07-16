const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Strategy = "buy_hold" | "sma_cross" | "rsi" | "custom";

interface CustomCondition {
  type: string;
  value?: number;
  period?: number;
  fast?: number;
  slow?: number;
}
interface CustomRules {
  entry: CustomCondition[];
  exit: CustomCondition[];
  risk: { stopPct?: number; targetPct?: number };
}

interface Holding { symbol: string; weight: number; }
interface Bar { t: number; close: number; }

interface CostConfig {
  commissionPct?: number;   // %, applied to trade notional (each side)
  commissionFlat?: number;  // absolute currency, applied per trade (each side)
  slippageBps?: number;     // basis points: buy fills higher, sell fills lower
}

const RANGE_MAP: Record<string, { range: string; interval: string }> = {
  "3M": { range: "3mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  "3Y": { range: "3y", interval: "1wk" },
  "5Y": { range: "5y", interval: "1wk" },
};

async function fetchBars(symbol: string, range: string): Promise<Bar[]> {
  const { range: r, interval } = RANGE_MAP[range] || RANGE_MAP["1Y"];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${r}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const j = await res.json();
    const result = j?.chart?.result?.[0];
    if (!result) return [];
    const ts: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    const bars: Bar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (typeof c === "number" && !isNaN(c)) bars.push({ t: ts[i] * 1000, close: c });
    }
    return bars;
  } catch { return []; }
}

function sma(arr: number[], n: number, i: number): number | null {
  if (i + 1 < n) return null;
  let s = 0; for (let k = i - n + 1; k <= i; k++) s += arr[k];
  return s / n;
}

function rsi(closes: number[], i: number, period = 14): number | null {
  if (i < period) return null;
  let gains = 0, losses = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const diff = closes[k] - closes[k - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgG = gains / period, avgL = losses / period;
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

function evalCondition(c: CustomCondition, closes: number[], i: number): boolean {
  const smaAt = (n: number, idx: number) => sma(closes, n, idx);
  switch (c.type) {
    case "rsi_below": {
      const r = rsi(closes, i);
      return r !== null && r < (c.value ?? 30);
    }
    case "rsi_above": {
      const r = rsi(closes, i);
      return r !== null && r > (c.value ?? 70);
    }
    case "sma_cross_up": {
      const f = c.fast ?? 20, s = c.slow ?? 50;
      const a = smaAt(f, i), b = smaAt(s, i);
      const ap = smaAt(f, i - 1), bp = smaAt(s, i - 1);
      return !!(a && b && ap && bp && ap <= bp && a > b);
    }
    case "sma_cross_down": {
      const f = c.fast ?? 20, s = c.slow ?? 50;
      const a = smaAt(f, i), b = smaAt(s, i);
      const ap = smaAt(f, i - 1), bp = smaAt(s, i - 1);
      return !!(a && b && ap && bp && ap >= bp && a < b);
    }
    case "price_above_sma": {
      const v = smaAt(c.period ?? 50, i);
      return v !== null && closes[i] > v;
    }
    case "price_below_sma": {
      const v = smaAt(c.period ?? 50, i);
      return v !== null && closes[i] < v;
    }
    case "macd_cross_up": {
      // Use EMA(12) - EMA(26) with signal EMA(9). Compute incrementally is heavy;
      // approximate by evaluating on window ending at i.
      const m = macdAt(closes, i);
      const mp = macdAt(closes, i - 1);
      return !!(m && mp && mp.macd <= mp.signal && m.macd > m.signal);
    }
    case "macd_cross_down": {
      const m = macdAt(closes, i);
      const mp = macdAt(closes, i - 1);
      return !!(m && mp && mp.macd >= mp.signal && m.macd < m.signal);
    }
    case "price_pct_change": {
      const n = c.period ?? 5;
      if (i - n < 0) return false;
      const chg = (closes[i] - closes[i - n]) / closes[i - n] * 100;
      const thr = c.value ?? 5;
      return thr >= 0 ? chg >= thr : chg <= thr;
    }
    case "volume_spike":
      // Volume not modeled on basket bars — never triggers server-side.
      return false;
    default:
      return false;
  }
}

function ema(closes: number[], period: number, i: number): number | null {
  if (i + 1 < period) return null;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let x = 0; x <= i; x++) {
    if (x < period - 1) { prev += closes[x]; continue; }
    if (x === period - 1) { prev = (prev + closes[x]) / period; continue; }
    prev = closes[x] * k + prev * (1 - k);
  }
  return prev;
}
function macdAt(closes: number[], i: number): { macd: number; signal: number } | null {
  const f = ema(closes, 12, i);
  const s = ema(closes, 26, i);
  if (f == null || s == null) return null;
  // Signal = EMA(9) of the macd line — approximate with EMA over the derived series.
  const macdLine: number[] = [];
  for (let x = 0; x <= i; x++) {
    const ef = ema(closes, 12, x);
    const es = ema(closes, 26, x);
    macdLine.push(ef != null && es != null ? ef - es : 0);
  }
  const sig = ema(macdLine, 9, macdLine.length - 1);
  if (sig == null) return null;
  return { macd: f - s, signal: sig };
}

function simulate(bars: Bar[], strategy: Strategy, initial: number, rules?: CustomRules, costs: CostConfig = {}) {
  const closes = bars.map(b => b.close);
  let cash = initial, shares = 0;
  const equity: { t: number; value: number; benchmark: number }[] = [];
  const trades: { date: string; type: "BUY" | "SELL"; price: number; shares: number; fees: number }[] = [];
  const baseShares = initial / closes[0];

  const slipMult = 1 + (Math.max(0, costs.slippageBps ?? 0) / 10000);
  const feePctFrac = Math.max(0, costs.commissionPct ?? 0) / 100;
  const feeFlat = Math.max(0, costs.commissionFlat ?? 0);
  let totalFees = 0;

  let entryPrice = 0;
  const buy = (i: number) => {
    if (shares > 0 || cash <= 0) return;
    const exec = closes[i] * slipMult; // pay slippage on the way in
    // solve: cash = shares*exec*(1+feePct) + feeFlat
    const spendable = Math.max(0, cash - feeFlat);
    const buyShares = spendable / (exec * (1 + feePctFrac));
    if (buyShares <= 0) return;
    const fee = feeFlat + buyShares * exec * feePctFrac;
    shares = buyShares;
    cash = 0;
    entryPrice = exec;
    totalFees += fee;
    trades.push({ date: new Date(bars[i].t).toISOString().slice(0,10), type: "BUY", price: exec, shares: buyShares, fees: fee });
  };
  const sell = (i: number) => {
    if (shares <= 0) return;
    const exec = closes[i] * (2 - slipMult); // slippage on the way out (symmetric bps)
    const gross = shares * exec;
    const fee = feeFlat + gross * feePctFrac;
    cash = Math.max(0, gross - fee);
    totalFees += fee;
    trades.push({ date: new Date(bars[i].t).toISOString().slice(0,10), type: "SELL", price: exec, shares, fees: fee });
    shares = 0;
  };

  for (let i = 0; i < bars.length; i++) {
    if (strategy === "buy_hold") {
      if (i === 0) buy(i);
    } else if (strategy === "sma_cross") {
      const fast = sma(closes, 20, i), slow = sma(closes, 50, i);
      const fastPrev = sma(closes, 20, i - 1), slowPrev = sma(closes, 50, i - 1);
      if (fast && slow && fastPrev && slowPrev) {
        if (fastPrev <= slowPrev && fast > slow) buy(i);
        else if (fastPrev >= slowPrev && fast < slow) sell(i);
      }
    } else if (strategy === "rsi") {
      const r = rsi(closes, i);
      if (r !== null) {
        if (r < 30 && shares === 0) buy(i);
        else if (r > 70 && shares > 0) sell(i);
      }
    } else if (strategy === "custom" && rules) {
      // Evaluate hard stop/target first if position open.
      if (shares > 0) {
        const chg = (closes[i] - entryPrice) / entryPrice * 100;
        if (rules.risk?.stopPct && chg <= -Math.abs(rules.risk.stopPct)) { sell(i); }
        else if (rules.risk?.targetPct && chg >= Math.abs(rules.risk.targetPct)) { sell(i); }
      }
      if (shares === 0) {
        const entryOk = rules.entry.length > 0 && rules.entry.every(c => evalCondition(c, closes, i));
        if (entryOk) buy(i);
      } else {
        const exitOk = rules.exit.length > 0 && rules.exit.every(c => evalCondition(c, closes, i));
        if (exitOk) sell(i);
      }
    }
    const value = cash + shares * closes[i];
    const benchmark = baseShares * closes[i];
    equity.push({ t: bars[i].t, value, benchmark });
  }

  // Close any open position at end
  if (shares > 0) sell(bars.length - 1);

  // Metrics
  const finalValue = equity[equity.length - 1].value;
  const totalReturn = (finalValue - initial) / initial * 100;
  const benchReturn = (equity[equity.length - 1].benchmark - initial) / initial * 100;
  let peak = equity[0].value, maxDD = 0;
  for (const e of equity) {
    if (e.value > peak) peak = e.value;
    const dd = (e.value - peak) / peak * 100;
    if (dd < maxDD) maxDD = dd;
  }
  // Daily returns for Sharpe
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    rets.push((equity[i].value - equity[i-1].value) / (equity[i-1].value || 1));
  }
  const mean = rets.reduce((a,b)=>a+b,0) / (rets.length || 1);
  const variance = rets.reduce((a,b)=>a+(b-mean)**2,0) / (rets.length || 1);
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

  // Pair trades for win rate
  let wins = 0, totalPairs = 0;
  for (let i = 0; i < trades.length - 1; i += 2) {
    if (trades[i].type === "BUY" && trades[i+1]?.type === "SELL") {
      totalPairs++;
      if (trades[i+1].price > trades[i].price) wins++;
    }
  }
  const winRate = totalPairs > 0 ? wins / totalPairs * 100 : 0;

  return { equity, trades, metrics: {
    finalValue, totalReturn, benchReturn, maxDrawdown: maxDD, sharpe, winRate,
    totalTrades: trades.length, winningTrades: wins, totalFees,
  }};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const holdings: Holding[] = body.holdings || [];
    const strategy: Strategy = body.strategy || "buy_hold";
    const range: string = body.range || "1Y";
    const initial: number = Number(body.initialCapital) || 100000;
    const benchmarkSymbol: string | null = typeof body.benchmark === "string" && body.benchmark.trim() ? body.benchmark.trim() : null;
    const costs: CostConfig = (body.costs && typeof body.costs === "object") ? {
      commissionPct:  Number(body.costs.commissionPct)  || 0,
      commissionFlat: Number(body.costs.commissionFlat) || 0,
      slippageBps:    Number(body.costs.slippageBps)    || 0,
    } : {};
    const returnBars: boolean = body.returnBars === true;

    if (!holdings.length) {
      return new Response(JSON.stringify({ error: "At least one holding required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch bars for each holding
    const all = await Promise.all(holdings.map(async h => ({ h, bars: await fetchBars(h.symbol, range) })));
    const valid = all.filter(x => x.bars.length >= 30);
    if (valid.length === 0) {
      return new Response(JSON.stringify({ error: "No historical data available for selected symbols" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a synthetic weighted-basket bar series by aligning on calendar date (UTC).
    // Different exchanges close at different times, so exact-ms timestamps rarely match.
    const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
    const perSymbolByDay = valid.map(v => {
      const m = new Map<string, Bar>();
      for (const b of v.bars) {
        // Keep the last bar of the day (latest close)
        m.set(dayKey(b.t), b);
      }
      return { h: v.h, map: m };
    });
    const commonDays = Array.from(perSymbolByDay[0].map.keys())
      .filter(d => perSymbolByDay.every(s => s.map.has(d)))
      .sort();
    const totalWeight = valid.reduce((s, v) => s + v.h.weight, 0) || 1;
    const basketBars: Bar[] = commonDays.map(d => {
      let v = 0;
      let t = 0;
      for (const item of perSymbolByDay) {
        const bar = item.map.get(d)!;
        v += (item.h.weight / totalWeight) * bar.close;
        if (bar.t > t) t = bar.t;
      }
      return { t, close: v };
    });

    if (basketBars.length < 2) {
      return new Response(JSON.stringify({ error: "Selected holdings have no overlapping price history for this range. Try a longer range or fewer symbols." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rules: CustomRules | undefined = strategy === "custom" && body.rules
      ? { entry: body.rules.entry ?? [], exit: body.rules.exit ?? [], risk: body.rules.risk ?? {} }
      : undefined;
    if (strategy === "custom" && (!rules || rules.entry.length === 0)) {
      return new Response(JSON.stringify({ error: "Custom strategy requires at least one entry rule" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const result = simulate(basketBars, strategy, initial, rules, costs);

    // External benchmark (index): replace the self-basket benchmark in the equity series.
    let benchmarkLabel = "Buy & Hold (basket)";
    if (benchmarkSymbol) {
      const benchBars = await fetchBars(benchmarkSymbol, range);
      if (benchBars.length >= 2) {
        const bMap = new Map(benchBars.map(b => [b.t, b.close] as const));
        // Find the first benchmark close on/after each basket timestamp; otherwise carry-forward.
        const sortedBench = benchBars.slice().sort((a, b) => a.t - b.t);
        let lastClose: number | null = null;
        let benchIdx = 0;
        const baseBenchClose = (() => {
          const exact = bMap.get(result.equity[0].t);
          if (typeof exact === "number") return exact;
          for (const b of sortedBench) { if (b.t >= result.equity[0].t) return b.close; }
          return sortedBench[0]?.close ?? null;
        })();
        if (typeof baseBenchClose === "number" && baseBenchClose > 0) {
          for (let i = 0; i < result.equity.length; i++) {
            const t = result.equity[i].t;
            const exact = bMap.get(t);
            if (typeof exact === "number") {
              lastClose = exact;
            } else {
              while (benchIdx < sortedBench.length && sortedBench[benchIdx].t <= t) {
                lastClose = sortedBench[benchIdx].close;
                benchIdx++;
              }
            }
            if (typeof lastClose === "number") {
              result.equity[i].benchmark = initial * (lastClose / baseBenchClose);
            }
          }
          const lastBench = result.equity[result.equity.length - 1].benchmark;
          result.metrics.benchReturn = (lastBench - initial) / initial * 100;
          benchmarkLabel = benchmarkSymbol;
        }
      }
    }

    return new Response(JSON.stringify({
      strategy, range, holdings: valid.map(v => v.h.symbol),
      benchmark: benchmarkSymbol, benchmarkLabel,
      costs,
      bars: returnBars ? basketBars : undefined,
      ...result,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("backtest error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});