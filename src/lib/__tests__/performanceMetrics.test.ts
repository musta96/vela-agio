import { describe, it, expect } from "vitest";
import { timeWeightedReturn, moneyWeightedReturn, liquidityLadder } from "@/lib/performanceMetrics";

describe("performanceMetrics", () => {
  it("TWR compounds period returns and ignores contributions implicitly", () => {
    const r = timeWeightedReturn([0.1, 0.1]);
    expect(r).toBeCloseTo(0.21, 5);
  });

  it("TWR returns 0 for empty input", () => {
    expect(timeWeightedReturn([])).toBe(0);
  });

  it("MWR (IRR) of a single +100 invested today → +110 in 1y is ~10%", () => {
    const today = new Date();
    const oneY = new Date(today.getTime() + 365 * 24 * 3600 * 1000);
    const irr = moneyWeightedReturn(
      [{ date: today.toISOString(), amount: 100 }],
      110,
      oneY.toISOString(),
    );
    expect(irr).toBeGreaterThan(0.09);
    expect(irr).toBeLessThan(0.11);
  });

  it("liquidity ladder buckets cash as T+0 and private as >1m", () => {
    const rows = liquidityLadder([
      { value: 100, type: "cash" },
      { value: 100, type: "equity" },
      { value: 100, type: "private" },
    ]);
    const byBucket = Object.fromEntries(rows.map((r) => [r.bucket, r.marketValue]));
    expect(byBucket["T+0"]).toBe(100);
    expect(byBucket["T+1"]).toBe(100);
    expect(byBucket[">1m"]).toBe(100);
    const total = rows.reduce((s, r) => s + r.weightPct, 0);
    expect(total).toBeCloseTo(100, 1);
  });
});