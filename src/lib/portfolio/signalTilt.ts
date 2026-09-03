/**
 * Links the advanced backtest signal statistics to the portfolio Monte Carlo
 * engine.
 *
 * The advanced detectors (candlesticks, S/R, order blocks, liquidity sweeps,
 * trendlines, Fibonacci, anchored VWAP, volume profile) produce a per-signal
 * forward-return report. This module turns that evidence into a bounded,
 * explainable adjustment of the simulation inputs:
 *
 *  - `driftDelta` shifts the annualised drift μ of the asset
 *  - `volFactor`  scales the annualised volatility σ of the asset
 *
 * Both are deliberately clamped: signal statistics are noisy small-sample
 * estimates, so they tilt a simulation, they never drive it. Pure functions,
 * no network, no side effects — safe to unit test and to run in a worker.
 */

import type { SignalStat } from "@/lib/backtest/signalReport";
import type { SimAsset } from "@/lib/portfolioSimulation";

export interface SignalTiltConfig {
  /** Max absolute annualised drift shift, e.g. 0.06 = ±6pp. */
  maxDriftShift: number;
  /** Max relative volatility increase from signal disagreement, e.g. 0.25 = +25%. */
  maxVolShift: number;
  /** Signal kinds with fewer observations than this are ignored. */
  minSignals: number;
  /** Forward-return horizon (bars) used to build the signal report. */
  horizonDays: number;
}

export const DEFAULT_SIGNAL_TILT: SignalTiltConfig = {
  maxDriftShift: 0.06,
  maxVolShift: 0.25,
  minSignals: 3,
  horizonDays: 10,
};

/** Annualised edge that maps to a full-strength tilt (50pp/yr). */
const FULL_TILT_EDGE = 0.5;

export interface SymbolTilt {
  symbol: string;
  /** −1..1 aggregate directional evidence. */
  score: number;
  /** Annualised drift shift applied to μ. */
  driftDelta: number;
  /** Multiplicative factor applied to σ (>= 1). */
  volFactor: number;
  /** Total observations behind the tilt. */
  signals: number;
  /** Number of distinct signal kinds that qualified. */
  kinds: number;
  /** Weighted annualised edge before clamping — useful for tooltips. */
  annualisedEdge: number;
  /** Weighted win rate of the qualifying signal kinds (0..100). */
  winRate: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const EMPTY = (symbol: string): SymbolTilt => ({
  symbol, score: 0, driftDelta: 0, volFactor: 1,
  signals: 0, kinds: 0, annualisedEdge: 0, winRate: 0,
});

/**
 * Aggregate one symbol's signal report into a bounded simulation tilt.
 * Each qualifying signal kind contributes its annualised average forward
 * return, weighted by how many observations support it.
 */
export function computeSymbolTilt(
  symbol: string,
  stats: SignalStat[],
  config: SignalTiltConfig = DEFAULT_SIGNAL_TILT,
): SymbolTilt {
  const horizon = Math.max(1, config.horizonDays);
  const qualifying = (stats ?? []).filter(
    (s) => s.signals >= config.minSignals && Number.isFinite(s.averageReturn),
  );
  if (!qualifying.length) return EMPTY(symbol);

  const periodsPerYear = 252 / horizon;
  const weights = qualifying.map((s) => s.signals);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return EMPTY(symbol);

  const annual = qualifying.map((s) => (s.averageReturn / 100) * periodsPerYear);
  const weightedEdge = annual.reduce((acc, a, i) => acc + a * weights[i], 0) / totalWeight;
  const winRate = qualifying.reduce((acc, s, i) => acc + s.winRate * weights[i], 0) / totalWeight;

  // Disagreement across signal kinds widens the simulated distribution.
  const mean = annual.reduce((a, b) => a + b, 0) / annual.length;
  const variance = annual.length > 1
    ? annual.reduce((acc, a) => acc + (a - mean) ** 2, 0) / (annual.length - 1)
    : 0;
  const dispersion = clamp(Math.sqrt(variance) / FULL_TILT_EDGE, 0, 1);

  const score = clamp(weightedEdge / FULL_TILT_EDGE, -1, 1);
  return {
    symbol,
    score,
    driftDelta: score * config.maxDriftShift,
    volFactor: 1 + dispersion * config.maxVolShift,
    signals: totalWeight,
    kinds: qualifying.length,
    annualisedEdge: weightedEdge,
    winRate,
  };
}

/** Apply per-symbol tilts to the simulation assets. Weights are untouched. */
export function applySignalTilts(assets: SimAsset[], tilts: SymbolTilt[]): SimAsset[] {
  const bySymbol = new Map(tilts.map((t) => [t.symbol, t]));
  return assets.map((a) => {
    const tilt = bySymbol.get(a.symbol);
    if (!tilt) return a;
    return {
      ...a,
      mu: a.mu + tilt.driftDelta,
      sigma: Math.max(1e-6, a.sigma * tilt.volFactor),
    };
  });
}

/** Portfolio-level summary of the applied tilts, weighted by allocation. */
export function portfolioTiltSummary(assets: SimAsset[], tilts: SymbolTilt[]) {
  const total = assets.reduce((s, a) => s + a.weight, 0) || 1;
  const bySymbol = new Map(tilts.map((t) => [t.symbol, t]));
  let drift = 0;
  let vol = 0;
  let signals = 0;
  for (const a of assets) {
    const tilt = bySymbol.get(a.symbol);
    if (!tilt) continue;
    const w = a.weight / total;
    drift += w * tilt.driftDelta;
    vol += w * (tilt.volFactor - 1);
    signals += tilt.signals;
  }
  return { driftDelta: drift, volShift: vol, signals };
}
