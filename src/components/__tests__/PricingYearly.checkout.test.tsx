/**
 * End-to-end (mocked) test — user toggles the yearly frequency on the
 * public pricing surface, clicks Upgrade on the Pro plan, and we assert:
 *   1. `create-checkout` is invoked with `pro_yearly` (not `pro_monthly`)
 *   2. The correlationId set client-side is forwarded to the edge function
 *   3. `EmbeddedCheckoutProvider` mounts with a real client secret
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  __esModule: true, default: ({ value }: { value: number }) => <span>{value}</span>,
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
  useAuth: () => ({ user: { id: "u_yearly", email: "y@vela.ai" }, loading: false }),
}));

import { PricingSection } from "@/components/landing/pricing-section";

beforeEach(() => {
  invokeMock.mockReset();
  providerSpy.mockReset();
  invokeMock.mockResolvedValue({ data: { clientSecret: "cs_test_yearly_123" }, error: null });
});

describe("Pricing → yearly checkout", () => {
  it("clicking Upgrade after toggling yearly calls create-checkout with stripe_yearly_price_id", async () => {
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <PricingSection confirmBeforeCheckout={false} />
      </MemoryRouter>,
    );

    // Toggle to yearly.
    fireEvent.click(screen.getByRole("button", { name: /yearly/i }));
    // Click Pro CTA.
    fireEvent.click(screen.getByTestId("pricing-cta-pro"));

    await waitFor(() => expect(providerSpy).toHaveBeenCalled());
    const secret = await providerSpy.mock.calls[0][0].options.fetchClientSecret();
    expect(secret).toBe("cs_test_yearly_123");

    expect(invokeMock).toHaveBeenCalledWith(
      "create-checkout",
      expect.objectContaining({
        body: expect.objectContaining({
          priceId: "pro_yearly",
          userId: "u_yearly",
          customerEmail: "y@vela.ai",
          environment: "sandbox",
          correlationId: expect.any(String),
        }),
      }),
    );

    // Correlation id must be a non-empty string (uuid-like), so downstream
    // logs / Stripe metadata can be joined across surfaces.
    const body = invokeMock.mock.calls[0][1].body;
    expect(body.correlationId.length).toBeGreaterThan(8);

    expect(screen.getByTestId("embedded-checkout-mounted")).toBeInTheDocument();
  });
});