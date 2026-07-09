// Bond pricing, YTM (Newton-Raphson), Macaulay/Modified duration & convexity.
// All inputs use decimal rates (0.05 = 5%). Face value defaults to 100.
// Assumes end-of-period coupons; settlement mid-period is out-of-scope.

export interface BondInputs {
  face: number;          // par value (default 100)
  couponRate: number;    // annual coupon rate, decimal
  yearsToMaturity: number;
  frequency: number;     // coupons per year (1, 2, 4, 12)
  yieldRate: number;     // annual YTM, decimal (for price/duration/convexity)
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
}

export function bondCashflows(inp: Omit<BondInputs, "yieldRate">): { period: number; t: number; amount: number }[] {
  const n = Math.max(1, Math.round(inp.yearsToMaturity * inp.frequency));
  const c = (inp.couponRate * inp.face) / inp.frequency;
  const out = [];
  for (let k = 1; k <= n; k++) {
    const amt = c + (k === n ? inp.face : 0);
    out.push({ period: k, t: k / inp.frequency, amount: amt });
  }
  return out;
}

export function priceAtYield(inp: Omit<BondInputs, "yieldRate">, y: number): number {
  const cfs = bondCashflows(inp);
  const r = y / inp.frequency;
  let px = 0;
  for (const cf of cfs) px += cf.amount / Math.pow(1 + r, cf.period);
  return px;
}

export function bondMetrics(inp: BondInputs): BondMetrics {
  const cfs = bondCashflows(inp);
  const r = inp.yieldRate / inp.frequency;
  let price = 0;
  let weightedT = 0;
  let convexNum = 0;
  const enriched: CashFlow[] = cfs.map((cf) => {
    const pv = cf.amount / Math.pow(1 + r, cf.period);
    price += pv;
    weightedT += pv * cf.t;
    convexNum += pv * cf.period * (cf.period + 1);
    return { ...cf, pv };
  });
  const macaulay = price > 0 ? weightedT / price : 0;
  const modified = macaulay / (1 + r);
  const convexity =
    price > 0
      ? (convexNum / (price * Math.pow(1 + r, 2))) / (inp.frequency * inp.frequency)
      : 0;
  const currentYield = price > 0 ? (inp.couponRate * inp.face) / price : 0;
  const dv01 = modified * price * 0.0001;
  return {
    price,
    cleanPrice: price, // no accrued in mid-period model
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