const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Strategy = "buy_hold" | "sma_cross" | "rsi";

interface Holding { symbol: string; weight: number; }
interface Bar { t: number; close: number; }

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

function simulate(bars: Bar[], strategy: Strategy, initial: number) {
  const closes = bars.map(b => b.close);
  let cash = initial, shares = 0;
  const equity: { t: number; value: number; benchmark: number }[] = [];
  const trades: { date: string; type: "BUY" | "SELL"; price: number; shares: number }[] = [];
  const baseShares = initial / closes[0];

  const buy = (i: number) => {
    if (shares > 0 || cash <= 0) return;
    shares = cash / closes[i]; cash = 0;
    trades.push({ date: new Date(bars[i].t).toISOString().slice(0,10), type: "BUY", price: closes[i], shares });
  };
  const sell = (i: number) => {
    if (shares <= 0) return;
    cash = shares * closes[i];
    trades.push({ date: new Date(bars[i].t).toISOString().slice(0,10), type: "SELL", price: closes[i], shares });
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
    totalTrades: trades.length, winningTrades: wins,
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

    // Build a synthetic weighted-basket bar series using common timestamps (intersection)
    const tsSets = valid.map(v => new Set(v.bars.map(b => b.t)));
    const commonTs = valid[0].bars.map(b => b.t).filter(t => tsSets.every(s => s.has(t)));
    const totalWeight = valid.reduce((s, v) => s + v.h.weight, 0) || 1;
    const basketBars: Bar[] = commonTs.map(t => {
      let v = 0;
      for (const item of valid) {
        const bar = item.bars.find(b => b.t === t)!;
        v += (item.h.weight / totalWeight) * bar.close;
      }
      return { t, close: v };
    });

    if (basketBars.length < 2) {
      return new Response(JSON.stringify({ error: "Selected holdings have no overlapping price history for this range. Try a longer range or fewer symbols." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = simulate(basketBars, strategy, initial);

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
      ...result,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("backtest error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});