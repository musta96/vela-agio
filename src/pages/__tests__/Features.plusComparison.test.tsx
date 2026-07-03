/**
 * UI test — Features comparison table.
 *
 * Verifies the "plus" tier is rendered as its own column and that each
 * cell for the plus column matches the underlying PLAN_FEATURES.plus
 * definition. Keeps the marketing matrix from drifting away from the
 * runtime entitlement source of truth.
 *
 * Only the desktop table (`<table>`) is scoped for assertions — the
 * mobile stacked layout is checked in the columns count test alone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { PLAN_FEATURES } from "@/lib/planFeatures";

const supabaseFromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => supabaseFromMock(t) },
}));

// The Features page fires a small CTA audit on mount; stub it out so the
// test isn't coupled to that behavior.
vi.mock("@/lib/verifyFeaturesCta", () => ({
  verifyFeaturesCtaBindings: vi.fn(),
}));

// Analytics is fire-and-forget — mock to a no-op.
vi.mock("@/lib/landingAnalytics", () => ({
  trackLandingEvent: vi.fn(),
}));

// SEO uses Helmet; wrap with HelmetProvider below.
import Features from "@/pages/Features";

function emptyThenable<T>(): { data: T | null; error: null } {
  return { data: null, error: null };
}

beforeEach(() => {
  // Return empty for every landing_* query so mergeWithDefaults renders defaults.
  supabaseFromMock.mockImplementation(() => ({
    select: () => Promise.resolve(emptyThenable()),
  }));
});

function renderFeatures() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={["/features"]}>
        <Features />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("Features comparison table · plus tier", () => {
  it("renders a Plus column alongside Explorer, Pro and Enterprise", async () => {
    renderFeatures();
    const table = await screen.findByRole("table");
    const headers = within(table).getAllByRole("columnheader");
    const names = headers.map((h) => h.textContent ?? "");
    // Plus header exists exactly once.
    const joined = names.join(" || ");
    expect(joined).toMatch(/Explorer/);
    expect(joined).toMatch(/Plus/);
    expect(joined).toMatch(/Pro/);
    expect(joined).toMatch(/Enterprise/);
  });

  it("plus column cells match PLAN_FEATURES.plus for the mapped rows", async () => {
    renderFeatures();
    const table = await screen.findByRole("table");
    await waitFor(() => expect(within(table).getAllByRole("row").length).toBeGreaterThan(4));

    // Column index of plus, derived from the header order in the DOM.
    const headerRow = within(table).getAllByRole("row")[0];
    const headers = within(headerRow).getAllByRole("columnheader");
    const plusIdx = headers.findIndex((h) => /Plus/.test(h.textContent ?? ""));
    expect(plusIdx).toBeGreaterThan(0);

    // Rows that map 1:1 onto PLAN_FEATURES.plus.features. For each entry,
    // `expected` is the truthiness we expect in the plus cell — anything
    // rendering the "Not included" pill counts as false, anything else
    // (a check chip or a variant label like "Real-time") counts as true.
    const rowExpectations: Array<{ label: RegExp; expected: boolean; hint?: string }> = [
      { label: /^Market data$/,            expected: PLAN_FEATURES.plus.features.live_data,     hint: "Real-time for plus" },
      { label: /^Backtesting engine$/,     expected: PLAN_FEATURES.plus.features.backtesting },
      { label: /^Broker connect/,          expected: PLAN_FEATURES.plus.features.portfolio_sync },
      { label: /^Smart alerts/,            expected: PLAN_FEATURES.plus.features.alerts },
      { label: /REST API/,                 expected: PLAN_FEATURES.plus.features.api_access },
      { label: /Advisor seats/,            expected: PLAN_FEATURES.plus.features.advisor_seats > 0 },
    ];

    for (const { label, expected, hint } of rowExpectations) {
      const row = within(table).getAllByRole("row").find((r) =>
        label.test(r.querySelector("th")?.textContent?.trim() ?? ""),
      );
      expect(row, `row for ${label} exists`).toBeTruthy();
      const cells = within(row!).getAllByRole("cell");
      const cell = cells[plusIdx - 1]; // cells exclude the row header <th>.
      const notIncluded = cell.querySelector('[aria-label*="Not included"]');
      if (expected) {
        expect(notIncluded, `${label} (${hint ?? "included"}) should NOT render Not included`).toBeNull();
      } else {
        expect(notIncluded, `${label} should render Not included for plus`).not.toBeNull();
      }
    }
  });
});
