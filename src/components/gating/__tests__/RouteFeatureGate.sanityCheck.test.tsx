/**
 * Integration test for the RouteFeatureGate runtime sanity check.
 *
 * Guards against the class of bug where a route in App.tsx is wired
 * to the wrong feature key (e.g. `/simulations` accidentally set to
 * `dealflow.access`, which historically produced a "Deal flow · Unlocks
 * on Enterprise" card on the Simulations page).
 *
 * Contract:
 *   - Matching pathname + feature      → renders normally, no throw.
 *   - Mismatched pathname + feature    → throws in dev / test builds.
 *   - Ungated pathname                 → no assertion; renders normally.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RouteFeatureGate } from "@/components/gating/RouteFeatureGate";

vi.mock("@/hooks/useFeatureGate", () => ({
  useFeatureGate: () => (globalThis as any).__gate,
}));

function setGate(overrides: Partial<any> = {}) {
  (globalThis as any).__gate = {
    entitlements: { loading: false, tier: "pro", planSlug: "pro", featureKeys: new Set() },
    catalog: [
      { key: "portfolio.simulations", name: "Portfolio simulations", description: "" },
      { key: "dealflow.access", name: "Deal flow", description: "" },
    ],
    plans: [],
    prompt: { open: false },
    setPrompt: () => {},
    promptUpgrade: () => {},
    has: () => true,
    ...overrides,
  };
}

beforeEach(() => setGate());

function renderAt(path: string, feature: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RouteFeatureGate feature={feature}>
        <div data-testid="child">child</div>
      </RouteFeatureGate>
    </MemoryRouter>,
  );
}

describe("RouteFeatureGate — pathname sanity check", () => {
  it("renders normally when feature prop matches the route's canonical key", () => {
    const { getByTestId } = renderAt("/simulations", "portfolio.simulations");
    expect(getByTestId("child")).toBeInTheDocument();
  });

  it("throws when a page is wired to a foreign feature key (Deal flow on /simulations)", () => {
    // React renders throw upwards; wrap in a try/catch via expect().toThrow.
    // Suppress React's error-boundary console noise for the negative case.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderAt("/simulations", "dealflow.access")).toThrow(
      /mismatch at "\/simulations".*expected feature key "portfolio\.simulations".*got "dealflow\.access"/,
    );
    spy.mockRestore();
  });

  it("skips the check on ungated paths (no entry in ROUTE_FEATURE_MAP)", () => {
    const { getByTestId } = renderAt("/portfolio", "ai.backtests");
    expect(getByTestId("child")).toBeInTheDocument();
  });
});