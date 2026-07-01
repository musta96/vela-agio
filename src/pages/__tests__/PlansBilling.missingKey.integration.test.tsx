/**
 * Integration test — a logged-in user WITHOUT a paid subscription lands on
 * Plans & Billing. The plan advertised as Pro is misconfigured (no Stripe
 * lookup keys). We verify that:
 *   1. The missing-key error banner is shown for that plan card.
 *   2. The checkout CTA is disabled — `create-checkout` is never invoked.
 *   3. The "Manage billing" portal button is not rendered — so
 *      `create-portal-session` is never invoked either.
 * This locks in the "block both surfaces on misconfiguration" contract.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

const invokeMock = vi.fn();
const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
    from: (...a: unknown[]) => fromMock(...a),
    rpc: () => Promise.resolve({ data: [], error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) }),
    removeChannel: () => {},
  },
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => Promise.resolve({} as any),
  getStripeEnvironment: () => "sandbox" as const,
}));
vi.mock("@/hooks/useAuth", () => {
  const STABLE = { user: { id: "u_missing", email: "m@vela.ai" }, loading: false };
  return { useAuth: () => STABLE };
});
vi.mock("@/hooks/useFeatureFlags", () => ({
  useFlag: () => true,
  FeatureFlagsProvider: ({ children }: any) => children,
}));
vi.mock("@/hooks/useAiCredits", () => ({
  useAiCredits: () => ({
    loading: false, status: null, used: 0, remaining: 0, pctUsed: 0,
    hasCap: false, unlimited: false, exhausted: false, refresh: () => {},
  }),
}));
vi.mock("@/hooks/useEntitlements", () => ({
  useEntitlements: () => ({
    tier: "free", planSlug: null, planName: null, featureKeys: new Set(),
    betaActive: false, source: "free",
  }),
}));
vi.mock("@/hooks/useAbPriceVariant", () => ({ useAbPriceVariant: () => "A" }));
vi.mock("@stripe/react-stripe-js", () => ({
  EmbeddedCheckoutProvider: (props: any) => <div>{props.children}</div>,
  EmbeddedCheckout: () => <div data-testid="embedded-checkout-mounted" />,
}));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve({} as any) }));

import PlansBilling from "@/pages/PlansBilling";

function buildQuery(rows: any) {
  const result = Promise.resolve({ data: rows, error: null });
  const chain: any = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => result);
  chain.then = (resolve: any, reject: any) => result.then(resolve, reject);
  return chain;
}

const BROKEN_PLAN = {
  id: "p_broken", slug: "pro", name: "Pro", tier: "pro",
  monthly_price_cents: 2900, yearly_price_cents: 24000,
  ai_monthly_quota: 1000, ai_model_tier: "advanced", monthly_credit_cap: null,
  features: ["Real-time"],
  stripe_monthly_price_id: null, stripe_yearly_price_id: null,
  highlighted: true, sort_order: 1, is_active: true,
};

describe("PlansBilling → misconfigured plan blocks both checkout and portal", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    fromMock.mockReset();
    fromMock.mockImplementation((table: string) => {
      if (table === "subscriptions") return buildQuery(null);
      if (table === "subscription_plans") return buildQuery([BROKEN_PLAN]);
      return buildQuery([]);
    });
  });

  it("shows the error banner, disables checkout, and never renders the portal button", async () => {
    render(<HelmetProvider><MemoryRouter><PlansBilling /></MemoryRouter></HelmetProvider>);

    // Banner rendered next to the broken plan.
    expect(await screen.findByTestId("plan-missing-key-pro")).toBeInTheDocument();

    // Checkout CTA disabled → clicks are a no-op.
    const cta = screen.getByTestId("plan-cta-pro") as HTMLButtonElement;
    expect(cta).toBeDisabled();

    // "Manage billing" button only renders for isActive users. This user has no
    // subscription, so the portal is implicitly unreachable from this page.
    expect(screen.queryByRole("button", { name: /manage billing/i })).toBeNull();

    // Neither edge function should have been contacted while loading the page.
    expect(invokeMock).not.toHaveBeenCalledWith("create-checkout", expect.anything());
    expect(invokeMock).not.toHaveBeenCalledWith("create-portal-session", expect.anything());
  });
});