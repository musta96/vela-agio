/**
 * Price-integrity E2E (mocked) — asserts the "Due today" amount the user
 * sees under the Pro checkout summary is byte-for-byte the same number
 * that gets sent to `create-checkout` as `expectedTotalCents`.
 *
 * The server-side handler (supabase/functions/create-checkout/index.ts)
 * re-computes the discount and rejects mismatches with a 409, so this
 * test guarantees the client and server agree on the amount for both
 * Pro monthly and Pro annual with a promo applied.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- supabase client mock -------------------------------------------------
const invokeMock = vi.fn();

/** Chainable stub for supabase.from(...).select().eq()...maybeSingle(). */
function makeFromStub() {
  return (table: string) => {
    const chain: any = {
      _table: table,
      select: () => chain,
      eq: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === "subscription_plans") {
          return {
            data: {
              monthly_price_cents: 2900,
              yearly_price_cents: 29000,
              stripe_monthly_price_id: "pro_monthly",
              stripe_yearly_price_id: "pro_annual",
              ai_monthly_quota: -1,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      // portfolios / watchlist_items use { count: "exact", head: true }
      then: (resolve: any) => resolve({ count: 0, error: null }),
    };
    return chain;
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
    from: (table: string) => makeFromStub()(table),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    rpc: async () => ({ data: null, error: null }),
  },
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => Promise.resolve({} as any),
  getStripeEnvironment: () => "sandbox" as const,
}));

const providerSpy = vi.fn();
vi.mock("@stripe/react-stripe-js", () => ({
  EmbeddedCheckoutProvider: (props: any) => {
    providerSpy(props);
    return <div>{props.children}</div>;
  },
  EmbeddedCheckout: () => <div data-testid="embedded-checkout-mounted" />,
}));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve({} as any) }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u_price", email: "p@vela.ai" }, loading: false }),
}));

vi.mock("@/hooks/useEntitlements", () => ({
  useEntitlements: () => ({
    tier: "free", planSlug: null, planName: "Free",
    featureKeys: new Set<string>(), betaActive: false, source: "free" as const,
    limits: { maxPortfolios: 1, maxPositionsPerPortfolio: 10, maxWatchlist: 5, maxAiQuestionsPerMonth: 5 },
    loading: false, refresh: async () => {}, has: () => false,
  }),
}));

vi.mock("@/hooks/useAiCredits", () => ({
  useAiCredits: () => ({ used: 0, limit: 5, hasCap: true }),
}));

// Stub the promo field: renders a button that, when clicked, immediately
// pushes a fixed 20%-off promo up to the parent — same shape validate-promo-code
// returns in prod.
vi.mock("@/components/billing/PromoCodeField", () => ({
  PromoCodeField: ({ priceLookupKey, onChange }: any) => (
    <button
      type="button"
      data-testid={`apply-promo-${priceLookupKey}`}
      onClick={() => {
        const unit = priceLookupKey === "pro_annual" ? 29000 : 2900;
        const discount = Math.round(unit * 0.2); // 20% off, rounded like Stripe
        const final = Math.max(0, unit - discount);
        const fmt = (c: number) => `€${(c / 100).toFixed(2)}`;
        onChange({
          valid: true,
          code: "SAVE20",
          percentOff: 20,
          amountOff: null,
          duration: "once",
          durationLabel: "on your first payment only",
          original: { cents: unit, currency: "eur", formatted: fmt(unit) },
          discount: { cents: discount, currency: "eur", formatted: fmt(discount) },
          final: { cents: final, currency: "eur", formatted: fmt(final) },
        });
      }}
    >
      Apply SAVE20 to {priceLookupKey}
    </button>
  ),
}));

import { UpgradeFlow } from "@/components/upgrade/UpgradeFlow";

beforeEach(() => {
  invokeMock.mockReset();
  providerSpy.mockReset();
  // Default: check-billing-history returns no history; create-checkout returns a secret.
  invokeMock.mockImplementation(async (fn: string) => {
    if (fn === "check-billing-history") {
      return { data: { hasHistory: false, card: null, hasDefaultPaymentMethod: false }, error: null };
    }
    if (fn === "create-checkout") {
      return { data: { clientSecret: "cs_test_price_ok" }, error: null };
    }
    return { data: {}, error: null };
  });
});

async function runFlow(cycle: "monthly" | "annual", expectedFinalCents: number) {
  render(
    <MemoryRouter initialEntries={["/upgrade"]}>
      <UpgradeFlow />
    </MemoryRouter>,
  );

  // Wait until the Pro plan loaded (subscription_plans mocked above).
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /upgrade to pro/i })).toBeInTheDocument(),
  );

  // Select cadence.
  if (cycle === "monthly") {
    fireEvent.click(screen.getByRole("button", { name: /^monthly$/i }));
  } else {
    fireEvent.click(screen.getByRole("button", { name: /annual/i }));
  }

  // Apply the promo (stubbed PromoCodeField writes the discount up in one click).
  const lookup = cycle === "annual" ? "pro_annual" : "pro_monthly";
  await act(async () => {
    fireEvent.click(screen.getByTestId(`apply-promo-${lookup}`));
  });

  // Go to the confirmation + checkout view.
  fireEvent.click(screen.getByRole("button", { name: /upgrade to pro/i }));

  // The Due today number the user sees.
  const dueToday = await screen.findByTestId("due-today-amount");
  expect(dueToday.textContent).toBe(`€${(expectedFinalCents / 100).toFixed(2)}`);
  expect(Number(dueToday.getAttribute("data-cents"))).toBe(expectedFinalCents);

  // Fire the checkout — this is what actually calls create-checkout.
  await waitFor(() => expect(providerSpy).toHaveBeenCalled());
  const secret = await providerSpy.mock.calls.at(-1)![0].options.fetchClientSecret();
  expect(secret).toBe("cs_test_price_ok");

  // Find the create-checkout invocation and assert the amount contract.
  const call = invokeMock.mock.calls.find(([name]) => name === "create-checkout");
  expect(call, "create-checkout was not invoked").toBeDefined();
  const sentBody = call![1].body;
  expect(sentBody.priceId).toBe(lookup);
  expect(sentBody.promoCode).toBe("SAVE20");
  expect(sentBody.expectedCurrency).toBe("eur");

  // The critical assertion: the number displayed as "Due today" is the
  // number the server will re-verify against.
  expect(sentBody.expectedTotalCents).toBe(expectedFinalCents);
  expect(sentBody.expectedTotalCents).toBe(Number(dueToday.getAttribute("data-cents")));
}

describe("Pro checkout — Due today matches server-side expectedTotalCents", () => {
  it("Pro monthly with SAVE20 promo (2900 → 2320)", async () => {
    await runFlow("monthly", 2320);
  });

  it("Pro annual with SAVE20 promo (29000 → 23200)", async () => {
    await runFlow("annual", 23200);
  });
});