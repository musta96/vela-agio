/**
 * E2E-ish: visiting `/upgrade?plan=plus` must show the Plus tier — never
 * fall back to the Pro default in either the page title or the "You
 * selected" summary.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    from: () => {
      const chain: any = {};
      const result = Promise.resolve({ data: null, error: null, count: 0 });
      for (const m of ["select", "eq", "or", "order", "limit"]) chain[m] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(() => result);
      chain.then = (r: any, j: any) => result.then(r, j);
      return chain;
    },
    rpc: () => Promise.resolve({ data: [], error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) }),
    removeChannel: () => {},
  },
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => Promise.resolve({} as any),
  getStripeEnvironment: () => "sandbox" as const,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u_1", email: "u@vela.ai" }, loading: false }),
}));

vi.mock("@/hooks/useEntitlements", () => ({
  useEntitlements: () => ({
    tier: "free", planSlug: "explorer", planName: "Explorer",
    featureKeys: new Set<string>(), betaActive: false, source: "free",
    limits: { maxPortfolios: 1, maxPositionsPerPortfolio: 10, maxWatchlist: 5, maxAiQuestionsPerMonth: 5 },
    loading: false, refresh: () => {}, has: () => false,
  }),
}));

vi.mock("@/hooks/useAiCredits", () => ({
  useAiCredits: () => ({
    loading: false, status: null, used: 0, remaining: 0, pctUsed: 0,
    hasCap: false, unlimited: false, exhausted: false, limit: null, refresh: () => {},
  }),
}));

vi.mock("@/components/billing/PromoCodeField", () => ({
  PromoCodeField: () => <div data-testid="promo-field" />,
}));

vi.mock("@/components/StripeEmbeddedCheckout", () => ({
  StripeEmbeddedCheckout: () => <div data-testid="stripe-checkout" />,
}));

import Upgrade from "@/pages/Upgrade";

describe("/upgrade?plan=plus", () => {
  it("renders the Plus tier in title + summary, not the Pro default", async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/upgrade?plan=plus"]}>
          <Upgrade />
        </MemoryRouter>
      </HelmetProvider>,
    );

    // Page title reflects Plus.
    const heading = await screen.findByRole("heading", { name: /Upgrade to Plus/i });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).not.toMatch(/Pro\b/);

    // "You selected" summary shows Plus, not Pro.
    const summary = screen.getByTestId("upgrade-selected-summary");
    expect(summary.textContent).toMatch(/You selected:\s*Plus/);
    expect(summary.textContent).not.toMatch(/\bPro\b/);
  });

  it("renders plan choices on bare /upgrade instead of defaulting to Pro", async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/upgrade"]}>
          <Upgrade />
        </MemoryRouter>
      </HelmetProvider>,
    );

    expect(await screen.findByRole("heading", { name: /Choose a plan/i })).toBeInTheDocument();

    const summary = screen.getByTestId("upgrade-selected-summary");
    expect(summary.textContent).toMatch(/You selected:\s*Choose a plan/);
    expect(summary.textContent).not.toMatch(/You selected:\s*Pro/);

    expect(screen.getByTestId("upgrade-plan-chooser")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Choose Plus/i })).toHaveAttribute("href", "/upgrade?plan=plus");
    expect(screen.getByRole("link", { name: /Choose Pro/i })).toHaveAttribute("href", "/upgrade?plan=pro");
  });
});
