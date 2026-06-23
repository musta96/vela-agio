import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { CommandPalette } from "@/components/CommandPalette";

/**
 * End-to-end regression guard for the top-bar search.
 *
 * Reproduces the previously-reported bug where typing "Space x" + Enter
 * caused the palette to flash and silently bounce back to the dashboard
 * without surfacing any market result. With the private-company resolver
 * in place, the palette must instead:
 *   1. Stay open and show the SpaceX disambiguation banner.
 *   2. List DXYZ (Destiny Tech100) as a related market instrument.
 *   3. Navigate to /stock/DXYZ when the user picks it.
 *
 * The top-bar Search button dispatches a synthetic ⌘K keydown to open
 * the palette — we exercise the exact same path here.
 */

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

const symbolSearchPayload = {
  results: [
    { symbol: "DXYZ", name: "Destiny Tech100 — holds SpaceX", exchange: "NYSEArca", type: "CEF", currency: "USD", category: "fund" },
    { symbol: "SPCE", name: "Virgin Galactic Holdings, Inc.", exchange: "NYSE", type: "Equity", currency: "USD", category: "company" },
  ],
  privateCompanyHint: {
    canonical: "SpaceX",
    message: "SpaceX is privately held — no direct ticker. Related public instruments:",
    related: [
      { symbol: "DXYZ", name: "Destiny Tech100 — holds SpaceX", type: "CEF", category: "fund" },
      { symbol: "ARKVX", name: "ARK Venture Fund (SpaceX exposure)", type: "Fund", category: "fund" },
    ],
  },
};

describe("Top-bar search → 'Space x'", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    (global as any).fetch = vi.fn(async () =>
      new Response(JSON.stringify(symbolSearchPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  afterEach(() => {
    (global as any).fetch = originalFetch;
    vi.useRealTimers();
  });

  it("does not bounce to dashboard on Enter and routes to DXYZ when picked", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <CommandPalette />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    // Start on the dashboard, as the top bar would.
    expect(screen.getByTestId("loc").textContent).toBe("/dashboard");

    // Top-bar Search button dispatches a synthetic ⌘K keydown. Reproduce it.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    });

    const input = await screen.findByPlaceholderText(/Search any ticker/i);

    // Type the query the user reported.
    fireEvent.change(input, { target: { value: "Space x" } });

    // The debounced (300ms) symbol-search fetch must resolve and surface
    // the SpaceX private-company hint before Enter is pressed.
    await waitFor(
      () => {
        expect(global.fetch).toHaveBeenCalled();
        expect(
          screen.getByText(/SpaceX is privately held/i),
        ).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    // Press Enter. With a private-company hint present the palette must
    // NOT auto-route — it stays open so the user can pick a real ticker.
    // Crucially, the route must NOT change away from /dashboard (the
    // original regression bounced back here via a navigate(-1) side-effect).
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(screen.getByTestId("loc").textContent).toBe("/dashboard");
    expect(screen.getByText(/SpaceX is privately held/i)).toBeInTheDocument();

    // Picking the top related market result (DXYZ) must navigate to the
    // dedicated stock detail page — the "correct market result page".
    const dxyzRow = screen
      .getAllByText("DXYZ")
      .map((el) => el.closest('[role="option"]') as HTMLElement | null)
      .find(Boolean);
    expect(dxyzRow, "expected a selectable DXYZ row in the markets list").toBeTruthy();
    fireEvent.click(dxyzRow!);

    await waitFor(() => {
      expect(screen.getByTestId("loc").textContent).toBe("/stock/DXYZ");
    });
  });
});