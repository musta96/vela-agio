/**
 * Smoke test: mount PlansBilling for a logged-in user with no active sub,
 * click Choose on the Pro plan, and assert:
 *   1. `create-checkout` is invoked with `pro_monthly` as the lookup key
 *   2. `EmbeddedCheckoutProvider` renders with a real client secret
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

// --- Mocks ---------------------------------------------------------------

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

const STABLE_USER = { id: "u_1", email: "u@vela.ai" };
const STABLE_AUTH = { user: STABLE_USER, loading: false };
vi.mock("@/hooks/useAuth", () => ({
  // Return the SAME object reference every call — PlansBilling has
  // `useEffect(..., [user])`, and a fresh object on every render would
  // cause an infinite re-render loop.
  useAuth: () => STABLE_AUTH,
}));

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

const providerSpy = vi.fn();
vi.mock("@stripe/react-stripe-js", () => ({
  EmbeddedCheckoutProvider: (props: any) => {
    providerSpy(props);
    return <div data-testid="ecp">{props.children}</div>;
  },
  EmbeddedCheckout: () => <div data-testid="embedded-checkout-mounted" />,
}));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve({} as any) }));

import PlansBilling from "@/pages/PlansBilling";

function buildQuery(rows: any) {
  // Chainable supabase query that resolves to `{ data: rows, error: null }`
  // for whichever terminator the page calls.
  const result = Promise.resolve({ data: rows, error: null });
  const chain: any = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => result);
  chain.then = (resolve: any, reject: any) => result.then(resolve, reject);
  return chain;
}

const PRO_PLAN = {
  id: "p_pro", slug: "pro", name: "Pro", tier: "pro",
  monthly_price_cents: 2900, yearly_price_cents: 24000,
  ai_monthly_quota: 1000, ai_model_tier: "advanced", monthly_credit_cap: null,
  features: ["Real-time"],
  stripe_monthly_price_id: "pro_monthly", stripe_yearly_price_id: "pro_yearly",
  highlighted: true, sort_order: 1, is_active: true,
};

describe("PlansBilling → Stripe checkout (smoke)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    fromMock.mockReset();
    providerSpy.mockReset();
    invokeMock.mockResolvedValue({ data: { clientSecret: "cs_test_plans_123" }, error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "subscriptions") return buildQuery(null);          // no active sub
      if (table === "subscription_plans") return buildQuery([PRO_PLAN]);
      return buildQuery([]);
    });
  });

  it("clicking the Pro plan calls create-checkout with stripe_monthly_price_id and mounts the provider", async () => {
    render(<HelmetProvider><MemoryRouter><PlansBilling /></MemoryRouter></HelmetProvider>);

    const cta = await screen.findByTestId("plan-cta-pro");
    fireEvent.click(cta);

    await waitFor(() => expect(providerSpy).toHaveBeenCalled());

    // Execute the provider's fetchClientSecret to trigger the edge call.
    const opts = providerSpy.mock.calls[0][0].options;
    expect(typeof opts.fetchClientSecret).toBe("function");
    const secret = await opts.fetchClientSecret();
    expect(secret).toBe("cs_test_plans_123");

    expect(invokeMock).toHaveBeenCalledWith(
      "create-checkout",
      expect.objectContaining({
        body: expect.objectContaining({
          priceId: "pro_monthly",     // = PRO_PLAN.stripe_monthly_price_id
          userId: "u_1",
          customerEmail: "u@vela.ai",
          environment: "sandbox",
        }),
      }),
    );

    expect(screen.getByTestId("embedded-checkout-mounted")).toBeInTheDocument();
  });

  it("shows a missing-key banner and disables checkout when the plan lacks stripe price IDs", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "subscriptions") return buildQuery(null);
      if (table === "subscription_plans") return buildQuery([{
        ...PRO_PLAN, slug: "broken", name: "Broken",
        stripe_monthly_price_id: null, stripe_yearly_price_id: null,
      }]);
      return buildQuery([]);
    });

    render(<HelmetProvider><MemoryRouter><PlansBilling /></MemoryRouter></HelmetProvider>);

    expect(await screen.findByTestId("plan-missing-key-broken")).toBeInTheDocument();
    const cta = screen.getByTestId("plan-cta-broken") as HTMLButtonElement;
    expect(cta).toBeDisabled();
    expect(invokeMock).not.toHaveBeenCalledWith("create-checkout", expect.anything());
  });
});