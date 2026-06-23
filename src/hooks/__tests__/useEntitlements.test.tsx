/**
 * Smoke tests for the my_entitlements RPC contract via useEntitlements.
 * Verifies:
 *   - The hook calls `my_entitlements` and projects its row into a Set.
 *   - It hydrates from sessionStorage cache synchronously (no flicker).
 *   - It falls back to the `free` tier with an empty Set when nothing is returned.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

const rpcSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));
const channel = {
  on: () => channel,
  subscribe: () => channel,
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: any[]) => (rpcSpy as any)(...a),
    channel: () => channel,
    removeChannel: () => {},
  },
}));

import { useEntitlements } from "@/hooks/useEntitlements";

describe("useEntitlements", () => {
  beforeEach(() => {
    sessionStorage.clear();
    rpcSpy.mockReset();
  });

  it("projects a my_entitlements row into a Set", async () => {
    rpcSpy.mockReturnValueOnce(Promise.resolve({
      data: [{ tier: "pro", plan_slug: "pro", plan_name: "Pro", feature_keys: ["ai.copilot", "ai.sentiment"] }],
      error: null,
    }));
    const { result } = renderHook(() => useEntitlements());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(rpcSpy).toHaveBeenCalledWith("my_entitlements");
    expect(result.current.loading).toBe(false);
    expect(result.current.tier).toBe("pro");
    expect(result.current.has("ai.copilot")).toBe(true);
    expect(result.current.has("ai.deep_research")).toBe(false);
  });

  it("returns the free fallback when there is no active subscription", async () => {
    rpcSpy.mockReturnValueOnce(Promise.resolve({ data: [], error: null }));
    const { result } = renderHook(() => useEntitlements());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.loading).toBe(false);
    expect(result.current.tier).toBe("free");
    expect(result.current.featureKeys.size).toBe(0);
  });

  it("hydrates synchronously from sessionStorage so there's no flicker", () => {
    sessionStorage.setItem(
      "vela.entitlements.v1",
      JSON.stringify({
        userId: "u1",
        ts: Date.now(),
        tier: "elite",
        planSlug: "elite",
        planName: "Elite",
        featureKeys: ["ai.deep_research"],
      }),
    );
    rpcSpy.mockResolvedValueOnce({ data: [], error: null });
    const { result } = renderHook(() => useEntitlements());
    // First render should already reflect cached value.
    expect(result.current.loading).toBe(false);
    expect(result.current.tier).toBe("elite");
    expect(result.current.has("ai.deep_research")).toBe(true);
  });
});