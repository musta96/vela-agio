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

export interface RegimeConfig {
  smaFast: number;        // fast SMA window (bars)
  smaSlow: number;        // slow SMA window (bars)
  slopeLookback: number;  // bars used to measure slow-SMA slope
  slopeThreshold: number; // absolute slope % (as fraction, e.g. 0.001 = 0.1%)
  spreadThreshold: number;// absolute fast-vs-slow spread (fraction)
  volWindow: number;      // rolling window for realized vol (bars)
  highVolMult: number;    // realized vol > median × this ⇒ high vol
  lowVolMult: number;     // realized vol < median × this ⇒ low vol
}

export const DEFAULT_REGIME_CONFIG: RegimeConfig = {
  smaFast: 20,
  smaSlow: 50,
  slopeLookback: 5,
  slopeThreshold: 0.001,
  spreadThreshold: 0.005,
  volWindow: 20,
  highVolMult: 1.5,
  lowVolMult: 0.66,
};

function stdev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

// Trend regime uses fast/slow SMA slope + spread; volatility regime uses realized vol vs median.
export function classifyRegimes(bars: Bar[], config: RegimeConfig = DEFAULT_REGIME_CONFIG): { trend: Regime[]; vol: Regime[] } {
  const closes = bars.map((b) => b.close);
  const n = closes.length;
  const trend = new Array<Regime>(n).fill("range");
  const vol   = new Array<Regime>(n).fill("low_vol");

  // Rolling returns and realized vol
  const rets: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) rets[i] = closes[i - 1] > 0 ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0;

  const vols: number[] = new Array(n).fill(0);
  const W = Math.max(2, config.volWindow);
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
    const sF = sma(config.smaFast, i);
    const sS = sma(config.smaSlow, i);
    const sSp = sma(config.smaSlow, i - config.slopeLookback);
    if (sF !== null && sS !== null && sSp !== null && sSp !== 0) {
      const slope = (sS - sSp) / sSp;
      const spread = (sF - sS) / sS;
      if (slope > config.slopeThreshold && spread > config.spreadThreshold) trend[i] = "trend_up";
      else if (slope < -config.slopeThreshold && spread < -config.spreadThreshold) trend[i] = "trend_down";
      else trend[i] = "range";
    }
    if (vols[i] > 0 && medianVol > 0) {
      if (vols[i] > medianVol * config.highVolMult) vol[i] = "high_vol";
      else if (vols[i] < medianVol * config.lowVolMult) vol[i] = "low_vol";
      else vol[i] = "low_vol";
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