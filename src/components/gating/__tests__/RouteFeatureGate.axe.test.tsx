/**
 * Axe accessibility scan for the RouteFeatureGate component in its two
 * blocked-user states:
 *   1. Loading skeleton (entitlements still resolving)
 *   2. Locked upgrade card (user's plan lacks the feature)
 *
 * Blocked/gated routes still need to meet a11y contracts — the
 * upgrade CTA must have an accessible name, the skeleton must expose a
 * live region, etc.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axe from "axe-core";
import { RouteFeatureGate } from "@/components/gating/RouteFeatureGate";

vi.mock("@/hooks/useFeatureGate", () => {
  return {
    useFeatureGate: () => (globalThis as any).__gateMock,
  };
});

vi.mock("@/components/UpgradeDialog", () => ({
  UpgradeDialog: () => null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ insert: async () => ({}) }),
  },
}));

async function runAxe(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
    resultTypes: ["violations"],
  });
  return results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
}

describe("RouteFeatureGate — a11y for blocked/locked states", () => {
  it("skeleton loading state has no serious axe violations", async () => {
    (globalThis as any).__gateMock = {
      entitlements: { loading: true, featureKeys: new Set<string>(), tier: null, planSlug: null },
      catalog: [],
      plans: [],
      has: () => false,
      promptUpgrade: () => {},
      prompt: { open: false },
      setPrompt: () => {},
    };
    const { container } = render(
      <MemoryRouter>
        <RouteFeatureGate feature="ai.backtests">
          <div>hidden content</div>
        </RouteFeatureGate>
      </MemoryRouter>,
    );
    const status = container.querySelector('[role="status"]');
    expect(status).toBeTruthy();
    expect(status?.getAttribute("aria-live")).toBe("polite");
    const violations = await runAxe(container);
    expect(violations).toEqual([]);
  }, 15_000);

  it("locked upgrade card has no serious axe violations", async () => {
    (globalThis as any).__gateMock = {
      entitlements: { loading: false, featureKeys: new Set<string>(), tier: "free", planSlug: "explorer" },
      catalog: [{ key: "ai.backtests", name: "Backtesting", description: "Backtest strategies over history." }],
      plans: [{ slug: "pro", name: "Pro", price_label: "$29/mo", feature_keys: ["ai.backtests"] }],
      has: () => false,
      promptUpgrade: () => {},
      prompt: { open: false },
      setPrompt: () => {},
    };
    const { container } = render(
      <MemoryRouter>
        <RouteFeatureGate feature="ai.backtests">
          <div>hidden content</div>
        </RouteFeatureGate>
      </MemoryRouter>,
    );
    const upgradeLink = container.querySelector('a[href*="/upgrade"]');
    expect(upgradeLink).toBeTruthy();
    expect(upgradeLink?.textContent?.trim().length).toBeGreaterThan(0);
    const violations = await runAxe(container);
    expect(violations).toEqual([]);
  }, 15_000);
});
