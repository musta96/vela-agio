import { describe, expect, it } from "vitest";
import { calculatePac } from "@/lib/investorCalculator";
const base = { initial: 1000, monthly: 200, years: 1, annualReturn: 0, annualCost: 0, inflation: 0 };
describe("Free PAC calculator", () => {
  it("adds twelve month-end contributions at zero return", () => {
    expect(calculatePac(base).nominal).toBe(3400);
  });
  it("compounds an effective annual return without monthly contributions", () => {
    expect(calculatePac({ ...base, monthly: 0, annualReturn: 10 }).nominal).toBeCloseTo(1100, 8);
  });
  it("applies growth before the month-end contribution", () => {
    const r = Math.pow(1.12, 1 / 12);
    expect(calculatePac({ ...base, initial: 0, monthly: 100, annualReturn: 12 }).nominal)
      .toBeCloseTo(100 * (Math.pow(r, 12) - 1) / (r - 1), 8);
  });
  it("applies proportional annual costs", () => {
    expect(calculatePac({ ...base, monthly: 0, annualReturn: 10, annualCost: 1 }).nominal).toBeCloseTo(1089, 8);
  });
  it("discounts the final amount for inflation", () => {
    expect(calculatePac({ ...base, monthly: 0, inflation: 2 }).real).toBeCloseTo(1000 / 1.02, 8);
  });
  it("retains losses instead of flooring returns at zero", () => {
    expect(calculatePac({ ...base, monthly: 0, annualReturn: -10 }).gain).toBeCloseTo(-100, 8);
  });
  it("rejects invalid numbers and fractional horizons", () => {
    expect(() => calculatePac({ ...base, monthly: NaN })).toThrow(RangeError);
    expect(() => calculatePac({ ...base, years: 1.5 })).toThrow(RangeError);
  });
});