/**
 * Source-level guard for Upgrade.tsx.
 *
 * Upgrade.tsx must derive every entitlement-dependent UI branch from
 * PLAN_FEATURES (`.contactSales`, `.highlighted`, `.explorer`). Hardcoding
 * plan slugs (`slug === "pro"`, `if (plan === "enterprise")`, etc.) inside
 * conditional logic silently breaks when the catalog changes.
 *
 * This test statically scans src/pages/Upgrade.tsx and asserts:
 *   1. It reads all three entitlement flags from PLAN_FEATURES.
 *   2. It contains NO tier-string equality checks anywhere in the file.
 *   3. The only places plan slugs appear as string literals are in the
 *      display-copy map (PLAN_LABELS) and the enumerated plan lists — never
 *      inside a runtime `if` / ternary / boolean condition.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const UPGRADE_PATH = join(process.cwd(), "src", "pages", "Upgrade.tsx");
const SRC = readFileSync(UPGRADE_PATH, "utf8");

const TIER_LITERALS = ["explorer", "plus", "pro", "enterprise", "elite", "advisor", "free"] as const;

describe("Upgrade.tsx derives entitlement UI from PLAN_FEATURES", () => {
  it("imports PLAN_FEATURES from the single source of truth", () => {
    expect(SRC).toMatch(/from ["']@\/lib\/planFeatures["']/);
    expect(SRC).toMatch(/\bPLAN_FEATURES\b/);
  });

  it.each(["contactSales", "highlighted", "explorer"] as const)(
    "reads `.%s` from PLAN_FEATURES (never hardcoded)",
    (field) => {
      // Either PLAN_FEATURES[slug].field or destructured via Object.values(PLAN_FEATURES).
      const usesIndexAccess = new RegExp(`PLAN_FEATURES\\[[^\\]]+\\]\\.${field}\\b`).test(SRC);
      const usesValuesAccess = new RegExp(
        `Object\\.values\\(PLAN_FEATURES\\)[\\s\\S]{0,120}\\.${field}\\b`,
      ).test(SRC);
      expect(
        usesIndexAccess || usesValuesAccess,
        `Upgrade.tsx should derive .${field} from PLAN_FEATURES; ` +
          `add a read like PLAN_FEATURES[slug].${field} instead of hardcoding.`,
      ).toBe(true);
    },
  );

  it("contains no `slug === \"<tier>\"` (or reversed) equality checks", () => {
    const offenders: string[] = [];
    const lines = SRC.split("\n");
    // Same pattern shape as entitlementsSource.test.ts so violations look
    // identical to reviewers.
    const rx = new RegExp(
      `===\\s*["'](${TIER_LITERALS.join("|")})["']|["'](${TIER_LITERALS.join("|")})["']\\s*===`,
    );
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      if (rx.test(line)) offenders.push(`Upgrade.tsx:${i + 1}  ${trimmed}`);
    });
    expect(
      offenders,
      "Upgrade.tsx must branch on PLAN_FEATURES fields, not on plan slug identity:\n\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("never uses a plan-slug literal inside an if/ternary/switch condition", () => {
    // Flag runtime conditionals that reference a tier literal directly.
    // Display-copy structures (PLAN_LABELS map, SELF_SERVE_PLANS array,
    // SWITCHABLE_PLANS array) enumerate slugs as *data* and are fine —
    // they aren't inside `if (...)` / `? :` / `switch (...)`.
    const offenders: string[] = [];
    const lines = SRC.split("\n");
    const literalAlt = TIER_LITERALS.join("|");
    // Matches: if(..."pro"...) / ? ..."pro"... : / switch(..."pro"...)
    const rx = new RegExp(
      String.raw`(\bif\s*\(|\?[^:]*|\bswitch\s*\()[^)]*["'](?:${literalAlt})["']`,
    );
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      if (rx.test(line)) offenders.push(`Upgrade.tsx:${i + 1}  ${trimmed}`);
    });
    expect(
      offenders,
      "Upgrade.tsx must not use plan-slug literals inside conditional expressions:\n\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("routes the free-tier CTA through the .explorer flag, not the literal slug", () => {
    // Concretely: the free-tier link must resolve its href/label by looking
    // up the explorer-flagged plan, never by writing PLAN_FEATURES.explorer
    // or "/auth" directly next to a conditional.
    expect(SRC).toMatch(/find\([^)]*\.explorer\b/);
    // And the free-tier link's destination must be derived, not literal:
    // no `to="/auth"` should appear in Upgrade.tsx (the explorer ctaHref
    // is "/auth" — hardcoding it here would bypass PLAN_FEATURES).
    expect(
      /to=["']\/auth["']/.test(SRC),
      "Upgrade.tsx should derive the free-tier href from PLAN_FEATURES[...].ctaHref, not hardcode \"/auth\".",
    ).toBe(false);
  });
});