/**
 * Entitlements source-of-truth audit.
 *
 * PLAN_FEATURES (src/lib/planFeatures.ts) is the ONLY place in the client
 * that is allowed to hardcode tier identities and per-tier feature booleans.
 * Every other component/hook must gate features through one of:
 *   - useEntitlements().has(key) / .featureKeys
 *   - useFeatureGate().require(key) / .has(key)
 *   - tierAtLeast(current, required) / requiredTierFor(...) from planFeatures
 *
 * This test statically scans src/ for the two escape hatches that would
 * bypass PLAN_FEATURES:
 *   1. Hardcoded tier-string equality checks (`x === "pro"` etc.) outside
 *      an allowlist of billing/upgrade UI files.
 *   2. Direct reads of the `subscription_plans` DB table outside the small
 *      set of files that legitimately own the plan catalog.
 *
 * It also asserts PLAN_FEATURES itself is internally consistent so
 * downstream gating stays trustworthy.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  PLAN_FEATURES,
  PLAN_ORDER,
  type PlanFeatures,
  type PlanSlug,
} from "@/lib/planFeatures";

const SRC = join(process.cwd(), "src");

/** Recursively collect .ts/.tsx files under src, skipping tests + generated code. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "test" || entry === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function rel(p: string) {
  return relative(SRC, p).split(sep).join("/");
}

// ---------------------------------------------------------------------------
// (1) PLAN_FEATURES internal invariants — if these drift, every gate is wrong.
// ---------------------------------------------------------------------------

describe("PLAN_FEATURES is a well-formed source of truth", () => {
  const expectedFeatureKeys: (keyof PlanFeatures)[] = [
    "ai_questions_per_day",
    "live_data",
    "portfolio_sync",
    "alerts",
    "backtesting",
    "compliance_tools",
    "report_export",
    "api_access",
    "advisor_seats",
  ];

  it("every slug in PLAN_ORDER has a definition and vice versa", () => {
    expect(new Set(PLAN_ORDER)).toEqual(new Set(Object.keys(PLAN_FEATURES) as PlanSlug[]));
  });

  it("every plan exposes the same feature shape", () => {
    for (const slug of PLAN_ORDER) {
      const keys = Object.keys(PLAN_FEATURES[slug].features).sort();
      expect(keys, `plan "${slug}" has non-canonical feature shape`).toEqual(
        [...expectedFeatureKeys].sort(),
      );
    }
  });

  it("PLAN_ORDER is monotonic by priceMonthly (upgrade prompts assume this)", () => {
    const prices = PLAN_ORDER.map((s) => PLAN_FEATURES[s].priceMonthly);
    for (let i = 1; i < prices.length; i++) {
      expect(
        prices[i] >= prices[i - 1],
        `PLAN_ORDER not ascending: ${PLAN_ORDER[i - 1]}=${prices[i - 1]} > ${PLAN_ORDER[i]}=${prices[i]}`,
      ).toBe(true);
    }
  });

  it("only paid tiers carry a Stripe lookupKey", () => {
    // Explorer is free. Enterprise is now self-serve per firm (EUR 149/mo,
    // 3 seats included), so it does carry lookup keys.
    expect(PLAN_FEATURES.explorer.lookupKey).toBeUndefined();
    for (const slug of ["plus", "pro", "enterprise"] as const) {
      const lk = PLAN_FEATURES[slug].lookupKey;
      expect(lk?.monthly, `${slug} monthly lookupKey`).toBeTruthy();
      expect(lk?.annual, `${slug} annual lookupKey`).toBeTruthy();
      expect(lk!.monthly).toBe(`${slug}_monthly`);
      expect(lk!.annual).toBe(`${slug}_annual`);
    }
  });
});

// ---------------------------------------------------------------------------
// (2) Static scan — no component may hardcode a tier identity check
//     outside the small set of files that own the plan/billing surface.
// ---------------------------------------------------------------------------

/**
 * Files that are ALLOWED to reference tier string literals directly.
 * Every entry must be a real gap in the abstraction (billing UI, plan
 * catalog, legacy slug normalization). New entries here should be a
 * deliberate decision, reviewed alongside the PR.
 */
const TIER_LITERAL_ALLOWLIST = new Set<string>([
  // Owns the catalog itself.
  "lib/planFeatures.ts",
  // Pricing / upgrade / billing surface — legitimately branches on tier
  // for copy ("You're on Pro"), not for feature access decisions.
  "components/upgrade/UpgradeFlow.tsx",
  "components/trial/TrialStatusBanner.tsx",
  "pages/PlansBilling.tsx",
  // Derived tier caps hook — reads `tier` from useEntitlements and maps
  // it to numeric limits. Kept next to PLAN_FEATURES conceptually.
  "hooks/usePlanLimits.ts",
]);

// Any of the current or legacy tier identifiers. Legacy ones stay in the
// list so an accidental reintroduction ("elite", "advisor") still trips.
const TIER_LITERAL_RE =
  /===\s*["'](pro|plus|enterprise|explorer|elite|advisor|free)["']|["'](pro|plus|enterprise|explorer|elite|advisor|free)["']\s*===/;

describe("No component bypasses PLAN_FEATURES for entitlement decisions", () => {
  const files = walk(SRC);

  it("scans a non-trivial slice of the codebase (sanity)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("does not hardcode tier equality checks outside the billing allowlist", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const relPath = rel(file);
      if (TIER_LITERAL_ALLOWLIST.has(relPath)) continue;
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        // Skip comments and imports so the rule only fires on runtime logic.
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("import ")) return;
        if (TIER_LITERAL_RE.test(line)) {
          offenders.push(`${relPath}:${i + 1}  ${trimmed}`);
        }
      });
    }
    expect(
      offenders,
      `Found tier literal comparisons outside PLAN_FEATURES.\n` +
        `Gate features via useEntitlements().has(key) / useFeatureGate().require(key) / ` +
        `tierAtLeast(current, required) instead:\n\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * The client must not read `subscription_plans` directly to answer
   * entitlement questions — that would branch on DB state that PLAN_FEATURES
   * doesn't own. The plan catalog is only allowed to be fetched by:
   *   - useFeatureGate  (renders the upgrade dialog copy)
   *   - PlansBilling / Pricing pages (renders the pricing table)
   *   - admin/owner console (manages plans)
   *   - the pricing audit + Stripe checkout wiring
   */
  const PLANS_TABLE_ALLOWLIST_PREFIXES = [
    "hooks/useFeatureGate.ts",
    "hooks/usePlanLimits.ts",
    "pages/PlansBilling.tsx",
    "pages/Pricing.tsx",
    "pages/OwnerConsole.tsx",
    "pages/admin/",
    "pages/AdminAiQuotas.tsx",
    "pages/owner/",
    "components/owner/",
    "components/admin/",
    "components/pricing/",
    "components/upgrade/",
    "lib/pricingAudit.ts",
    "lib/verifyFeaturesCta.ts",
  ];
  const PLANS_TABLE_RE = /\.from\(\s*["']subscription_plans["']\s*\)/;

  it("does not query subscription_plans outside billing/admin surfaces", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const relPath = rel(file);
      if (PLANS_TABLE_ALLOWLIST_PREFIXES.some((p) => relPath.startsWith(p))) continue;
      const src = readFileSync(file, "utf8");
      if (PLANS_TABLE_RE.test(src)) offenders.push(relPath);
    }
    expect(
      offenders,
      `Files reading subscription_plans directly (bypasses PLAN_FEATURES):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});