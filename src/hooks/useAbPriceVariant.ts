import { useEffect, useState } from "react";

/**
 * Stable per-browser A/B assignment for pricing experiments.
 * Returns "A" (control) or "B" (variant). When `enabled` is false, always "A".
 * Assignment is persisted in localStorage so the same visitor sees the same price.
 */
export function useAbPriceVariant(planId: string | null | undefined, enabled: boolean): "A" | "B" {
  const [variant, setVariant] = useState<"A" | "B">("A");

  useEffect(() => {
    if (!planId || !enabled) {
      setVariant("A");
      return;
    }
    const key = `ab_price_variant:${planId}`;
    try {
      let v = localStorage.getItem(key) as "A" | "B" | null;
      if (v !== "A" && v !== "B") {
        v = Math.random() < 0.5 ? "A" : "B";
        localStorage.setItem(key, v);
      }
      setVariant(v);
    } catch {
      setVariant(Math.random() < 0.5 ? "A" : "B");
    }
  }, [planId, enabled]);

  return variant;
}