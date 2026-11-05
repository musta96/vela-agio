import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
const checkout = vi.hoisted(() => vi.fn());
vi.mock("@/lib/native", () => ({ isIosNative: () => true, hidePurchaseUi: () => true }));
vi.mock("@/hooks/useStripeCheckout", () => ({ useStripeCheckout: checkout }));
vi.mock("@/components/billing/AppleSubscriptionPanel", () => ({ AppleSubscriptionPanel: () => <section aria-label="Apple subscription" /> }));
import { PricingSection } from "@/components/landing/pricing-section";
describe("Native pricing provider", () => {
  it("routes iOS pricing to Apple without initializing website checkout", () => {
    render(<PricingSection />);
    expect(screen.getByRole("region", { name: "Apple subscription" })).toBeInTheDocument();
    expect(checkout).not.toHaveBeenCalled();
  });
});