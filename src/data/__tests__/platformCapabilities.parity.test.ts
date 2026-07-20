/**
 * Parity test: every capability declared in the platform source of truth
 * must be represented (1) as a card in the Landing Features grid and
 * (2) as a row in the plan comparison matrix.
 *
 * If this fails, a capability has drifted between the marketing surface
 * and the pricing surface — customers will see inconsistent messaging.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_SECTIONS } from "@/data/landingDefaults";
import {
  PLATFORM_CAPABILITIES,
  LANDING_FEATURES_GRID_COUNT,
} from "@/data/platformCapabilities";
import { ROUTE_FEATURE_MAP } from "@/lib/gating/routeFeatureMap";

const featuresGrid = DEFAULT_SECTIONS.find((s) => s.key === "features")!.content
  .items as Array<{ title: string; icon?: string; desc?: string }>;

// Extract the comparison row labels statically from Features.tsx so the test
// stays honest even without booting the React tree.
const featuresPageSrc = readFileSync(
  resolve(process.cwd(), "src/pages/Features.tsx"),
  "utf8",
);
const matrixLabels = new Set<string>();
for (const m of featuresPageSrc.matchAll(/label:\s*"([^"]+)"\s*,/g)) {
  matrixLabels.add(m[1]);
}

describe("platformCapabilities → landing + comparison parity", () => {
  it("landing features grid renders the expected number of cards", () => {
    expect(featuresGrid.length).toBe(LANDING_FEATURES_GRID_COUNT);
  });

  it("every platform capability has a matching landing card", () => {
    const gridTitles = new Set(featuresGrid.map((f) => f.title));
    const missing = PLATFORM_CAPABILITIES
      .filter((c) => !gridTitles.has(c.landingTitle))
      .map((c) => `${c.id} → "${c.landingTitle}"`);
    expect(missing, `Missing landing cards:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every platform capability has a matching comparison matrix row", () => {
    const missing = PLATFORM_CAPABILITIES
      .filter((c) => !matrixLabels.has(c.matrixRowLabel))
      .map((c) => `${c.id} → "${c.matrixRowLabel}"`);
    expect(missing, `Missing matrix rows:\n${missing.join("\n")}`).toEqual([]);
  });

  it("landing grid does not contain extra cards missing from the source of truth", () => {
    const declared = new Set(PLATFORM_CAPABILITIES.map((c) => c.landingTitle));
    const extras = featuresGrid.map((f) => f.title).filter((t) => !declared.has(t));
    expect(
      extras,
      `Landing has cards not declared in PLATFORM_CAPABILITIES:\n${extras.join("\n")}`,
    ).toEqual([]);
  });

  it("gated capabilities agree with ROUTE_FEATURE_MAP", () => {
    const mismatches: string[] = [];
    for (const cap of PLATFORM_CAPABILITIES) {
      if (!cap.route || !cap.featureKey) continue;
      const mapped = ROUTE_FEATURE_MAP[cap.route];
      if (!mapped) continue; // route isn't gated at the map level (public)
      if (mapped !== cap.featureKey) {
        mismatches.push(
          `${cap.id}: route ${cap.route} expects "${mapped}" but capability declares "${cap.featureKey}"`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});
