/**
 * Verifies /upgrade renders correctly when navigated to from
 * Settings > Plans & Billing with `?plan=pro&cycle=annual`:
 *   - The CurrentPlanBanner reflects the user's active entitlement.
 *   - The upgrade stepper is on the "Review plan" step.
 *   - The Annual billing toggle is preselected (from the ?cycle param).
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
      for (const m of ["select", "eq", "order", "limit"]) chain[m] = vi.fn(() => chain);
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

const STABLE_AUTH = { user: { id: "u_1", email: "u@vela.ai" }, loading: false };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => STABLE_AUTH }));

vi.mock("@/hooks/useEntitlements", () => ({
  useEntitlements: () => ({
    tier: "free",
    planSlug: "explorer",
    planName: "Explorer",
    featureKeys: new Set<string>(),
    betaActive: false,
    source: "free",
    limits: { maxPortfolios: 1, maxPositionsPerPortfolio: 10, maxWatchlist: 5, maxAiQuestionsPerMonth: 5 },
    loading: false,
    refresh: () => {},
    has: () => false,
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

describe("Upgrade page (entered from Plans & Billing)", () => {
  it("shows the current-plan banner, review step, and preselected annual cycle", async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/upgrade?plan=pro&cycle=annual"]}>
          <Upgrade />
        </MemoryRouter>
      </HelmetProvider>,
    );

    // Current-plan banner is rendered with the user's active plan.
    const banner = await screen.findByTestId("current-plan-banner");
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toMatch(/Explorer/i);

    // Progress stepper is on step 1: Review plan.
    const stepper = screen.getByTestId("upgrade-stepper");
    expect(stepper).toBeInTheDocument();
    const reviewStep = screen.getByText("Review plan").closest("li")!;
    expect(reviewStep.querySelector('[aria-current="step"]')).not.toBeNull();

    // Annual cycle button is preselected from ?cycle=annual.
    const annualBtn = screen.getByRole("button", { name: /^Annual/i });
    expect(annualBtn.className).toMatch(/font-semibold/);
    const monthlyBtn = screen.getByRole("button", { name: /^Monthly$/i });
    expect(monthlyBtn.className).not.toMatch(/font-semibold/);
  });
});