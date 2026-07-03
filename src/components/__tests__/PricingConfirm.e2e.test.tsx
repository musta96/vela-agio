/**
 * End-to-end (mocked) test for the /pricing confirm-then-checkout flow.
 *
 * 1. User clicks the Pro CTA on the pricing section.
 * 2. `PlanConfirmDialog` opens and shows the correct summary
 *    — trial line, effective total, and the exact Stripe `priceId`
 *    (lookup key) that will be sent server-side.
 * 3. User clicks "Continue to payment" → `create-checkout` is invoked
 *    with the matching `priceId` and Stripe Embedded Checkout mounts.
 *
 * Covers both the monthly (pro_monthly) and yearly (pro_annual) paths
 * so we catch drift between the visible summary and the checkout call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invokeMock(...a) } },
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => Promise.resolve({} as any),
  getStripeEnvironment: () => "sandbox" as const,
}));
vi.mock("@number-flow/react", () => ({
  __esModule: true,
  default: ({ value }: { value: number }) => <span>{value}</span>,
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
  useAuth: () => ({ user: { id: "u_confirm", email: "c@vela.ai" }, loading: false }),
}));

vi.mock("@/hooks/useEntitlements", () => ({
  useEntitlements: () => ({
    tier: "explorer", planSlug: "explorer", planName: "Explorer",
    featureKeys: new Set<string>(), betaActive: false, source: "free" as const,
    limits: { maxPortfolios: 1, maxPositionsPerPortfolio: 10, maxWatchlist: 5, maxAiQuestionsPerMonth: 5 },
    loading: false, refresh: async () => {}, has: () => false,
  }),
}));

import { PricingSection } from "@/components/landing/pricing-section";

beforeEach(() => {
  invokeMock.mockReset();
  providerSpy.mockReset();
  invokeMock.mockResolvedValue({ data: { clientSecret: "cs_test_confirm_123" }, error: null });
});

describe("Pricing → confirm dialog → Stripe checkout", () => {
  it("clicking Pro (monthly) shows the confirm summary and starts checkout with pro_monthly", async () => {
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <PricingSection />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("pricing-cta-pro"));

    // Confirm dialog opens with the right summary.
    const dialog = await screen.findByTestId("plan-confirm-dialog");
    const scoped = within(dialog);

    // Trial line — Pro has no trial.
    expect(scoped.getByText(/no trial/i)).toBeInTheDocument();

    // Effective total for monthly cadence: €29 / month.
    expect(scoped.getByText(/charged monthly/i)).toBeInTheDocument();
    expect(scoped.getByText(/€29/)).toBeInTheDocument();

    // The exact Stripe price id displayed matches what will be sent.
    expect(scoped.getByTestId("confirm-price-id")).toHaveTextContent("pro_monthly");

    // Continue → Embedded Checkout mounts and edge function is called.
    fireEvent.click(scoped.getByTestId("plan-confirm-continue"));

    await waitFor(() => expect(providerSpy).toHaveBeenCalled());
    await providerSpy.mock.calls[0][0].options.fetchClientSecret();

    expect(invokeMock).toHaveBeenCalledWith(
      "create-checkout",
      expect.objectContaining({
        body: expect.objectContaining({
          priceId: "pro_monthly",
          userId: "u_confirm",
          customerEmail: "c@vela.ai",
          environment: "sandbox",
        }),
      }),
    );
    expect(screen.getByTestId("embedded-checkout-mounted")).toBeInTheDocument();
  });

  it("clicking Pro (yearly) shows the annual summary and starts checkout with pro_annual", async () => {
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <PricingSection />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /yearly/i }));
    fireEvent.click(screen.getByTestId("pricing-cta-pro"));

    const dialog = await screen.findByTestId("plan-confirm-dialog");
    const scoped = within(dialog);

    // Annual cadence badge + total row.
    expect(scoped.getByText(/annual/i)).toBeInTheDocument();
    expect(scoped.getByText(/billed today/i)).toBeInTheDocument();
    // Pro annual total = €288 / yr, effective monthly €24 / mo.
    expect(scoped.getByText(/€288/)).toBeInTheDocument();
    expect(scoped.getByText(/effective monthly/i)).toBeInTheDocument();
    expect(scoped.getByText(/€24 \/ mo/i)).toBeInTheDocument();

    // Trial + Stripe price id.
    expect(scoped.getByText(/no trial/i)).toBeInTheDocument();
    expect(scoped.getByTestId("confirm-price-id")).toHaveTextContent("pro_annual");

    fireEvent.click(scoped.getByTestId("plan-confirm-continue"));

    await waitFor(() => expect(providerSpy).toHaveBeenCalled());
    await providerSpy.mock.calls.at(-1)![0].options.fetchClientSecret();

    expect(invokeMock).toHaveBeenCalledWith(
      "create-checkout",
      expect.objectContaining({
        body: expect.objectContaining({
          priceId: "pro_annual",
          userId: "u_confirm",
          environment: "sandbox",
        }),
      }),
    );
  });
});
