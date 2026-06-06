/**
 * Performance + liquidity helpers used by consolidated reporting.
 * All inputs are expressed in the report's base currency.
 */

export interface CashFlow {
  /** ISO date */
  date: string;
  /** Positive = contribution into portfolio, negative = withdrawal */
  amount: number;
}

/**
 * Time-Weighted Return over a series of period returns (decimal, e.g. 0.012).
 * Removes the impact of contributions/withdrawals — apples-to-apples vs. benchmark.
 */
export function timeWeightedReturn(periodReturns: number[]): number {
  if (!periodReturns.length) return 0;
  return periodReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
}

/**
 * Money-weighted return (IRR) on cash flows + a terminal value, solved via bisection.
 * Returns an annualised rate. Each cash-flow `amount` is the signed amount on `date`;
 * `terminalValue` is the portfolio value on the final date (positive, treated as a final outflow).
 */
export function moneyWeightedReturn(
  flows: CashFlow[],
  terminalValue: number,
  terminalDate: string,
): number {
  if (!flows.length) return 0;
  const start = new Date(flows[0].date).getTime();
  const end = new Date(terminalDate).getTime();
  if (!(end > start)) return 0;

  const cf = [
    ...flows.map((f) => ({
      t: (new Date(f.date).getTime() - start) / (365 * 24 * 3600 * 1000),
      v: f.amount,
    })),
    { t: (end - start) / (365 * 24 * 3600 * 1000), v: -terminalValue },
  ];

  const npv = (rate: number) =>
    cf.reduce((s, { t, v }) => s + v / Math.pow(1 + rate, t), 0);

  // Bisect between -0.999 and +10 (1000% per year cap)
  let lo = -0.999;
  let hi = 10;
  let nlo = npv(lo);
  let nhi = npv(hi);
  if (nlo * nhi > 0) return Number.NaN; // No sign change → no real IRR
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const nmid = npv(mid);
    if (Math.abs(nmid) < 1e-6) return mid;
    if (nmid * nlo < 0) { hi = mid; nhi = nmid; } else { lo = mid; nlo = nmid; }
  }
  return (lo + hi) / 2;
}

export type LiquidityBucket = "T+0" | "T+1" | "T+3" | "1w" | "1m" | ">1m";

export interface LiquidityRow {
  bucket: LiquidityBucket;
  marketValue: number;
  weightPct: number;
}

const BUCKET_ORDER: LiquidityBucket[] = ["T+0", "T+1", "T+3", "1w", "1m", ">1m"];

/** Bucket each holding into a settlement bucket based on instrument type. */
export function liquidityLadder(
  holdings: Array<{ value: number; type?: string | null }>,
): LiquidityRow[] {
  const totals: Record<LiquidityBucket, number> = {
    "T+0": 0, "T+1": 0, "T+3": 0, "1w": 0, "1m": 0, ">1m": 0,
  };
  for (const h of holdings) {
    const t = (h.type || "equity").toLowerCase();
    let bucket: LiquidityBucket = "T+3";
    if (t === "cash" || t === "money_market") bucket = "T+0";
    else if (t === "etf" || t === "equity" || t === "stock") bucket = "T+1";
    else if (t === "bond" || t === "fixed_income") bucket = "T+3";
    else if (t === "fund" || t === "mutual_fund") bucket = "1w";
    else if (t === "private" || t === "real_estate" || t === "alternative") bucket = ">1m";
    totals[bucket] += Math.max(0, Number(h.value || 0));
  }
  const sum = Object.values(totals).reduce((s, v) => s + v, 0) || 1;
  return BUCKET_ORDER.map((b) => ({
    bucket: b,
    marketValue: totals[b],
    weightPct: (totals[b] / sum) * 100,
  }));
}