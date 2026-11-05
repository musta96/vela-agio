import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const mocks = vi.hoisted(() => ({ sync: vi.fn(), purchase: vi.fn(), restore: vi.fn(), offerings: vi.fn(), refresh: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("@/hooks/useEntitlements", () => ({ useEntitlements: () => ({ source: "free", refresh: mocks.refresh }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) } } }));
vi.mock("@/lib/applePurchases", () => ({
  withAppleAccount: (_id: string, operation: () => unknown) => operation(), verifyApplePurchase: mocks.sync,
  clearAppleAccount: vi.fn(), applePurchaseError: (error: Error) => ({ cancelled: false, message: error.message }),
  Purchases: { getOfferings: mocks.offerings, purchasePackage: mocks.purchase, restorePurchases: mocks.restore },
}));
import { AppleSubscriptionPanel } from "@/components/billing/AppleSubscriptionPanel";
const unpaid = { active: false, hasPaidAccess: false, provider: null, expiresAt: null, willRenew: false };
const pkg = { product: { identifier: "vela_pro_monthly", priceString: "€29.00", subscriptionPeriod: "P1M" } };
beforeEach(() => { vi.clearAllMocks(); mocks.sync.mockResolvedValue(unpaid); mocks.offerings.mockResolvedValue({ current: { availablePackages: [pkg] } }); });
function setup() { render(<MemoryRouter><AppleSubscriptionPanel /></MemoryRouter>); }
describe("Apple purchase control flow", () => {
  it("only purchases the approved package after server duplicate check", async () => {
    setup(); const buy = await screen.findByRole("button", { name: "Subscribe with Apple" });
    await waitFor(() => expect(buy).toBeEnabled());
    mocks.sync.mockResolvedValueOnce(unpaid).mockResolvedValueOnce({ ...unpaid, active: true, hasPaidAccess: true, provider: "apple" });
    fireEvent.click(buy);
    await waitFor(() => expect(mocks.purchase).toHaveBeenCalledWith({ aPackage: pkg }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.sync).toHaveBeenCalledTimes(3);
  });
  it("does not offer a second Apple purchase to a paid website subscriber", async () => {
    mocks.sync.mockResolvedValue({ ...unpaid, hasPaidAccess: true, provider: "web" });
    setup(); await waitFor(() => expect(mocks.offerings).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Subscribe with Apple" })).toBeNull();
    expect(mocks.purchase).not.toHaveBeenCalled();
  });
  it("restores then verifies before refreshing paid access", async () => {
    setup(); const restore = await screen.findByRole("button", { name: "Restore purchases" });
    await waitFor(() => expect(restore).toBeEnabled());
    fireEvent.click(restore);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect(mocks.sync).toHaveBeenCalledTimes(2);
    expect(mocks.purchase).not.toHaveBeenCalled();
  });
  it("failed server verification never enables a purchase", async () => {
    mocks.sync.mockRejectedValue(new Error("unavailable")); setup();
    const buy = await screen.findByRole("button", { name: "Subscribe with Apple" });
    await waitFor(() => expect(buy).toBeDisabled());
    expect(mocks.purchase).not.toHaveBeenCalled();
  });
  it("rejects sample Test Store products", async () => {
    mocks.offerings.mockResolvedValue({ current: { availablePackages: [{ product: { identifier: "monthly", subscriptionPeriod: "P1M" } }] } });
    setup(); const buy = await screen.findByRole("button", { name: "Subscribe with Apple" });
    await waitFor(() => expect(mocks.offerings).toHaveBeenCalled());
    expect(buy).toBeDisabled();
  });
});