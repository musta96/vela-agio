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

function renderAt(path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Upgrade />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("/upgrade summary billing cycle", () => {
  it("shows Annual cycle when ?cycle=annual is provided", async () => {
    renderAt("/upgrade?plan=plus&cycle=annual");
    const summary = await screen.findByTestId("upgrade-selected-summary");
    expect(summary.textContent).toMatch(/You selected:\s*Plus/);
    expect(screen.getByTestId("upgrade-selected-cycle").textContent).toBe("Annual");
    expect(summary.textContent).toMatch(/Annual\s*billing/);
  });

  it("shows Monthly cycle when ?cycle=monthly is provided", async () => {
    renderAt("/upgrade?plan=pro&cycle=monthly");
    const summary = await screen.findByTestId("upgrade-selected-summary");
    expect(summary.textContent).toMatch(/You selected:\s*Pro/);
    expect(screen.getByTestId("upgrade-selected-cycle").textContent).toBe("Monthly");
    expect(summary.textContent).toMatch(/Monthly\s*billing/);
  });

  it("omits the cycle chunk when no cycle param is provided", async () => {
    renderAt("/upgrade?plan=plus");
    const summary = await screen.findByTestId("upgrade-selected-summary");
    expect(summary.textContent).toMatch(/You selected:\s*Plus/);
    expect(screen.queryByTestId("upgrade-selected-cycle")).toBeNull();
    expect(summary.textContent).not.toMatch(/billing/i);
  });
});