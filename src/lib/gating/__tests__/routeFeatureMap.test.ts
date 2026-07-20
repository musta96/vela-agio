/**
 * Unit tests for the gating metadata deriver.
 *
 * The historical bug was that the Simulations page (`/simulations`,
 * feature `portfolio.simulations`) rendered a "Deal flow · Unlocks on
 * Enterprise" upgrade card. That could only happen if metadata was
 * looked up by something other than the `feature` prop — so this suite
 * pins the contract that `deriveGateMeta` is a pure function of its
 * `feature` argument and nothing else.
 */
import { describe, it, expect } from "vitest";
import {
  ROUTE_FEATURE_MAP,
  featureForPath,
  deriveGateMeta,
  type CatalogEntry,
  type PlanEntry,
} from "@/lib/gating/routeFeatureMap";

const CATALOG: CatalogEntry[] = [
  { key: "portfolio.simulations", name: "Portfolio simulations", description: "Monte Carlo scenarios." },
  { key: "dealflow.access", name: "Deal flow", description: "Curated PE and VC deal flow." },
  { key: "ai.backtests", name: "Backtesting", description: "Historical strategy simulation." },
];

const PLANS: PlanEntry[] = [
  { slug: "pro", name: "Pro", price_label: "€49 /mo", feature_keys: ["portfolio.simulations", "ai.backtests"] },
  { slug: "enterprise", name: "Enterprise", price_label: "Custom", feature_keys: ["dealflow.access"] },
];

describe("routeFeatureMap.featureForPath", () => {
  it("resolves exact paths to their canonical feature key", () => {
    expect(featureForPath("/simulations")).toBe("portfolio.simulations");
    expect(featureForPath("/dealflow")).toBe("dealflow.access");
    expect(featureForPath("/backtest")).toBe("ai.backtests");
  });

  it("resolves nested paths under a gated route", () => {
    expect(featureForPath("/rebalance/plan/abc")).toBe("portfolio.rebalance");
  });

  it("returns null for ungated paths", () => {
    expect(featureForPath("/portfolio")).toBeNull();
    expect(featureForPath("/dashboard")).toBeNull();
    expect(featureForPath("/")).toBeNull();
  });
});

describe("routeFeatureMap.deriveGateMeta — no cross-page leakage", () => {
  it("returns metadata for the requested feature and nothing else", () => {
    const meta = deriveGateMeta("portfolio.simulations", CATALOG, PLANS);
    expect(meta.feature).toBe("portfolio.simulations");
    expect(meta.name).toBe("Portfolio simulations");
    expect(meta.targetPlan?.slug).toBe("pro");
    expect(meta.targetPlan?.name).toBe("Pro");
    // Critical: must NOT surface any Deal flow copy.
    expect(meta.description).not.toMatch(/deal flow/i);
    expect(meta.targetPlan?.name).not.toBe("Enterprise");
  });

  it("returns Deal flow metadata for the Deal flow key — proving keys are independent", () => {
    const meta = deriveGateMeta("dealflow.access", CATALOG, PLANS);
    expect(meta.name).toBe("Deal flow");
    expect(meta.targetPlan?.name).toBe("Enterprise");
  });

  it("is a pure function of `feature` — swapping call order does not leak state", () => {
    const dealflow = deriveGateMeta("dealflow.access", CATALOG, PLANS);
    const sims = deriveGateMeta("portfolio.simulations", CATALOG, PLANS);
    const dealflowAgain = deriveGateMeta("dealflow.access", CATALOG, PLANS);
    expect(sims.name).toBe("Portfolio simulations");
    expect(dealflowAgain).toEqual(dealflow);
  });

  it("falls back to a generic name when the key is not in the catalog", () => {
    const meta = deriveGateMeta("does.not.exist", CATALOG, PLANS);
    expect(meta.name).toBe("Premium feature");
    expect(meta.description).toBeNull();
    expect(meta.targetPlan).toBeNull();
  });
});

describe("ROUTE_FEATURE_MAP contract", () => {
  it("uses only keys that could plausibly exist in feature_catalog (dot.namespaced)", () => {
    for (const [route, key] of Object.entries(ROUTE_FEATURE_MAP)) {
      expect(route.startsWith("/")).toBe(true);
      expect(key).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);
    }
  });
});