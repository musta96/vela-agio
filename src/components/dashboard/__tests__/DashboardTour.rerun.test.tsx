/**
 * Verifies that once the walkthrough is marked complete (server flag OR
 * local mirror), it does NOT auto-launch on subsequent dashboard visits.
 *
 * We assert against the helpers that Index.tsx consumes to gate auto-open:
 *   • loadDashboardTourState returns { done: true } → Index sets tourSeen=true
 *     → the auto-open effect early-returns (see src/pages/Index.tsx).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const maybeSingleMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => maybeSingleMock() }),
      }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

import {
  loadDashboardTourState,
  markDashboardTourSeen,
  hasSeenDashboardTour,
} from "@/components/dashboard/DashboardTour";

describe("DashboardTour · does not re-launch after completion", () => {
  beforeEach(() => {
    localStorage.clear();
    maybeSingleMock.mockReset();
  });

  it("returns done=true when the server profile flag is set (cross-device)", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { dashboard_tour_completed_at: "2026-01-01T00:00:00Z" },
      error: null,
    });
    const r = await loadDashboardTourState("user-A");
    expect(r.done).toBe(true);
    expect(r.source).toBe("server");
    // Mirror written so future visits skip Supabase entirely.
    expect(hasSeenDashboardTour()).toBe(true);
  });

  it("returns done=true from local mirror when the user completed it earlier", async () => {
    maybeSingleMock.mockResolvedValue({ data: { dashboard_tour_completed_at: null }, error: null });
    markDashboardTourSeen();
    const r = await loadDashboardTourState("user-B");
    expect(r.done).toBe(true);
  });

  it("returns done=false for a genuine first-time user (nothing anywhere)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const r = await loadDashboardTourState("user-C");
    expect(r.done).toBe(false);
    expect(r.source).toBe("server");
  });
});