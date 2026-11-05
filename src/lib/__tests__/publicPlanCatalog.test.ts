import { describe, expect, it } from "vitest";
import { PUBLIC_PLAN_LIMITS, PUBLIC_PLAN_COMPARISON } from "@/data/publicPlanCatalog";

describe("Verified public plan facts (presentation only)", () => {
  it("uses Plus's enforced 500 monthly quota, not the 3000 entitlement metadata cap", () => {
    expect(PUBLIC_PLAN_LIMITS.plus.aiMonthlyQuota).toBe(500);
    expect(PUBLIC_PLAN_LIMITS.plus.hostedAi).toBe(true);
  });
  it("does not advertise Pro as unlimited: the AI resolver enforces 2000 monthly", () => {
    expect(PUBLIC_PLAN_LIMITS.pro.aiMonthlyQuota).toBe(2000);
  });
  it("does not treat Explorer's 150 metadata quota as standard hosted AI access", () => {
    expect(PUBLIC_PLAN_LIMITS.explorer.aiMonthlyQuota).toBe(150);
    expect(PUBLIC_PLAN_LIMITS.explorer.hostedAi).toBe(false);
  });
  it("does not treat Enterprise's -1 quota as access when its model tier is none", () => {
    expect(PUBLIC_PLAN_LIMITS.enterprise.aiMonthlyQuota).toBe(-1);
    expect(PUBLIC_PLAN_LIMITS.enterprise.hostedAi).toBe(false);
  });
  it("matches configured Explorer tracking allowances", () => {
    expect(PUBLIC_PLAN_LIMITS.explorer).toMatchObject({ portfolios: 1, positions: 10, watchlist: 5 });
  });
  it("reflects the existing backtest entitlement without extending Plus access", () => {
    const row = PUBLIC_PLAN_COMPARISON.flatMap(group => group.rows).find(row => row.label === "Backtesting engine");
    expect(row?.values).toEqual({ explorer: false, plus: false, pro: true, enterprise: true });
  });
});