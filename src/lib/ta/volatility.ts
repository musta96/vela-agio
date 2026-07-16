// Volatility toolkit: ATR percentile, realized vol z-score, Bollinger squeeze.
// Used by the Volatility card and the "vol-breakout" preset.

import type { Bar } from "./types";

export interface VolatilityMetrics {
  atr14: number;
  atrPct: number;          // ATR as % of last close
  atrPercentile: number;   // 0..1 percentile of atrPct over the last 252 bars
  realizedVolAnnualPct: number; // stdev of log returns * sqrt(252)
  realizedZ: number;       // z-score of latest 20-bar rv vs its own history
  squeezeRatio: number;    // BBwidth / KCwidth (Bollinger inside Keltner → <1 = squeeze)
  regime: "low" | "normal" | "elevated" | "extreme";
  breakoutReady: boolean;  // low ATR percentile + squeeze
  expanding: boolean;      // ATR percentile rising over last 10 bars
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}

export function computeVolatility(bars: Bar[]): VolatilityMetrics | null {
  if (bars.length < 30) return null;
  const tr: number[] = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], p = bars[i - 1];
    tr[i] = Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
  }
  const atrSeries: number[] = new Array(bars.length).fill(0);
  const win = 14;
  for (let i = win; i < bars.length; i++) {
    let s = 0;
    for (let k = i - win + 1; k <= i; k++) s += tr[k];
    atrSeries[i] = s / win;
  }
  const last = bars[bars.length - 1].close;
  const atr14 = atrSeries[atrSeries.length - 1];
  const atrPctSeries = atrSeries.map((a, i) => (bars[i].close > 0 ? (a / bars[i].close) * 100 : 0));
  const window = atrPctSeries.slice(Math.max(0, atrPctSeries.length - 252));
  const sorted = [...window].filter((v) => v > 0).sort((a, b) => a - b);
  const lastAtrPct = atrPctSeries[atrPctSeries.length - 1];
  const rank = sorted.findIndex((v) => v >= lastAtrPct);
  const atrPercentile = rank < 0 ? 1 : rank / Math.max(1, sorted.length - 1);

  // Realized vol: 20-bar stdev of log returns, annualized.
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const r = Math.log(bars[i].close / bars[i - 1].close);
    if (isFinite(r)) rets.push(r);
  }
  const last20 = rets.slice(-20);
  const rv = stddev(last20) * Math.sqrt(252) * 100;
  const rvHistory: number[] = [];
  for (let i = 20; i < rets.length; i++) {
    rvHistory.push(stddev(rets.slice(i - 20, i)) * Math.sqrt(252) * 100);
  }
  const mean = rvHistory.reduce((a, b) => a + b, 0) / (rvHistory.length || 1);
  const sd = stddev(rvHistory);
  const realizedZ = sd > 0 ? (rv - mean) / sd : 0;

  // Squeeze: BB(20,2) width vs Keltner(20,1.5 ATR) width.
  const closes = bars.map((b) => b.close);
  const smaWin = closes.slice(-20);
  const smaVal = smaWin.reduce((a, b) => a + b, 0) / 20;
  const bbSD = stddev(smaWin);
  const bbWidth = 4 * bbSD;                    // upper − lower
  const kcWidth = 3 * atr14;                   // upper − lower (1.5 ATR each side)
  const squeezeRatio = kcWidth > 0 ? bbWidth / kcWidth : 1;

  const regime: VolatilityMetrics["regime"] =
    atrPercentile < 0.2 ? "low"
    : atrPercentile < 0.6 ? "normal"
    : atrPercentile < 0.85 ? "elevated"
    : "extreme";

  // Expansion trend: is ATR% percentile rising?
  const p10 = atrPctSeries.slice(-11, -1);
  const p10Rank = p10.length ? p10.reduce((a, b) => a + b, 0) / p10.length : lastAtrPct;
  const expanding = lastAtrPct > p10Rank * 1.1;

  return {
    atr14,
    atrPct: (atr14 / last) * 100,
    atrPercentile,
    realizedVolAnnualPct: rv,
    realizedZ,
    squeezeRatio,
    regime,
    breakoutReady: atrPercentile < 0.25 && squeezeRatio < 1,
    expanding,
  };
}