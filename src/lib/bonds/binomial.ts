// Callable / putable bond pricing via a log-normal short-rate binomial tree
// (Black-Derman-Toy style, constant volatility). We build the tree with time
// step Δt = 1/frequency, calibrated so the root short rate equals the current
// YTM. Backward induction adds coupons on coupon dates and applies call/put
// optionality using the user-provided schedule.
//
// This is a teaching-grade model: it captures the qualitative behaviour of
// embedded options (negative convexity for callables, price floor for
// putables) without pretending to be a production BDT calibration.

import { bondCashflows, type BondInputs } from "./pricing";

export interface CallPutEntry {
  /** Time (in years from settlement) at which the option becomes exercisable. */
  time: number;
  /** Strike price (per 100 face-value equivalent — scaled with face internally). */
  price: number;
}
export type CallPutSchedule = CallPutEntry[];

export interface BinomialInputs extends Omit<BondInputs, "yieldRate"> {
  /** Initial short-rate anchor (usually the current YTM). */
  shortRate: number;
  /** Annualised short-rate volatility (log-normal). */
  volatility: number;
  calls?: CallPutSchedule;
  puts?: CallPutSchedule;
}

export interface BinomialResult {
  price: number;         // dirty price
  effectiveDuration: number;
  effectiveConvexity: number;
  dv01: number;
  oas?: number;          // filled when solving for OAS
}

/** Build the short-rate tree and price the bond by backward induction. */
export function binomialBondPrice(inp: BinomialInputs, rateShiftBps = 0): number {
  const freq = inp.frequency;
  const n = Math.max(1, Math.round(inp.yearsToMaturity * freq));
  const dt = 1 / freq;
  const r0 = Math.max(1e-6, inp.shortRate + rateShiftBps / 10000);
  const sigma = Math.max(0, inp.volatility);
  const u = Math.exp(sigma * Math.sqrt(dt));
  // Node rate: r(i,j) = r0 * u^(2j - i), j = 0..i (j = # of up moves)
  const rate = (i: number, j: number) => r0 * Math.pow(u, 2 * j - i);
  const df = (i: number, j: number) => 1 / (1 + rate(i, j) * dt);

  // Cashflows keyed by step index (coupons at step 1..n, principal folded in at n).
  const cfs = bondCashflows(inp);
  const cfByStep = new Map<number, number>();
  for (const c of cfs) cfByStep.set(c.period, c.amount);

  // Terminal: bond has redeemed, no residual value at step n.
  let values: number[] = new Array(n + 1).fill(0);

  // Sort schedules once; strike is quoted per 100 → scale to face.
  const scale = inp.face / 100;
  const scaled = (s?: CallPutSchedule) => (s ?? []).map((e) => ({ ...e, price: e.price * scale }));
  const calls = scaled(inp.calls).sort((a, b) => a.time - b.time);
  const puts = scaled(inp.puts).sort((a, b) => a.time - b.time);

  // Backward induction from step n-1 down to 0.
  for (let i = n - 1; i >= 0; i--) {
    const next: number[] = new Array(i + 1);
    const tYears = i * dt;
    const cfNext = cfByStep.get(i + 1) ?? 0; // cashflow received at end of this step
    // Most restrictive call/put in force at time slice i (exercise decision is
    // ex-coupon, on the continuation value).
    const call = [...calls].reverse().find((c) => c.time <= tYears + 1e-9);
    const put = [...puts].reverse().find((p) => p.time <= tYears + 1e-9);
    for (let j = 0; j <= i; j++) {
      const contUp = values[j + 1] + cfNext;
      const contDn = values[j] + cfNext;
      let v = df(i, j) * 0.5 * (contUp + contDn);
      if (call !== undefined && v > call.price) v = call.price;   // issuer calls
      if (put !== undefined && v < put.price) v = put.price;      // holder puts
      next[j] = v;
    }
    values = next;
  }
  return values[0];
}

/** Effective duration & convexity via ±10bp shifts of the anchor short rate. */
export function binomialMetrics(inp: BinomialInputs): BinomialResult {
  const bp = 10;
  const p0 = binomialBondPrice(inp, 0);
  const pUp = binomialBondPrice(inp, +bp);
  const pDn = binomialBondPrice(inp, -bp);
  const dy = bp / 10000;
  const effDur = p0 > 0 ? (pDn - pUp) / (2 * p0 * dy) : 0;
  const effCvx = p0 > 0 ? (pUp + pDn - 2 * p0) / (p0 * dy * dy) : 0;
  return {
    price: p0,
    effectiveDuration: effDur,
    effectiveConvexity: effCvx,
    dv01: effDur * p0 * 0.0001,
  };
}

/**
 * Solve for the OAS (parallel short-rate shift, bps) that makes the tree
 * reproduce a target market price. Bisection over ±500 bps.
 */
export function solveOAS(inp: BinomialInputs, targetPrice: number): number {
  let lo = -500, hi = 500;
  const f = (bps: number) => binomialBondPrice(inp, bps) - targetPrice;
  let fLo = f(lo), fHi = f(hi);
  if (fLo * fHi > 0) return 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-6) return mid;
    if (fLo * fm < 0) { hi = mid; fHi = fm; } else { lo = mid; fLo = fm; }
  }
  return (lo + hi) / 2;
}