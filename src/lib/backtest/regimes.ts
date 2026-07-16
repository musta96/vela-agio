// Classify each bar into a market regime and slice equity performance by regime.

import type { Bar } from "./clientSim";

export type Regime = "trend_up" | "trend_down" | "range" | "high_vol" | "low_vol";

export const REGIME_LABELS: Record<Regime, string> = {
  trend_up: "Uptrend",
  trend_down: "Downtrend",
  range: "Range-bound",
  high_vol: "High volatility",
  low_vol: "Low volatility",
};

function stdev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

// Trend regime uses 20/50 SMA slope + spread; volatility regime uses 20-bar realized vol vs median.
export function classifyRegimes(bars: Bar[]): { trend: Regime[]; vol: Regime[] } {
  const closes = bars.map((b) => b.close);
  const n = closes.length;
  const trend = new Array<Regime>(n).fill("range");
  const vol   = new Array<Regime>(n).fill("low_vol");

  // 20-bar rolling returns and realized vol
  const rets: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) rets[i] = closes[i - 1] > 0 ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0;

  const vols: number[] = new Array(n).fill(0);
  const W = 20;
  for (let i = W; i < n; i++) vols[i] = stdev(rets.slice(i - W + 1, i + 1));

  const nonZeroVols = vols.filter((v) => v > 0).sort((a, b) => a - b);
  const medianVol = nonZeroVols.length ? nonZeroVols[Math.floor(nonZeroVols.length / 2)] : 0;

  const sma = (win: number, i: number): number | null => {
    if (i + 1 < win) return null;
    let s = 0;
    for (let k = i - win + 1; k <= i; k++) s += closes[k];
    return s / win;
  };

  for (let i = 0; i < n; i++) {
    const s20 = sma(20, i);
    const s50 = sma(50, i);
    const s50p = sma(50, i - 5); // 5-bar earlier
    if (s20 !== null && s50 !== null && s50p !== null) {
      const slope = (s50 - s50p) / s50p;
      const spread = (s20 - s50) / s50;
      if (slope > 0.001 && spread > 0.005) trend[i] = "trend_up";
      else if (slope < -0.001 && spread < -0.005) trend[i] = "trend_down";
      else trend[i] = "range";
    }
    if (vols[i] > 0 && medianVol > 0) {
      vol[i] = vols[i] > medianVol * 1.5 ? "high_vol" : vols[i] < medianVol * 0.66 ? "low_vol" : "low_vol";
      if (vols[i] > medianVol) vol[i] = vols[i] > medianVol * 1.5 ? "high_vol" : "low_vol";
    }
  }
  return { trend, vol };
}

export interface RegimeStats {
  regime: Regime;
  bars: number;
  returnPct: number;   // portfolio return during this regime
  benchPct: number;    // buy&hold return during this regime
  maxDdPct: number;
  winPct: number;      // fraction of days with positive equity change
}

// Compute performance metrics for each regime bucket using equity values aligned to bars.
export function regimePerformance(
  bars: { t: number; close: number }[],
  equity: { t: number; value: number }[],
  regimes: Regime[],
): RegimeStats[] {
  // Align by index — the edge function emits equity in lock-step with basketBars.
  const n = Math.min(bars.length, equity.length, regimes.length);
  const buckets = new Map<Regime, {
    bars: number;
    pRet: number;      // product of (1 + daily equity return)
    bRet: number;      // product of (1 + daily benchmark return)
    peak: number;
    maxDd: number;
    winDays: number;
    dayCount: number;
  }>();

  for (let i = 1; i < n; i++) {
    const r = regimes[i];
    if (!buckets.has(r)) buckets.set(r, { bars: 0, pRet: 1, bRet: 1, peak: equity[i - 1].value, maxDd: 0, winDays: 0, dayCount: 0 });
    const b = buckets.get(r)!;
    b.bars++;
    const prevE = equity[i - 1].value;
    const prevC = bars[i - 1].close;
    if (prevE > 0) {
      const ret = (equity[i].value - prevE) / prevE;
      b.pRet *= 1 + ret;
      if (ret > 0) b.winDays++;
      b.dayCount++;
    }
    if (prevC > 0) b.bRet *= 1 + (bars[i].close - prevC) / prevC;
    if (equity[i].value > b.peak) b.peak = equity[i].value;
    const dd = b.peak > 0 ? (equity[i].value - b.peak) / b.peak : 0;
    if (dd < b.maxDd) b.maxDd = dd;
  }

  const out: RegimeStats[] = [];
  for (const [regime, b] of buckets) {
    out.push({
      regime,
      bars: b.bars,
      returnPct: (b.pRet - 1) * 100,
      benchPct:  (b.bRet - 1) * 100,
      maxDdPct:  b.maxDd * 100,
      winPct:    b.dayCount > 0 ? (b.winDays / b.dayCount) * 100 : 0,
    });
  }
  return out.sort((a, b) => b.bars - a.bars);
}