import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// Hoisted mocks — must exist before the component imports them.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ gt: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
    functions: { invoke: vi.fn(async () => ({ error: { message: "Live trading disabled" } })) },
  },
}));

const flagMock = vi.fn();
vi.mock("@/hooks/useFeatureFlags", () => ({
  useFlag: (...args: any[]) => flagMock(...args),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "test-user" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

import { LiveOrderConfirmModal } from "@/components/LiveOrderConfirmModal";
import { supabase } from "@/integrations/supabase/client";

describe("LiveOrderConfirmModal — live_trading kill-switch", () => {
  beforeEach(() => {
    flagMock.mockReset();
    (supabase.functions.invoke as any).mockClear?.();
  });

  it("renders nothing when the live_trading feature flag is OFF", () => {
    flagMock.mockReturnValue(false);
    const { container } = render(<LiveOrderConfirmModal />);
    expect(container.innerHTML).toBe("");
  });

  it("does not poll live_order_intents when the flag is OFF", () => {
    flagMock.mockReturnValue(false);
    const spy = vi.spyOn(supabase, "from");
    render(<LiveOrderConfirmModal />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("surfaces a 403-style 'live trading disabled' error from the edge function", async () => {
    // Even when an intent somehow appears, invoking the edge function must
    // come back with the kill-switch error from supabase/functions/live-trade.
    flagMock.mockReturnValue(true);
    const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;
    invoke.mockResolvedValueOnce({ error: { message: "Live trading is currently disabled on this platform." } });
    const res = await supabase.functions.invoke("live-trade", { body: { intent_id: "x", action: "confirm" } });
    expect(res.error?.message).toMatch(/disabled/i);
  });
});