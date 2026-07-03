/**
 * Focused entitlement resolution for the "plus" tier.
 *
 * The pricing UI, PlanConfirmDialog, and gating code all read entitlements
 * out of PLAN_FEATURES via `tierAtLeast` / `requiredTierFor`. These asserts
 * pin down the plus row so a future edit to `planFeatures.ts` that
 * accidentally drops a feature is caught here before it ships.
 */
import { describe, it, expect } from "vitest";
import {
  PLAN_FEATURES,
  PLAN_ORDER,
  normalizePlanSlug,
  requiredTierFor,
  tierAtLeast,
} from "@/lib/planFeatures";

describe("PLAN_FEATURES · plus tier", () => {
  const plus = PLAN_FEATURES.plus;

  it("is registered in the canonical plan order between explorer and pro", () => {
    expect(PLAN_ORDER).toEqual(["explorer", "plus", "pro", "enterprise"]);
    expect(plus.slug).toBe("plus");
    expect(plus.name).toBe("Plus");
  });

  it("exposes stable pricing and Stripe lookup keys for both cadences", () => {
    expect(plus.priceMonthly).toBe(12);
    expect(plus.priceAnnualMonthly).toBe(9);
    expect(plus.priceAnnualTotal).toBe(108);
    expect(plus.lookupKey).toEqual({ monthly: "plus_monthly", annual: "plus_annual" });
    // Annual cadence must actually save money vs paying month by month.
    expect(plus.priceAnnualTotal).toBeLessThan(plus.priceMonthly * 12);
  });

  it("resolves feature flags exactly as the pricing table advertises", () => {
    expect(plus.features).toEqual({
      ai_questions_per_day: 100,
      live_data: true,
      portfolio_sync: true,
      alerts: true,
      backtesting: false,
      compliance_tools: false,
      report_export: false,
      api_access: false,
      advisor_seats: 0,
    });
  });

  it("tierAtLeast places plus above explorer and below pro/enterprise", () => {
    expect(tierAtLeast("plus", "explorer")).toBe(true);
    expect(tierAtLeast("plus", "plus")).toBe(true);
    expect(tierAtLeast("plus", "pro")).toBe(false);
    expect(tierAtLeast("plus", "enterprise")).toBe(false);
    expect(tierAtLeast("pro", "plus")).toBe(true);
    expect(tierAtLeast("enterprise", "plus")).toBe(true);
  });

  it("requiredTierFor returns plus for features plus is the cheapest tier to unlock", () => {
    expect(requiredTierFor((f) => f.live_data)).toBe("plus");
    expect(requiredTierFor((f) => f.portfolio_sync)).toBe("plus");
    expect(requiredTierFor((f) => f.alerts)).toBe("plus");
    expect(requiredTierFor((f) => (f.ai_questions_per_day ?? 0) >= 50)).toBe("plus");
    // Features plus does NOT include stay pinned to higher tiers.
    expect(requiredTierFor((f) => f.backtesting)).toBe("pro");
    expect(requiredTierFor((f) => f.api_access)).toBe("enterprise");
  });

  it("normalizePlanSlug preserves plus and rejects legacy synonyms", () => {
    expect(normalizePlanSlug("plus")).toBe("plus");
    expect(normalizePlanSlug("PLUS")).toBe("plus");
    // Unknown / legacy strings fall back to explorer, never silently to plus.
    expect(normalizePlanSlug("free")).toBe("explorer");
    expect(normalizePlanSlug("elite")).toBe("enterprise");
    expect(normalizePlanSlug(null)).toBe("explorer");
  });
});
