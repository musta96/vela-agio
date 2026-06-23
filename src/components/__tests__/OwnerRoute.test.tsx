import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import React from "react";

// ---- Mocks --------------------------------------------------------------

const TEST_USER = { id: "user-1", email: "fausto@example.com" };
const TEST_AUTH = { user: TEST_USER, loading: false };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => TEST_AUTH }));

vi.mock("@/pages/NotFound", () => ({
  default: () => <div data-testid="not-found">404</div>,
}));

vi.mock("react-router-dom", () => ({
  Navigate: () => <div data-testid="navigate" />,
  useLocation: () => ({ pathname: "/owner", search: "" }),
  Link: ({ children, ...p }: any) => <a {...p}>{children}</a>,
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: any[]) => toastSuccess(...a) } }));

// Sequenced role responses. Default = no roles; switch to admin after grant.
let currentRoles: string[] = [];
const realtimeHandlers: Array<(payload: any) => void> = [];
let subscribeStatusCb: ((status: string) => void) | null = null;

vi.mock("@/integrations/supabase/client", () => {
  const channel = {
    on: (_event: string, _filter: any, cb: (payload: any) => void) => {
      realtimeHandlers.push(cb);
      return channel;
    },
    subscribe: (cb?: (status: string) => void) => {
      subscribeStatusCb = cb || null;
      // Defer to mimic async subscribe.
      queueMicrotask(() => cb?.("SUBSCRIBED"));
      return channel;
    },
  };
  return {
    supabase: {
      from: () => ({
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: currentRoles.map((r) => ({ role: r })),
              error: null,
            }),
        }),
      }),
      channel: () => channel,
      removeChannel: () => {},
      auth: { signOut: vi.fn() },
    },
  };
});

// Import AFTER mocks are registered.
import { OwnerRoute } from "@/components/ProtectedRoute";

beforeEach(() => {
  currentRoles = [];
  realtimeHandlers.length = 0;
  subscribeStatusCb = null;
  toastSuccess.mockClear();
});

describe("OwnerRoute auto re-check + toast", () => {
  it("re-checks roles via realtime and grants access without a page refresh", async () => {
    render(
      <OwnerRoute>
        <div data-testid="owner-secret">OWNER_PAYLOAD</div>
      </OwnerRoute>,
    );

    // First check resolves with no privileged roles → unauthorized screen.
    await waitFor(() =>
      expect(screen.getByText(/Owner console access required/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("owner-secret")).not.toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();

    // Admin grants the role server-side → realtime callback fires.
    currentRoles = ["admin"];
    expect(realtimeHandlers.length).toBeGreaterThan(0);
    await act(async () => {
      realtimeHandlers[0]({ eventType: "INSERT" });
    });

    // Console unlocks AND a single granted-toast fires.
    await waitFor(() =>
      expect(screen.getByTestId("owner-secret")).toBeInTheDocument(),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    const [msg, opts] = toastSuccess.mock.calls[0];
    expect(msg).toMatch(/access granted/i);
    expect(opts).toMatchObject({ id: "owner-role-granted" });
  });

  it("does not re-toast on subsequent re-checks while access is still granted", async () => {
    render(
      <OwnerRoute>
        <div data-testid="owner-secret">OWNER_PAYLOAD</div>
      </OwnerRoute>,
    );

    await waitFor(() =>
      expect(screen.getByText(/Owner console access required/i)).toBeInTheDocument(),
    );

    // Grant + first realtime tick → toast once.
    currentRoles = ["admin"];
    await act(async () => { realtimeHandlers[0]({ eventType: "INSERT" }); });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));

    // Several unrelated re-checks while still admin → must not retoast.
    for (let i = 0; i < 3; i++) {
      await act(async () => { realtimeHandlers[0]({ eventType: "UPDATE" }); });
    }
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });
});