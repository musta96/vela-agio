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

// Every slug in the PlanSlug union. Extend when a new tier is added — the
// `satisfies` clause makes TS fail here if this list drifts from the union.
const ALL_PLAN_SLUGS = ["explorer", "plus", "pro", "enterprise"] as const satisfies readonly PlanSlug[];

// Locked expectations. `undefined` means "field must be explicitly
// absent/falsy" — matches how Upgrade.tsx reads it (`.contactSales` /
// `.highlighted` are truthy-checked, so `false` or `undefined` both
// behave the same, and we accept either).
const EXPECTED: Record<UpgradeSlug, { contactSales: boolean; highlighted: boolean }> = {
  plus:       { contactSales: false, highlighted: false },
  pro:        { contactSales: false, highlighted: true  },
  enterprise: { contactSales: true,  highlighted: false },
};

// Expected `.explorer` value for every PlanSlug. Only the free-tier plan
// carries the flag; Upgrade.tsx uses it to render the free-tier CTA
// without hardcoding the "explorer" slug.
const EXPECTED_EXPLORER: Record<PlanSlug, boolean> = {
  explorer:   true,
  plus:       false,
  pro:        false,
  enterprise: false,
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

  // ---------------------------------------------------------------------
  // `.explorer` — free-tier flag. Contract mirrors `contactSales` /
  // `highlighted`: optional boolean, truthy-checked at the call site.
  // Enforced across EVERY PlanSlug (not just the upgrade-page slugs) so a
  // new tier can't silently forget to opt out.
  // ---------------------------------------------------------------------
  it.each(ALL_PLAN_SLUGS)(
    "%s exposes explorer as boolean|undefined (Upgrade.tsx reads it as truthy)",
    (slug) => {
      const v = PLAN_FEATURES[slug].explorer;
      expect(
        v === undefined || typeof v === "boolean",
        `PLAN_FEATURES["${slug}"].explorer must be boolean|undefined, got ${typeof v}`,
      ).toBe(true);
      expect(Boolean(v)).toBe(EXPECTED_EXPLORER[slug]);
    },
  );

  it("exactly one plan in PLAN_FEATURES is flagged as the free-tier explorer", () => {
    const free = ALL_PLAN_SLUGS.filter((s) => PLAN_FEATURES[s].explorer);
    expect(
      free,
      "Upgrade.tsx renders the free-tier CTA from the plan whose `.explorer` is true",
    ).toHaveLength(1);
  });

  it("the explorer-flagged plan is priced at 0 and carries a CTA href", () => {
    const free = ALL_PLAN_SLUGS.map((s) => PLAN_FEATURES[s]).find((p) => p.explorer)!;
    expect(free).toBeDefined();
    expect(free.priceMonthly).toBe(0);
    expect(free.priceAnnualTotal).toBe(0);
    expect(free.ctaHref, "free-tier CTA needs a destination").toBeTruthy();
    expect(free.cta, "free-tier CTA needs a label").toBeTruthy();
  });

  it("the free-tier plan and the highlighted/contactSales plans are disjoint", () => {
    // A free plan can't simultaneously be the paid CTA anchor or a sales-routed tier.
    for (const slug of ALL_PLAN_SLUGS) {
      const p = PLAN_FEATURES[slug];
      if (p.explorer) {
        expect(Boolean(p.highlighted), `${slug} cannot be both explorer and highlighted`).toBe(false);
        expect(Boolean(p.contactSales), `${slug} cannot be both explorer and contactSales`).toBe(false);
      }
    }
  });
});