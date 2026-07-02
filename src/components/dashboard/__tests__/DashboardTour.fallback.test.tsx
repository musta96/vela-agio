/**
 * Graceful fallback: when the Supabase profile lookup or update throws,
 * the walkthrough must still work using localStorage AND surface an
 * accessible error state (role="status", aria-live="polite").
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.reject(new Error("network_down")),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ error: { message: "rls_denied" } }),
      }),
    }),
  },
}));

import {
  DashboardTour,
  loadDashboardTourState,
  markDashboardTourSeen,
} from "@/components/dashboard/DashboardTour";

function Scaffold() {
  return (
    <div>
      <button data-tour="app-search">Search</button>
      <div data-tour="watchlist-card"><h2>Watchlist</h2></div>
      <section data-tour="ai-briefing"><h2>AI Briefing</h2></section>
    </div>
  );
}

describe("DashboardTour · graceful Supabase fallback", () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it("loadDashboardTourState falls back to localStorage when Supabase throws", async () => {
    markDashboardTourSeen();
    const r = await loadDashboardTourState("user-1");
    expect(r.source).toBe("local");
    expect(r.error).toMatch(/network_down/);
    expect(r.done).toBe(true);
  });

  it("shows an accessible sync-error status when persistence fails", async () => {
    const onClose = vi.fn();
    render(
      <>
        <Scaffold />
        <DashboardTour open userId="user-1" onClose={onClose} />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Got it/i }));

    // Local mirror is written even though the server rejected.
    await waitFor(() =>
      expect(localStorage.getItem("vela_dashboard_tour_v1")).toBe("1"),
    );

    // Accessible status message renders and dialog stays open.
    const status = await screen.findByTestId("dashboard-tour-save-error");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toMatch(/saved on this device/i);
    expect(onClose).not.toHaveBeenCalled();
  });
});