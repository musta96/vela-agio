/**
 * Breadcrumb correctness for every Pro-gated route.
 *
 * Regression guard for the specific bug: "on /simulations the sidebar
 * breadcrumb read Research › Dashboard". The breadcrumb must always
 * resolve to the sidebar item registered for the current pathname —
 * never to Dashboard (unless we're actually on /dashboard) and never
 * to another page's title.
 */
import { describe, it, expect } from "vitest";
import { computeBreadcrumb } from "@/components/AppSidebar";
import { ROUTE_FEATURE_MAP } from "@/lib/gating/routeFeatureMap";

// Canonical (path → expected sidebar page label) mapping for every
// currently Pro-gated route. Kept in this test file rather than
// exported from AppSidebar so that a drift in either the sidebar OR
// the breadcrumb resolver will fail the assertion loudly.
const EXPECTED_LABELS: Record<string, string> = {
  "/sentiment": "Sentiment",
  "/backtest": "Backtesting",
  "/strategy-lab": "Strategy Lab",
  "/risk": "Risk Engine",
  "/simulations": "Simulations",
  "/event-study": "Event Study",
  "/tax-harvest": "Tax-loss Harvesting",
  "/optimizer": "Optimizer",
  "/rebalance": "Rebalance",
  "/quant": "Quant Alpha",
  "/dealflow": "Deal Flow",
  "/advisor": "Portfolio Doctor",
  "/enterprise/team": "Team & seats",
  "/enterprise/dashboard": "Firm dashboard",
  "/enterprise/clients": "Client portal",
  // /api is Enterprise-only and not in the sidebar; excluded intentionally.
};

describe("AppSidebar breadcrumb — Pro-gated routes", () => {
  it("EXPECTED_LABELS covers every gated route present in the sidebar", () => {
    // Sanity: keep this list synced with ROUTE_FEATURE_MAP so a new
    // gated route can't silently escape breadcrumb coverage.
    const gated = Object.keys(ROUTE_FEATURE_MAP).filter((p) => p !== "/api");
    for (const path of gated) {
      expect(
        EXPECTED_LABELS,
        `Missing breadcrumb expectation for gated route ${path}`,
      ).toHaveProperty(path);
    }
  });

  for (const [path, label] of Object.entries(EXPECTED_LABELS)) {
    it(`resolves ${path} to its own sidebar item ("${label}") — not Dashboard`, () => {
      const bc = computeBreadcrumb(path);
      expect(bc, `Expected a breadcrumb for ${path}`).not.toBeNull();
      expect(bc!.page).toBe(label);
      // Guard against the specific "Research › Dashboard" leak.
      expect(bc!.page).not.toBe("Dashboard");
    });
  }

  it("still resolves /dashboard to Dashboard (control case)", () => {
    const bc = computeBreadcrumb("/dashboard");
    expect(bc).toEqual({ group: null, page: "Dashboard" });
  });

  it("returns null for unknown paths rather than reusing a stale label", () => {
    expect(computeBreadcrumb("/definitely-not-a-real-route")).toBeNull();
  });
});