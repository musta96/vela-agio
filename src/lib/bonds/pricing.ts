// Bond pricing, YTM (Newton-Raphson), Macaulay/Modified duration & convexity.
// All inputs use decimal rates (0.05 = 5%). Face value defaults to 100.
// Supports day-count conventions, settlement date and accrued interest so that
// clean vs dirty pricing lines up with market quoting practice.

export type DayCount = "ACT/360" | "ACT/365" | "30/360";
export type BondType = "fixed" | "zero" | "callable" | "putable";

export interface BondInputs {
  face: number;          // par value (default 100)
  couponRate: number;    // annual coupon rate, decimal
  yearsToMaturity: number;
  frequency: number;     // coupons per year (1, 2, 4, 12)
  yieldRate: number;     // annual YTM, decimal (for price/duration/convexity)
  dayCount?: DayCount;
  bondType?: BondType;
  /** Fraction of the current coupon period already accrued at settlement, in [0,1). */
  accruedFraction?: number;
}

export interface CashFlow { period: number; t: number; amount: number; pv: number }

export interface BondMetrics {
  price: number;
  cleanPrice: number;
  cashflows: CashFlow[];
  macaulayDuration: number; // years
  modifiedDuration: number; // years
  convexity: number;        // years^2
  currentYield: number;     // annual coupon / price
  dv01: number;             // dollar change per 1bp yield move (per 100 face)
  accruedInterest: number;
  dirtyPrice: number;
}

/**
 * Day-count fraction between two dates. Simplified but market-consistent.
 */
export function yearFraction(start: Date, end: Date, dc: DayCount = "ACT/365"): number {
  const ms = end.getTime() - start.getTime();
  const days = ms / 86_400_000;
  if (dc === "ACT/360") return days / 360;
  if (dc === "ACT/365") return days / 365;
  // 30/360 (US)
  let d1 = start.getUTCDate();
  let d2 = end.getUTCDate();
  const m1 = start.getUTCMonth() + 1;
  const m2 = end.getUTCMonth() + 1;
  const y1 = start.getUTCFullYear();
  const y2 = end.getUTCFullYear();
  if (d1 === 31) d1 = 30;
  if (d2 === 31 && d1 === 30) d2 = 30;
  return ((y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1)) / 360;
}

export function bondCashflows(inp: Omit<BondInputs, "yieldRate">): { period: number; t: number; amount: number }[] {
  const type: BondType = inp.bondType ?? "fixed";
  const n = Math.max(1, Math.round(inp.yearsToMaturity * inp.frequency));
  const out: { period: number; t: number; amount: number }[] = [];
  if (type === "zero") {
    out.push({ period: n, t: inp.yearsToMaturity, amount: inp.face });
    return out;
  }
  const c = (inp.couponRate * inp.face) / inp.frequency;
  for (let k = 1; k <= n; k++) {
    const amt = c + (k === n ? inp.face : 0);
    out.push({ period: k, t: k / inp.frequency, amount: amt });
  }
  return out;
}

/** PV of remaining cashflows, discounting from settlement (fractional first period). */
export function priceAtYield(inp: Omit<BondInputs, "yieldRate">, y: number): number {
  const cfs = bondCashflows(inp);
  const r = y / inp.frequency;
  const frac = Math.min(0.999999, Math.max(0, inp.accruedFraction ?? 0));
  let px = 0;
  for (const cf of cfs) {
    const exp = cf.period - frac;
    px += cf.amount / Math.pow(1 + r, exp);
  }
  return px;
}

export function accruedInterest(inp: Omit<BondInputs, "yieldRate">): number {
  if ((inp.bondType ?? "fixed") === "zero") return 0;
  const c = (inp.couponRate * inp.face) / inp.frequency;
  const frac = Math.min(0.999999, Math.max(0, inp.accruedFraction ?? 0));
  return c * frac;
}

export function bondMetrics(inp: BondInputs): BondMetrics {
  const cfs = bondCashflows(inp);
  const r = inp.yieldRate / inp.frequency;
  const frac = Math.min(0.999999, Math.max(0, inp.accruedFraction ?? 0));
  let dirty = 0;
  let weightedT = 0;
  let convexNum = 0;
  const enriched: CashFlow[] = cfs.map((cf) => {
    const exp = cf.period - frac;
    const pv = cf.amount / Math.pow(1 + r, exp);
    dirty += pv;
    weightedT += pv * (exp / inp.frequency);
    convexNum += pv * exp * (exp + 1);
    return { ...cf, pv };
  });
  const macaulay = dirty > 0 ? weightedT : 0;
  const modified = macaulay / (1 + r);
  const convexity =
    dirty > 0
      ? (convexNum / (dirty * Math.pow(1 + r, 2))) / (inp.frequency * inp.frequency)
      : 0;
  const ai = accruedInterest(inp);
  const clean = dirty - ai;
  const currentYield = clean > 0 ? (inp.couponRate * inp.face) / clean : 0;
  const dv01 = modified * dirty * 0.0001;
  return {
    price: dirty,
    cleanPrice: clean,
    dirtyPrice: dirty,
    accruedInterest: ai,
    cashflows: enriched,
    macaulayDuration: macaulay,
    modifiedDuration: modified,
    convexity,
    currentYield,
    dv01,
  };
}

/**
 * Solve for YTM given a target price via Newton-Raphson, falling back to
 * bisection if the derivative misbehaves. Returns decimal annual yield.
 */
export function yieldToMaturity(
  inp: Omit<BondInputs, "yieldRate">,
  targetPrice: number,
  guess = 0.05,
): number {
  const f = (y: number) => priceAtYield(inp, y) - targetPrice;
  // Newton
  let y = Math.max(1e-6, guess);
  for (let i = 0; i < 60; i++) {
    const px = priceAtYield(inp, y);
    const eps = 1e-5;
    const dpx = (priceAtYield(inp, y + eps) - px) / eps;
    if (!Number.isFinite(dpx) || Math.abs(dpx) < 1e-10) break;
    const yNext = y - (px - targetPrice) / dpx;
    if (!Number.isFinite(yNext) || yNext <= 0) break;
    if (Math.abs(yNext - y) < 1e-9) return yNext;
    y = yNext;
  }
  // Bisection fallback
  let lo = 1e-6, hi = 1.0;
  let fLo = f(lo), fHi = f(hi);
  let expand = 0;
  while (fLo * fHi > 0 && expand < 20) {
    hi *= 2; fHi = f(hi); expand++;
  }
  if (fLo * fHi > 0) return y;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-8) return mid;
    if (fLo * fm < 0) { hi = mid; fHi = fm; } else { lo = mid; fLo = fm; }
  }
  return (lo + hi) / 2;
}

/** Convexity-adjusted price change estimate for a yield shock (bps). */
export function estimatePriceChange(
  metrics: BondMetrics,
  yieldShockBps: number,
): { pct: number; dollar: number } {
  const dy = yieldShockBps / 10000;
  const pct = -metrics.modifiedDuration * dy + 0.5 * metrics.convexity * dy * dy;
  return { pct, dollar: pct * metrics.price };
}