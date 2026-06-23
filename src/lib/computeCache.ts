import { useMemo, useRef } from "react";

/**
 * Deterministic JSON of any value with sorted keys, so two objects with the
 * same content but different key order produce the same string. Arrays and
 * numeric NaN/Infinity are preserved verbatim. Used as a stable cache key
 * for memoising expensive Monte Carlo and macro-scenario computations.
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === "number" && !Number.isFinite(val)) return `__num:${String(val)}`;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      if (seen.has(val as object)) return "[Circular]";
      seen.add(val as object);
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        out[k] = (val as Record<string, unknown>)[k];
      }
      return out;
    }
    return val;
  });
}

/**
 * Like `useMemo`, but reruns only when the content of `key` changes — not
 * when its reference identity changes. Perfect for memoising results that
 * depend on arrays or nested objects rebuilt every render (positions,
 * scenario shock objects, MC parameter bundles).
 */
export function useStableMemo<T>(compute: () => T, key: unknown): T {
  const cache = useRef<{ key: string; value: T } | null>(null);
  const skey = stableStringify(key);
  return useMemo(() => {
    if (cache.current && cache.current.key === skey) return cache.current.value;
    const value = compute();
    cache.current = { key: skey, value };
    return value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skey]);
}

/**
 * Tiny module-scope LRU keyed by stable-stringified input. Useful when
 * the same compute can be invoked from multiple components or pages
 * (e.g. PDF export reuses a Monte Carlo result already shown on screen).
 */
export function createMemoCache<T>(capacity = 32) {
  const map = new Map<string, T>();
  return {
    get(key: unknown): T | undefined {
      const k = stableStringify(key);
      const v = map.get(k);
      if (v !== undefined) {
        map.delete(k); map.set(k, v); // LRU touch
      }
      return v;
    },
    set(key: unknown, value: T): T {
      const k = stableStringify(key);
      if (map.has(k)) map.delete(k);
      map.set(k, value);
      while (map.size > capacity) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
      return value;
    },
    size: () => map.size,
    clear: () => map.clear(),
  };
}