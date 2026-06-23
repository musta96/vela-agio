import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks ----------------------------------------------------------------

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

// Bypass the env-var-driven Stripe bootstrapping — that path reads
// `import.meta.env` at module-load time which can't be patched after import.
vi.mock("@/lib/stripe", () => ({
  getStripe: () => Promise.resolve({} as any),
  getStripeEnvironment: () => "sandbox" as const,
}));

// NumberFlow uses custom-element internals that don't survive jsdom re-renders.
vi.mock("@number-flow/react", () => ({
  __esModule: true,
  default: ({ value }: { value: number }) => <span>{value}</span>,
}));

// Capture the props EmbeddedCheckoutProvider receives so we can assert it
// mounted with a real clientSecret.
const providerSpy = vi.fn();
vi.mock("@stripe/react-stripe-js", () => ({
  EmbeddedCheckoutProvider: (props: any) => {
    providerSpy(props);
    return <div data-testid="ecp">{props.children}</div>;
  },
  EmbeddedCheckout: () => <div data-testid="embedded-checkout-mounted" />,
}));

// Don't actually load real Stripe.js in jsdom.
vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve({} as any) }));

// Logged-in user for the checkout call.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-123", email: "test@vela.ai" }, loading: false }),
}));

import { PricingSection } from "@/components/landing/pricing-section";

function renderPricing() {
  return render(
    <MemoryRouter>
      <PricingSection />
    </MemoryRouter>,
  );
}

describe("Pricing CTA → Stripe Embedded Checkout (smoke)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    providerSpy.mockReset();
    invokeMock.mockResolvedValue({ data: { clientSecret: "cs_test_smoke_123" }, error: null });
  });

  it("clicking the Pro tier calls create-checkout with the pro_monthly lookup key", async () => {
    renderPricing();

    fireEvent.click(screen.getByTestId("pricing-cta-pro"));

    // EmbeddedCheckoutProvider should have mounted, which triggers fetchClientSecret().
    await waitFor(() => expect(providerSpy).toHaveBeenCalled());

    // Run the fetchClientSecret callback the provider received and assert the
    // edge function got the right payload.
    const opts = providerSpy.mock.calls[0][0].options;
    expect(typeof opts.fetchClientSecret).toBe("function");
    const secret = await opts.fetchClientSecret();
    expect(secret).toBe("cs_test_smoke_123");

    expect(invokeMock).toHaveBeenCalledWith(
      "create-checkout",
      expect.objectContaining({
        body: expect.objectContaining({
          priceId: "pro_monthly",
          userId: "user-123",
          customerEmail: "test@vela.ai",
          environment: "sandbox",
        }),
      }),
    );

    // And the EmbeddedCheckout itself is mounted in the tree.
    expect(screen.getByTestId("embedded-checkout-mounted")).toBeInTheDocument();
  });

  it("switching to yearly sends pro_yearly", async () => {
    renderPricing();

    // The frequency toggle has two buttons labelled Monthly / Yearly.
    fireEvent.click(screen.getByRole("button", { name: /yearly/i }));
    fireEvent.click(screen.getByTestId("pricing-cta-pro"));

    await waitFor(() => expect(providerSpy).toHaveBeenCalled());
    const opts = providerSpy.mock.calls.at(-1)![0].options;
    await opts.fetchClientSecret();

    expect(invokeMock).toHaveBeenCalledWith(
      "create-checkout",
      expect.objectContaining({
        body: expect.objectContaining({ priceId: "pro_yearly" }),
      }),
    );
  });
});