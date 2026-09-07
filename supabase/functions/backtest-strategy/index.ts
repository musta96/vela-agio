import { getDailyHistory } from "../_shared/price-provider.ts";
import { evalStrategyCondition, unsupportedConditions } from "../_shared/ta/conditions.ts";
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
interface Bar { t: number; open: number; high: number; low: number; close: number; volume: number; }

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
  "10Y": { range: "10y", interval: "1d" },
  "15Y": { range: "max", interval: "1d" },
};

// Long-horizon ranges go through the provider chain (Financial Datasets when a
// key is configured, otherwise adjusted Yahoo / Stooq) so 10-15y backtests use
// corporate-action adjusted prices.
const LONG_RANGES: Record<string, number> = { "10Y": 10, "15Y": 15 };

async function fetchBars(symbol: string, range: string): Promise<Bar[]> {
  if (LONG_RANGES[range]) {
    const hist = await getDailyHistory(symbol, LONG_RANGES[range], null);
    if (hist.bars.length >= 60) {
      return hist.bars.map((b) => ({
        t: b.t,
        open: b.open ?? b.adjClose,
        high: b.high ?? b.adjClose,
        low: b.low ?? b.adjClose,
        close: b.adjClose,
        volume: b.volume ?? 0,
      }));
    }
  }
  const { range: r, interval } = RANGE_MAP[range] || RANGE_MAP["1Y"];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${r}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const j = await res.json();
    const result = j?.chart?.result?.[0];
    if (!result) return [];
    const ts: number[] = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const cArr: (number | null)[] = q.close || [];
    const oArr: (number | null)[] = q.open || [];
    const hArr: (number | null)[] = q.high || [];
    const lArr: (number | null)[] = q.low || [];
    const vArr: (number | null)[] = q.volume || [];
    
    const bars: Bar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = cArr[i];
      if (typeof c === "number" && !isNaN(c)) {
        bars.push({
          t: ts[i] * 1000,
          open: oArr[i] ?? c,
          high: hArr[i] ?? c,
          low: lArr[i] ?? c,
          close: c,
          volume: vArr[i] ?? 0,
        });
      }
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

// Full condition evaluation (classic + advanced pattern rules) lives in the
// shared TA module so client preview and server run agree.
function evalCondition(c: CustomCondition, bars: Bar[], i: number): boolean {
  return evalStrategyCondition(c, bars, i);
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
    const exec = closes[i] * slipMult;
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
    const exec = closes[i] * (2 - slipMult);
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

  if (shares > 0) sell(bars.length - 1);

  const finalValue = equity[equity.length - 1].value;
  const totalReturn = (finalValue - initial) / initial * 100;
  const benchReturn = (equity[equity.length - 1].benchmark - initial) / initial * 100;
  let peak = equity[0].value, maxDD = 0;
  for (const e of equity) {
    if (e.value > peak) peak = e.value;
    const dd = (e.value - peak) / peak * 100;
    if (dd < maxDD) maxDD = dd;
  }
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    rets.push((equity[i].value - equity[i-1].value) / (equity[i-1].value || 1));
  }
  const mean = rets.reduce((a,b)=>a+b,0) / (rets.length || 1);
  const variance = rets.reduce((a,b)=>a+(b-mean)**2,0) / (rets.length || 1);
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

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

    const all = await Promise.all(holdings.map(async h => ({ h, bars: await fetchBars(h.symbol, range) })));
    const valid = all.filter(x => x.bars.length >= 30);
    if (valid.length === 0) {
      return new Response(JSON.stringify({ error: "No historical data available for selected symbols" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
    const perSymbolByDay = valid.map(v => {
      const m = new Map<string, Bar>();
      for (const b of v.bars) {
        m.set(dayKey(b.t), b);
      }
      return { h: v.h, map: m };
    });
    const commonDays = Array.from(perSymbolByDay[0].map.keys())
      .filter(d => perSymbolByDay.every(s => s.map.has(d)))
      .sort();
    const totalWeight = valid.reduce((s, v) => s + v.h.weight, 0) || 1;
    const basketBars: Bar[] = commonDays.map(d => {
      let o = 0, h = 0, l = 0, c = 0, vol = 0;
      let t = 0;
      for (const item of perSymbolByDay) {
        const bar = item.map.get(d)!;
        const w = item.h.weight / totalWeight;
        o += w * bar.open;
        h += w * bar.high;
        l += w * bar.low;
        c += w * bar.close;
        vol += bar.volume;
        if (bar.t > t) t = bar.t;
      }
      return { t, open: o, high: h, low: l, close: c, volume: vol };
    });

    if (basketBars.length < 2) {
      return new Response(JSON.stringify({ error: "Selected holdings have no overlapping price history for this range." }), {
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

    let benchmarkLabel = "Buy & Hold (basket)";
    if (benchmarkSymbol) {
      const benchBars = await fetchBars(benchmarkSymbol, range);
      if (benchBars.length >= 2) {
        const bMap = new Map(benchBars.map(b => [b.t, b.close] as const));
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
