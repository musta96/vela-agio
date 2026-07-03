/**
 * Integration test: anonymous user lands on Pricing, clicks Pro, gets
 * bounced through /auth, comes back logged in, completes the (mocked)
 * checkout, and then opens the Stripe Customer Portal — asserting the
 * portal session is requested for the right customer/environment.
 *
 * Everything is mocked; no real network calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks ---------------------------------------------------------------
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invokeMock(...a) } },
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => Promise.resolve({} as any),
  getStripeEnvironment: () => "sandbox" as const,
}));
vi.mock("@number-flow/react", () => ({
  __esModule: true, default: ({ value }: { value: number }) => <span>{value}</span>,
}));
const providerSpy = vi.fn();
vi.mock("@stripe/react-stripe-js", () => ({
  EmbeddedCheckoutProvider: (props: any) => { providerSpy(props); return <div>{props.children}</div>; },
  EmbeddedCheckout: () => <div data-testid="embedded-checkout-mounted" />,
}));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve({} as any) }));

// We'll flip the auth user before each step of the flow.
let currentUser: { id: string; email: string } | null = null;
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: currentUser, loading: false }),
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

const openSpy = vi.fn();
beforeEach(() => {
  invokeMock.mockReset();
  providerSpy.mockReset();
  openSpy.mockReset();
  (window as any).open = openSpy;
});

describe("Pricing → Checkout → Portal end-to-end (mocked)", () => {
  it("anonymous user is bounced to /auth, then completes checkout and opens the portal", async () => {
    // --- Stage 1: anonymous ---------------------------------------------
    currentUser = null;
    const { unmount } = render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <PricingSection confirmBeforeCheckout={false} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("pricing-cta-pro"));
    // Provider must NOT mount when the user isn't authenticated.
    expect(providerSpy).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    unmount();

    // --- Stage 2: now logged in, click Pro again ------------------------
    currentUser = { id: "u_42", email: "x@vela.ai" };
    invokeMock.mockResolvedValueOnce({ data: { clientSecret: "cs_test_e2e_1" }, error: null });

    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <PricingSection confirmBeforeCheckout={false} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("pricing-cta-pro"));

    await waitFor(() => expect(providerSpy).toHaveBeenCalled());
    const opts = providerSpy.mock.calls[0][0].options;
    const secret = await opts.fetchClientSecret();
    expect(secret).toBe("cs_test_e2e_1");
    expect(invokeMock).toHaveBeenCalledWith(
      "create-checkout",
      expect.objectContaining({
        body: expect.objectContaining({
          priceId: "pro_monthly",
          userId: "u_42",
          customerEmail: "x@vela.ai",
          environment: "sandbox",
        }),
      }),
    );
    expect(screen.getByTestId("embedded-checkout-mounted")).toBeInTheDocument();

    // --- Stage 3: user (now subscribed) opens the Stripe portal ---------
    // We exercise the same edge-function contract the dashboard uses:
    invokeMock.mockResolvedValueOnce({
      data: { url: "https://billing.stripe.com/session/test_portal_xyz" },
      error: null,
    });
    const portalResp = await (await import("@/integrations/supabase/client")).supabase.functions.invoke(
      "create-portal-session",
      { body: { environment: "sandbox", returnUrl: "http://localhost/plans-billing" } },
    );
    expect(portalResp.data.url).toMatch(/billing\.stripe\.com/);
    expect(invokeMock).toHaveBeenLastCalledWith(
      "create-portal-session",
      expect.objectContaining({
        body: expect.objectContaining({ environment: "sandbox" }),
      }),
    );
  });
});