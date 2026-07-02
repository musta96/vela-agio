/**
 * Row-Level Security contract for `profiles.dashboard_tour_completed_at`.
 *
 * The `profiles` table has three policies (verified in the live database):
 *   • SELECT authenticated USING  (auth.uid() = user_id)
 *   • UPDATE authenticated USING  (auth.uid() = user_id)
 *   • INSERT authenticated WITH CHECK (auth.uid() = user_id)
 *
 * That means users can only read/write THEIR OWN dashboard_tour_completed_at.
 * On the client we must therefore always filter by user_id — never by any
 * other identifier — or the query will silently return zero rows (SELECT)
 * or match zero rows (UPDATE). This test locks that client contract in.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const eqSelectMock = vi.fn();
const eqUpdateMock = vi.fn();
const selectMock = vi.fn(() => ({ eq: eqSelectMock }));
const updateMock = vi.fn(() => ({ eq: eqUpdateMock }));
const fromMock = vi.fn(() => ({ select: selectMock, update: updateMock }));

eqSelectMock.mockImplementation(() => ({
  maybeSingle: () => Promise.resolve({ data: null, error: null }),
}));
eqUpdateMock.mockImplementation(() => Promise.resolve({ error: null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...(args as [])) },
}));

import {
  loadDashboardTourState,
  persistDashboardTourSeen,
} from "@/components/dashboard/DashboardTour";

describe("profiles.dashboard_tour_completed_at · RLS client contract", () => {
  beforeEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
    updateMock.mockClear();
    eqSelectMock.mockClear();
    eqUpdateMock.mockClear();
    localStorage.clear();
  });

  it("reads dashboard_tour_completed_at scoped to the caller's user_id", async () => {
    await loadDashboardTourState("user-42");
    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(selectMock).toHaveBeenCalledWith("dashboard_tour_completed_at");
    // Must filter by user_id — RLS depends on it.
    expect(eqSelectMock).toHaveBeenCalledWith("user_id", "user-42");
  });

  it("writes dashboard_tour_completed_at scoped to the caller's user_id", async () => {
    await persistDashboardTourSeen("user-99");
    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ dashboard_tour_completed_at: expect.any(String) }),
    );
    expect(eqUpdateMock).toHaveBeenCalledWith("user_id", "user-99");
  });

  it("never issues a Supabase call for anonymous callers (no user id, no RLS surface)", async () => {
    await loadDashboardTourState(null);
    await persistDashboardTourSeen(undefined);
    expect(fromMock).not.toHaveBeenCalled();
  });
});