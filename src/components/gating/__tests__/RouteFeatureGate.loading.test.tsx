/**
 * RouteFeatureGate — loading + fail-closed behavior.
 *
 * 1. While `feature_catalog` is still loading (or empty), the gate must
 *    render its skeleton with an accessible live region.
 * 2. Once loaded, a feature key that is NOT present in the catalog must
 *    block the route (fail-closed) instead of leaking the children.
 * 3. A catalog hit that the user has entitles the route as normal.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RouteFeatureGate } from "@/components/gating/RouteFeatureGate";

vi.mock("@/hooks/useFeatureGate", () => ({
  useFeatureGate: () => (globalThis as any).__gate,
}));
vi.mock("@/components/UpgradeDialog", () => ({ UpgradeDialog: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ insert: async () => ({}) }),
  },
}));

function setGate(g: any) { (globalThis as any).__gate = g; }

function renderGate(feature = "ai.backtests") {
  return render(
    <MemoryRouter>
      <RouteFeatureGate feature={feature}>
        <div data-testid="protected-content">SECRET</div>
      </RouteFeatureGate>
    </MemoryRouter>,
  );
}

describe("RouteFeatureGate loading + fail-closed", () => {
  it("renders the skeleton while entitlements are still loading", () => {
    setGate({
      entitlements: { loading: true, featureKeys: new Set(), tier: null, planSlug: null },
      catalog: [],
      plans: [],
      has: () => false,
      promptUpgrade: () => {},
      prompt: { open: false },
      setPrompt: () => {},
    });
    const { container, queryByTestId } = renderGate();
    const status = container.querySelector('[role="status"]');
    expect(status).toBeTruthy();
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.getAttribute("aria-label")).toMatch(/checking access/i);
    // Protected children must NEVER flash while loading.
    expect(queryByTestId("protected-content")).toBeNull();
  });

  it("renders the skeleton while the catalog is empty (still fetching)", () => {
    setGate({
      entitlements: { loading: false, featureKeys: new Set(["ai.backtests"]), tier: "pro", planSlug: "pro" },
      catalog: [],
      plans: [],
      has: () => true,
      promptUpgrade: () => {},
      prompt: { open: false },
      setPrompt: () => {},
    });
    const { container, queryByTestId } = renderGate();
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    expect(queryByTestId("protected-content")).toBeNull();
  });

  it("fails closed when the feature key is missing from the catalog", () => {
    // Catalog fully loaded, user's plan even contains the key, but the
    // catalog does not know about it → block.
    setGate({
      entitlements: { loading: false, featureKeys: new Set(["ai.backtests"]), tier: "pro", planSlug: "pro" },
      catalog: [{ key: "other.feature", name: "Other" }],
      plans: [],
      has: (k: string) => k === "ai.backtests",
      promptUpgrade: () => {},
      prompt: { open: false },
      setPrompt: () => {},
    });
    const { queryByTestId, container } = renderGate("ai.backtests");
    expect(queryByTestId("protected-content")).toBeNull();
    // The fail-closed branch renders the FeatureGate upgrade card.
    expect(container.querySelector('a[href*="/upgrade"]')).toBeTruthy();
  });

  it("unlocks the route when key is in catalog and user has it", () => {
    setGate({
      entitlements: { loading: false, featureKeys: new Set(["ai.backtests"]), tier: "pro", planSlug: "pro" },
      catalog: [{ key: "ai.backtests", name: "Backtesting" }],
      plans: [],
      has: (k: string) => k === "ai.backtests",
      promptUpgrade: () => {},
      prompt: { open: false },
      setPrompt: () => {},
    });
    const { getByTestId, container } = renderGate("ai.backtests");
    expect(getByTestId("protected-content").textContent).toBe("SECRET");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
