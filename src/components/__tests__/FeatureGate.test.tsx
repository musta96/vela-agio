/**
 * FeatureGate behavior tests.
 *
 * What this covers (per the build request):
 *   1. Renders children when the user's plan unlocks the feature.
 *   2. Renders the upgrade card naming the required tier when the user is blocked.
 *   3. Inserts an audit row into `feature_gate_blocks` for blocked attempts.
 *
 * Note: we mock `useEntitlements`, `useFeatureGate`, and `supabase` so this is
 * a pure component test — no network or real auth required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("react-router-dom", () => ({
  Link: ({ children, ...p }: any) => <a {...p}>{children}</a>,
}));

// Capture inserts so we can assert on the audit log behavior.
const insertSpy = vi.fn(() => Promise.resolve({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ insert: insertSpy }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
  },
}));

let mockEnt = {
  loading: false,
  featureKeys: new Set<string>(),
  tier: "free",
  planSlug: null as string | null,
  planName: null as string | null,
};
const mockCatalog = [
  { key: "ai.deep_research", name: "AI deep research", description: "Long-form AI reports", category: "ai", sort_order: 50 },
];
const mockPlans = [
  { slug: "elite", name: "Elite", sort_order: 4, feature_keys: ["ai.deep_research"], price_label: "€99/mo" },
];

const promptUpgrade = vi.fn();
vi.mock("@/hooks/useFeatureGate", () => ({
  useFeatureGate: () => ({
    entitlements: mockEnt,
    catalog: mockCatalog,
    plans: mockPlans,
    has: (k: string) => mockEnt.featureKeys.has(k),
    promptUpgrade,
    prompt: { open: false },
    setPrompt: vi.fn(),
  }),
  invalidateFeatureCatalogCache: vi.fn(),
}));

import { FeatureGate } from "@/components/FeatureGate";

describe("<FeatureGate />", () => {
  beforeEach(() => {
    insertSpy.mockClear();
    promptUpgrade.mockClear();
    mockEnt = { loading: false, featureKeys: new Set<string>(), tier: "free", planSlug: null, planName: null };
  });

  it("renders children when the feature is unlocked", () => {
    mockEnt.featureKeys = new Set(["ai.deep_research"]);
    render(
      <FeatureGate feature="ai.deep_research">
        <div>secret content</div>
      </FeatureGate>,
    );
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });

  it("shows the upgrade card with feature name and required plan when blocked", () => {
    render(
      <FeatureGate feature="ai.deep_research">
        <div>secret content</div>
      </FeatureGate>,
    );
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
    expect(screen.getByText("AI deep research")).toBeInTheDocument();
    expect(screen.getAllByText(/Elite/i).length).toBeGreaterThan(0);
  });

  it("logs an audit row to feature_gate_blocks when blocked", async () => {
    render(
      <FeatureGate feature="ai.deep_research">
        <div>secret content</div>
      </FeatureGate>,
    );
    // The effect fires asynchronously after mount.
    await new Promise((r) => setTimeout(r, 0));
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect((insertSpy.mock.calls[0] as any[])[0]).toMatchObject({
      user_id: "u1",
      feature_key: "ai.deep_research",
      current_tier: "free",
    });
  });
});