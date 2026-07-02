/**
 * End-to-end test for the first-time dashboard walkthrough.
 *
 * Verifies that the three steps target — in order — the Search input,
 * the Watchlist card and the AI Briefing panel via their `data-tour`
 * hooks, that keyboard navigation advances the flow, and that
 * completion is persisted to the profile (cross-device state).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";

const updateMock = vi.fn<(payload: unknown) => Promise<{ error: null }>>(() =>
  Promise.resolve({ error: null }),
);
const eqMock = vi.fn<(col: string, val: string) => Promise<{ error: null }>>(() =>
  Promise.resolve({ error: null }),
);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (payload: unknown) => {
        updateMock(payload);
        return { eq: (col: string, val: string) => eqMock(col, val) };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

import { DashboardTour } from "@/components/dashboard/DashboardTour";

function Scaffold() {
  return (
    <div>
      <button data-tour="app-search">Search tickers…</button>
      <div data-tour="watchlist-card">
        <h2>Watchlist</h2>
      </div>
      <section data-tour="ai-briefing">
        <h2>AI Briefing</h2>
      </section>
    </div>
  );
}

describe("DashboardTour · first-time walkthrough", () => {
  beforeEach(() => {
    localStorage.clear();
    updateMock.mockClear();
    eqMock.mockClear();
  });

  it("highlights search → watchlist → ai briefing in order", async () => {
    const onClose = vi.fn();
    render(
      <>
        <Scaffold />
        <DashboardTour open userId="test-user-1" onClose={onClose} />
      </>,
    );

    // Step 1 targets the search input.
    const step1 = await screen.findByTestId("dashboard-tour-step-1");
    expect(step1.getAttribute("data-tour-step")).toBe("app-search");
    expect(step1.textContent).toMatch(/Find any market/i);

    // Advance with the Next button.
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
    const step2 = await screen.findByTestId("dashboard-tour-step-2");
    expect(step2.getAttribute("data-tour-step")).toBe("watchlist-card");
    expect(step2.textContent).toMatch(/Save what you watch/i);

    // Advance with the keyboard (ArrowRight is supported for a11y).
    fireEvent.keyDown(window, { key: "ArrowRight" });
    const step3 = await screen.findByTestId("dashboard-tour-step-3");
    expect(step3.getAttribute("data-tour-step")).toBe("ai-briefing");
    expect(step3.textContent).toMatch(/Ask for the brief/i);

    // Finish persists per-user completion.
    fireEvent.click(screen.getByRole("button", { name: /Got it/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ dashboard_tour_completed_at: expect.any(String) }),
    );
    expect(eqMock).toHaveBeenCalledWith("user_id", "test-user-1");
    expect(localStorage.getItem("vela_dashboard_tour_v1")).toBe("1");
  });

  it("exposes screen-reader labels and manages focus on the primary action", async () => {
    render(
      <>
        <Scaffold />
        <DashboardTour open userId="test-user-2" onClose={() => {}} />
      </>,
    );
    // aria-labelledby / aria-describedby wire up on the tooltip dialog.
    const dialog = await screen.findByTestId("dashboard-tour-step-1");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("dashboard-tour-title");
    expect(dialog.getAttribute("aria-describedby")).toBe("dashboard-tour-body");

    // Primary action receives focus so keyboard users land inside the dialog.
    await waitFor(() => {
      expect(document.activeElement?.textContent).toMatch(/Next/);
    });

    // "Try it" moves focus onto the highlighted input for direct interaction.
    fireEvent.click(screen.getByRole("button", { name: /Focus .* Find any market/i }));
    await waitFor(() => {
      expect((document.activeElement as HTMLElement)?.getAttribute("data-tour")).toBe("app-search");
    });

    cleanup();
  });
});