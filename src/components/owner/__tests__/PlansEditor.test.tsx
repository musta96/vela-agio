/**
 * PlansEditor save flow — verifies the owner toggles a feature key on a plan
 * card and the persisted UPDATE includes the new feature_keys array.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("react-router-dom", () => ({
  Link: ({ children, ...p }: any) => <a {...p}>{children}</a>,
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const updateCalls: any[] = [];

function makeQuery(table: string) {
  if (table === "subscription_plans") {
    return {
      select: () => ({
        order: () => Promise.resolve({
          data: [
            {
              id: "plan-pro", slug: "pro", name: "Pro", price_label: "€19",
              price_period: "/mo", cta_label: "Choose", cta_href: "/auth",
              features: ["bullet"], highlighted: true, sort_order: 2, is_active: true,
              feature_keys: ["ai.copilot"],
            },
          ],
          error: null,
        }),
      }),
      update: (patch: any) => ({
        eq: (_col: string, val: string) => {
          updateCalls.push({ id: val, patch });
          return Promise.resolve({ error: null });
        },
      }),
    };
  }
  if (table === "feature_catalog") {
    return {
      select: () => ({
        order: () => Promise.resolve({
          data: [
            { key: "ai.copilot",   name: "AI Copilot",  description: null, category: "ai", sort_order: 10 },
            { key: "ai.sentiment", name: "AI sentiment", description: null, category: "ai", sort_order: 30 },
          ],
          error: null,
        }),
      }),
    };
  }
  return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => makeQuery(t) },
}));

vi.mock("@/hooks/useFeatureGate", () => ({ invalidateFeatureCatalogCache: vi.fn() }));

import { PlansEditor } from "@/components/owner/PlansEditor";

describe("<PlansEditor />", () => {
  beforeEach(() => { updateCalls.length = 0; });

  it("loads existing plan + catalog and toggles feature_keys on save", async () => {
    render(<PlansEditor />);
    await waitFor(() => expect(screen.getByText("AI Copilot")).toBeInTheDocument());
    expect(screen.getByText("AI sentiment")).toBeInTheDocument();

    // The pro plan only has ai.copilot — sentiment is unchecked. Tick it.
    const sentimentLabel = screen.getByText("AI sentiment").closest("label")!;
    const sentimentBox = sentimentLabel.querySelector('button[role="checkbox"]') as HTMLElement;
    fireEvent.click(sentimentBox);

    // Click Save
    const saveBtn = screen.getByRole("button", { name: /^Save$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(updateCalls.length).toBeGreaterThan(0));
    const sent = updateCalls[0];
    expect(sent.id).toBe("plan-pro");
    expect(sent.patch.feature_keys).toEqual(expect.arrayContaining(["ai.copilot", "ai.sentiment"]));
  });
});