/**
 * Contract test between Upgrade.tsx and PLAN_FEATURES.
 *
 * Upgrade.tsx reads `PLAN_FEATURES[slug].contactSales` (to route the
 * Enterprise switcher to sales) and `PLAN_FEATURES[slug].highlighted`
 * (to decide which self-serve card gets the filled CTA). If a supported
 * slug ever loses either field — or the field flips shape — those
 * branches silently break.
 *
 * The set of slugs enforced here mirrors the plan lists in Upgrade.tsx:
 *   SELF_SERVE_PLANS   = plus, pro
 *   SWITCHABLE_PLANS   = plus, pro, enterprise
 *
 * Update this array in the same PR that changes Upgrade.tsx.
 */
import { describe, it, expect } from "vitest";
import { PLAN_FEATURES, type PlanSlug } from "@/lib/planFeatures";

const UPGRADE_PAGE_SLUGS = ["plus", "pro", "enterprise"] as const satisfies readonly PlanSlug[];
type UpgradeSlug = (typeof UPGRADE_PAGE_SLUGS)[number];

// Locked expectations. `undefined` means "field must be explicitly
// absent/falsy" — matches how Upgrade.tsx reads it (`.contactSales` /
// `.highlighted` are truthy-checked, so `false` or `undefined` both
// behave the same, and we accept either).
const EXPECTED: Record<UpgradeSlug, { contactSales: boolean; highlighted: boolean }> = {
  plus:       { contactSales: false, highlighted: false },
  pro:        { contactSales: false, highlighted: true  },
  enterprise: { contactSales: true,  highlighted: false },
};

describe("PLAN_FEATURES contract for Upgrade.tsx", () => {
  it.each(UPGRADE_PAGE_SLUGS)(
    "%s has a definition in PLAN_FEATURES",
    (slug) => {
      expect(PLAN_FEATURES[slug], `missing PLAN_FEATURES["${slug}"]`).toBeDefined();
      expect(PLAN_FEATURES[slug].slug).toBe(slug);
    },
  );

  it.each(UPGRADE_PAGE_SLUGS)(
    "%s exposes contactSales as boolean|undefined (Upgrade.tsx reads it as truthy)",
    (slug) => {
      const v = PLAN_FEATURES[slug].contactSales;
      expect(v === undefined || typeof v === "boolean").toBe(true);
      expect(Boolean(v)).toBe(EXPECTED[slug].contactSales);
    },
  );

  it.each(UPGRADE_PAGE_SLUGS)(
    "%s exposes highlighted as boolean|undefined (Upgrade.tsx reads it as truthy)",
    (slug) => {
      const v = PLAN_FEATURES[slug].highlighted;
      expect(v === undefined || typeof v === "boolean").toBe(true);
      expect(Boolean(v)).toBe(EXPECTED[slug].highlighted);
    },
  );

  it("exactly one plan among the Upgrade slugs is highlighted (the CTA anchor)", () => {
    const highlighted = UPGRADE_PAGE_SLUGS.filter((s) => PLAN_FEATURES[s].highlighted);
    expect(highlighted, "Upgrade.tsx assumes one highlighted plan").toHaveLength(1);
  });

  it("exactly one plan among the Upgrade slugs routes to sales", () => {
    const sales = UPGRADE_PAGE_SLUGS.filter((s) => PLAN_FEATURES[s].contactSales);
    expect(sales, "Upgrade.tsx assumes one contact-sales plan").toHaveLength(1);
  });
});