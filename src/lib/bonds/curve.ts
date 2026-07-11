// Yield-curve discounting helpers. A curve is a set of (tenor, zeroRate) points,
// with linear interpolation between tenors and flat extrapolation outside the
// grid. An optional OAS spread (basis points) is added to every discount rate.

import { bondCashflows, accruedInterest, type BondInputs } from "./pricing";

export interface YieldCurvePoint { t: number; rate: number }
export type YieldCurve = YieldCurvePoint[];

/** Zero rate at maturity `t` (years). Curve is sorted ascending by `t`. */
export function curveRate(curve: YieldCurve, t: number, oasBps = 0): number {
  if (!curve.length) return 0;
  const sorted = [...curve].sort((a, b) => a.t - b.t);
  const spread = oasBps / 10000;
  if (t <= sorted[0].t) return sorted[0].rate + spread;
  if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].rate + spread;
  for (let i = 1; i < sorted.length; i++) {
    if (t <= sorted[i].t) {
      const a = sorted[i - 1], b = sorted[i];
      const w = (t - a.t) / (b.t - a.t);
      return a.rate + (b.rate - a.rate) * w + spread;
    }
  }
  return sorted[sorted.length - 1].rate + spread;
}

/** Dirty price by discounting each cashflow at its own zero rate + OAS. */
export function priceFromCurve(
  inp: Omit<BondInputs, "yieldRate">,
  curve: YieldCurve,
  oasBps = 0,
): number {
  const cfs = bondCashflows(inp);
  const frac = Math.min(0.999999, Math.max(0, inp.accruedFraction ?? 0));
  let px = 0;
  for (const cf of cfs) {
    const tYears = (cf.period - frac) / inp.frequency;
    const r = curveRate(curve, tYears, oasBps);
    px += cf.amount / Math.pow(1 + r / inp.frequency, cf.period - frac);
  }
  return px;
}

export interface CurveMetrics {
  dirtyPrice: number;
  cleanPrice: number;
  accruedInterest: number;
  effectiveDuration: number;
  effectiveConvexity: number;
  dv01: number;
  parallelShiftBps: number;
}

/**
 * Effective duration & convexity via ±1bp parallel shift of the entire curve.
 * This is the standard OAS-consistent measure used by fixed-income desks.
 */
export function bondMetricsFromCurve(
  inp: Omit<BondInputs, "yieldRate">,
  curve: YieldCurve,
  oasBps = 0,
): CurveMetrics {
  const bp = 1;
  const p0 = priceFromCurve(inp, curve, oasBps);
  const pUp = priceFromCurve(inp, curve, oasBps + bp);
  const pDn = priceFromCurve(inp, curve, oasBps - bp);
  const dy = bp / 10000;
  const effDur = p0 > 0 ? (pDn - pUp) / (2 * p0 * dy) : 0;
  const effCvx = p0 > 0 ? (pUp + pDn - 2 * p0) / (p0 * dy * dy) : 0;
  const ai = accruedInterest(inp);
  return {
    dirtyPrice: p0,
    cleanPrice: p0 - ai,
    accruedInterest: ai,
    effectiveDuration: effDur,
    effectiveConvexity: effCvx,
    dv01: effDur * p0 * 0.0001,
    parallelShiftBps: bp,
  };
}