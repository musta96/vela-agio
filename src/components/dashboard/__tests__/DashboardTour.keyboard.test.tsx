/**
 * Keyboard-only walkthrough:
 *   • ArrowRight/ArrowLeft advance and rewind the steps.
 *   • The "Try it" button moves focus to the highlighted control for each
 *     of the three targets in the exact order search → watchlist → briefing.
 *   • The polite live region announces "Step N of 3" in order.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

import { DashboardTour } from "@/components/dashboard/DashboardTour";

function Scaffold() {
  return (
    <div>
      <button data-tour="app-search">Search markets</button>
      <button data-tour="watchlist-card">Watchlist</button>
      <button data-tour="ai-briefing">AI Briefing</button>
    </div>
  );
}

describe("DashboardTour · keyboard-only + SR announcements", () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it("announces steps in the correct order and moves focus to each highlighted control", async () => {
    render(
      <>
        <Scaffold />
        <DashboardTour open userId="kbd-user" onClose={() => {}} />
      </>,
    );

    const dialog = await screen.findByRole("dialog", { name: /Dashboard walkthrough/i });
    // Live region content contains the current step title.
    const live = dialog.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).toBeTruthy();

    // Step 1 — search.
    expect(live.textContent).toMatch(/Step 1 of 3.*Find any market/i);
    fireEvent.click(screen.getByRole("button", { name: /Focus 1 · Find any market/i }));
    await waitFor(() =>
      expect((document.activeElement as HTMLElement)?.getAttribute("data-tour")).toBe("app-search"),
    );

    // Step 2 — watchlist (advance via keyboard only).
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() =>
      expect(live.textContent).toMatch(/Step 2 of 3.*Save what you watch/i),
    );
    fireEvent.click(screen.getByRole("button", { name: /Focus 2 · Save what you watch/i }));
    await waitFor(() =>
      expect((document.activeElement as HTMLElement)?.getAttribute("data-tour")).toBe(
        "watchlist-card",
      ),
    );

    // Step 3 — briefing.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() =>
      expect(live.textContent).toMatch(/Step 3 of 3.*Ask for the brief/i),
    );
    fireEvent.click(screen.getByRole("button", { name: /Focus 3 · Ask for the brief/i }));
    await waitFor(() =>
      expect((document.activeElement as HTMLElement)?.getAttribute("data-tour")).toBe(
        "ai-briefing",
      ),
    );

    // ArrowLeft rewinds — no forward-only skips.
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() =>
      expect(live.textContent).toMatch(/Step 2 of 3/i),
    );
  });
});