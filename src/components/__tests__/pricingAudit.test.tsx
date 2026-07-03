/**
 * Route + CTA audit — asserts:
 *   1. Every registered upgrade entry point routes to `/pricing` (or opens
 *      the shared UpgradeModal). No rogue `/upgrade` or ad-hoc destinations.
 *   2. Clicking each self-serve plan on `/pricing` opens the confirmation
 *      dialog with the exact Stripe `price_id` derived from PLAN_FEATURES.
 *   3. The PRICE_ID_SNAPSHOT matches PLAN_FEATURES — catches drift.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => Promise.resolve({} as any),
  getStripeEnvironment: () => "sandbox" as const,
}));
vi.mock("@number-flow/react", () => ({
  __esModule: true,
  default: ({ value }: { value: number }) => <span>{value}</span>,
}));
vi.mock("@stripe/react-stripe-js", () => ({
  EmbeddedCheckoutProvider: ({ children }: any) => <div>{children}</div>,
  EmbeddedCheckout: () => <div data-testid="embedded-checkout-mounted" />,
}));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve({} as any) }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u_audit", email: "audit@vela.ai" }, loading: false }),
}));
vi.mock("@/hooks/useEntitlements", () => ({
  useEntitlements: () => ({
    tier: "explorer",
    planSlug: "explorer",
    planName: "Explorer",
    featureKeys: new Set<string>(),
    betaActive: false,
    source: "free" as const,
    limits: { maxPortfolios: 1, maxPositionsPerPortfolio: 10, maxWatchlist: 5, maxAiQuestionsPerMonth: 5 },
    loading: false,
    refresh: async () => {},
    has: () => false,
  }),
}));

import { PricingSection } from "@/components/landing/pricing-section";
import {
  AUDIT_UPGRADE_ENTRIES,
  PRICE_ID_SNAPSHOT,
  UPGRADE_ROUTE,
  getExpectedPriceId,
  isLegacyUpgradeRoute,
} from "@/lib/pricingAudit";
import { PLAN_FEATURES } from "@/lib/planFeatures";

describe("Pricing / upgrade audit", () => {
  beforeEach(() => {
    // Reset URL between tests.
    window.history.replaceState({}, "", "/");
  });

  it("PRICE_ID_SNAPSHOT matches PLAN_FEATURES.lookupKey (catches drift)", () => {
    expect(PRICE_ID_SNAPSHOT.explorer).toEqual({ monthly: null, annual: null });
    expect(PRICE_ID_SNAPSHOT.enterprise).toEqual({ monthly: null, annual: null });
    expect(PRICE_ID_SNAPSHOT.plus).toEqual({
      monthly: PLAN_FEATURES.plus.lookupKey!.monthly,
      annual: PLAN_FEATURES.plus.lookupKey!.annual,
    });
    expect(PRICE_ID_SNAPSHOT.pro).toEqual({
      monthly: PLAN_FEATURES.pro.lookupKey!.monthly,
      annual: PLAN_FEATURES.pro.lookupKey!.annual,
    });
  });

  it("every registered route entry points to /pricing or /plans-billing — never legacy /upgrade", () => {
    for (const entry of AUDIT_UPGRADE_ENTRIES) {
      if (entry.kind !== "route" || !entry.href) continue;
      expect(
        isLegacyUpgradeRoute(entry.href),
        `${entry.id} (${entry.location}) still points at legacy /upgrade`,
      ).toBe(false);
      // Every actual upgrade CTA must resolve to /pricing. The one exception
      // is the sidebar billing management link (kept at /plans-billing).
      if (entry.id !== "sidebar-plans-billing") {
        expect(
          entry.href,
          `${entry.id} does not point at ${UPGRADE_ROUTE}`,
        ).toBe(UPGRADE_ROUTE);
      }
    }
  });

  it("clicking Pro on /pricing opens confirm dialog with pro_monthly price id", () => {
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <PricingSection />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("pricing-cta-pro"));

    const dialog = screen.getByTestId("plan-confirm-dialog");
    const priceCell = within(dialog).getByTestId("confirm-price-id");
    expect(priceCell.textContent).toBe(getExpectedPriceId("pro", "monthly"));
  });

  it("clicking Plus after toggling yearly opens confirm dialog with plus_annual price id", () => {
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <PricingSection />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /yearly/i }));
    fireEvent.click(screen.getByTestId("pricing-cta-plus"));

    const dialog = screen.getByTestId("plan-confirm-dialog");
    const priceCell = within(dialog).getByTestId("confirm-price-id");
    expect(priceCell.textContent).toBe(getExpectedPriceId("plus", "annual"));
  });
});