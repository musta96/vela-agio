// Simple Monte-Carlo simulation for a portfolio's future value.
// Uses historical daily returns to estimate drift (mu) and vol (sigma) per asset
// then simulates GBM paths and aggregates portfolio value at horizon.

export interface MCInput {
  holdings: { symbol: string; shares: number; currentPrice: number; currency: string }[];
  fxToBase: Record<string, number>; // currency -> rate to base
  history: Record<string, { t: number; close: number }[]>; // 1y daily bars per symbol
  horizonDays: number;
  runs: number;
}

export interface MCResult {
  initialValue: number;
  paths: number; // number of paths kept (downsampled)
  finalValues: number[]; // length = runs
  percentiles: { p05: number; p25: number; p50: number; p75: number; p95: number };
  expected: number;
  probLoss: number;
  pathsSample: number[][]; // ~50 sample paths for charting
}

function dailyReturns(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) r.push(Math.log(closes[i] / closes[i - 1]));
  }
  return r;
}

function mean(a: number[]) { return a.reduce((s, x) => s + x, 0) / (a.length || 1); }
function std(a: number[]) {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1 || 1));
}

// Box-Muller standard normal
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function runMonteCarlo(input: MCInput): MCResult {
  const { holdings, fxToBase, history, horizonDays, runs } = input;

  // Per-asset drift & vol from historical daily log-returns
  const stats = holdings.map((h) => {
    const closes = (history[h.symbol] || []).map((b) => b.close).filter((x) => x > 0);
    const rets = dailyReturns(closes);
    return {
      symbol: h.symbol,
      mu: rets.length ? mean(rets) : 0,
      sigma: rets.length ? std(rets) : 0.015,
      price: h.currentPrice,
      shares: h.shares,
      fx: fxToBase[h.currency] ?? 1,
    };
  });

  const initialValue = stats.reduce((s, x) => s + x.shares * x.price * x.fx, 0);

  const finalValues: number[] = new Array(runs);
  const SAMPLE_PATHS = Math.min(50, runs);
  const sampleStride = Math.max(1, Math.floor(runs / SAMPLE_PATHS));
  const pathsSample: number[][] = [];

  for (let r = 0; r < runs; r++) {
    // simulate prices for each asset, then aggregate per-day
    const prices = stats.map((s) => s.price);
    const path: number[] = [];
    for (let d = 0; d < horizonDays; d++) {
      let pv = 0;
      for (let i = 0; i < stats.length; i++) {
        const s = stats[i];
        // GBM step: S_{t+1} = S_t * exp((mu - 0.5 sigma^2) + sigma * Z)
        prices[i] = prices[i] * Math.exp((s.mu - 0.5 * s.sigma * s.sigma) + s.sigma * randn());
        pv += prices[i] * s.shares * s.fx;
      }
      if (r % sampleStride === 0 && pathsSample.length < SAMPLE_PATHS) {
        // accumulate the current path
      }
      path.push(pv);
    }
    if (r % sampleStride === 0 && pathsSample.length < SAMPLE_PATHS) pathsSample.push(path);
    finalValues[r] = path[path.length - 1];
  }

  const sorted = [...finalValues].sort((a, b) => a - b);
  const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];

  return {
    initialValue,
    paths: runs,
    finalValues,
    percentiles: {
      p05: pct(0.05),
      p25: pct(0.25),
      p50: pct(0.50),
      p75: pct(0.75),
      p95: pct(0.95),
    },
    expected: mean(finalValues),
    probLoss: finalValues.filter((v) => v < initialValue).length / (runs || 1),
    pathsSample,
  };
}
