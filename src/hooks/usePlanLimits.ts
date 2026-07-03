import { useCallback } from "react";
import { useEntitlements } from "@/hooks/useEntitlements";

/**
 * Convenience wrapper over `useEntitlements` for numeric caps.
 * `null` means unlimited. `atCap(kind, current)` returns `true` when the
 * caller has hit or exceeded the cap for `kind`.
 */
export function usePlanLimits() {
  const ent = useEntitlements();
  const { limits } = ent;

  const atCap = useCallback(
    (kind: keyof typeof limits, current: number) => {
      const cap = limits[kind];
      if (cap == null) return false;
      return current >= cap;
    },
    [limits],
  );

  return {
    ...limits,
    loading: ent.loading,
    tier: ent.tier,
    isFree: ent.tier === "free" && !ent.betaActive,
    atCap,
  };
}