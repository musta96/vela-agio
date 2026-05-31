import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

/**
 * Verifies that the dashboard donut + totals share the same computed total
 * coming out of `useNetWorthTotal`, and that changing the base currency
 * causes both to re-render to the same new total. This is the regression
 * guard for "donut and KPI tile disagree" bugs.
 */

// ---- supabase mock ----
const accounts = [
  // 1000 USD cash, asset
  { id: "a1", category: "cash", currency: "USD", manual_value: 1000, is_liability: false, include_in_total: true, linked_portfolio_ids: null },
  // 500 EUR investments, asset
  { id: "a2", category: "investments", currency: "EUR", manual_value: 500, is_liability: false, include_in_total: true, linked_portfolio_ids: null },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => Promise.resolve({ data: table === "net_worth_accounts" ? accounts : [], error: null }),
      eq: function () { return this; },
      maybeSingle: () => Promise.resolve({ data: null }),
    }),
    functions: {
      // Deterministic FX so we can assert exact totals.
      // USDEUR = 0.9, EURUSD = 1/0.9
      invoke: async (_name: string, { body }: any) => {
        const pair = body?.pair;
        const rates: Record<string, number> = { USDEUR: 0.9, EURUSD: 1 / 0.9 };
        return { data: { rate: { rate: rates[pair] } }, error: null };
      },
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, session: null, loading: false, signOut: async () => {} }),
}));

// Stable refs so the convert-effect doesn't re-run every render → infinite loop.
const STABLE_QUOTES = Object.freeze({});
const NOOP = () => {};
vi.mock("@/hooks/useLiveQuotes", () => ({
  useLiveQuotes: () => ({ quotes: STABLE_QUOTES, refresh: NOOP, loading: false }),
}));

vi.mock("@/hooks/useBaseCurrency", () => ({
  useBaseCurrency: () => ({ baseCurrency: "EUR", setBaseCurrency: async () => {}, loading: false }),
}));

import { useNetWorthTotal } from "@/hooks/useNetWorthTotal";

function Surface({ base, label }: { base: string; label: string }) {
  const nw = useNetWorthTotal(base);
  // Two consumers that must agree: the "tile" total and the "donut" sum.
  const donutSum = Object.values(nw.byCategory).reduce((s, v) => s + v, 0);
  return (
    <div>
      <div data-testid={`${label}-tile`}>{Math.round(nw.total)}</div>
      <div data-testid={`${label}-donut`}>{Math.round(donutSum)}</div>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("net worth single source of truth", () => {
  it("donut sum equals the tile total in the same currency", async () => {
    render(<Surface base="EUR" label="eur" />);
    await waitFor(() => {
      // 1000 USD * 0.9 = 900 EUR + 500 EUR = 1400 EUR
      expect(screen.getByTestId("eur-tile").textContent).toBe("1400");
      expect(screen.getByTestId("eur-donut").textContent).toBe("1400");
    });
  });

  it("switching base currency updates donut and totals to the same new number", async () => {
    const { rerender } = render(<Surface base="EUR" label="x" />);
    await waitFor(() => {
      expect(screen.getByTestId("x-tile").textContent).toBe("1400");
    });

    rerender(<Surface base="USD" label="x" />);
    await waitFor(() => {
      // 1000 USD (no FX) + 500 EUR * (1/0.9) ≈ 555.55 → total ≈ 1556
      const tile = Number(screen.getByTestId("x-tile").textContent);
      const donut = Number(screen.getByTestId("x-donut").textContent);
      expect(tile).toBeCloseTo(1556, -1);
      expect(donut).toBe(tile); // donut and tile MUST agree
    });
  });
});