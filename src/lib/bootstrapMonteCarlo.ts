/**
 * Deterministic non-parametric bootstrap Monte Carlo used by the Backtest
 * Quantitative Analysis panel.
 *
 * Pure & framework-free so it can be unit-tested directly, reused from
 * exports / PDFs, and memoised at module scope. A module-level LRU keyed
 * by the input bundle ensures repeated `?quant=` opens of the same
 * basket/settings return the previously-computed result without re-running
 * thousands of simulation paths.
 */

import { quantile } from "@/lib/quantScenarios";
import { createMemoCache } from "@/lib/computeCache";

export interface MonteCarloFanPoint {
  step: number;
  p05: number;
  p50: number;
  p95: number;
}

export interface MonteCarloResult {
  finals: number[];
  fan: MonteCarloFanPoint[];
}

/** Mulberry32 — deterministic PRNG keyed by `seed`. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sample `paths × horizonDays` returns from `rets` with replacement, returning
 * the terminal-value distribution plus a sampled fan of P05/P50/P95 across
 * the horizon.
 */
export function bootstrapMonteCarlo(
  rets: number[],
  startValue: number,
  horizonDays: number,
  paths: number,
  seed = 42,
): MonteCarloResult {
  if (!rets.length || startValue <= 0 || horizonDays <= 0 || paths <= 0) {
    return { finals: [], fan: [] };
  }
  const rand = rng(seed);
  const allPaths: number[][] = new Array(paths);
  const finals: number[] = new Array(paths);
  for (let p = 0; p < paths; p++) {
    let v = startValue;
    const path: number[] = new Array(horizonDays + 1);
    path[0] = startValue;
    for (let d = 0; d < horizonDays; d++) {
      const r = rets[Math.floor(rand() * rets.length)];
      v *= 1 + r;
      path[d + 1] = v;
    }
    allPaths[p] = path;
    finals[p] = v;
  }
  const samples = Math.min(36, horizonDays);
  const stride = Math.max(1, Math.floor(horizonDays / samples));
  const fan: MonteCarloFanPoint[] = [];
  for (let s = 0; s <= horizonDays; s += stride) {
    const slice = allPaths.map((path) => path[s]);
    fan.push({
      step: s,
      p05: quantile(slice, 0.05),
      p50: quantile(slice, 0.50),
      p95: quantile(slice, 0.95),
    });
  }
  return { finals, fan };
}

/**
 * Cheap structural fingerprint of the returns array so the cache key stays
 * small but still collision-resistant for typical equity-curve inputs.
 * Hashing avoids serialising thousands of float64 elements on every call.
 */
export function fingerprintReturns(rets: number[]): string {
  if (!rets.length) return "0";
  // 32-bit FNV-1a over a fixed-precision string per element.
  let h = 0x811c9dc5;
  for (let i = 0; i < rets.length; i++) {
    const s = rets[i].toFixed(8);
    for (let j = 0; j < s.length; j++) {
      h ^= s.charCodeAt(j);
      h = Math.imul(h, 0x01000193);
    }
  }
  return `${rets.length}:${(h >>> 0).toString(36)}`;
}

const mcCache = createMemoCache<MonteCarloResult>(32);

/**
 * Cached variant — identical inputs (returns fingerprint, start value, horizon,
 * paths, seed) return the previously-computed `MonteCarloResult` by reference.
 * Survives component unmount/remount, so re-opening a `?quant=` link or
 * re-rendering the panel is effectively free after the first run.
 */
export function bootstrapMonteCarloCached(
  rets: number[],
  startValue: number,
  horizonDays: number,
  paths: number,
  seed = 42,
): MonteCarloResult {
  const key = {
    f: fingerprintReturns(rets),
    s: Number(startValue.toFixed(6)),
    h: horizonDays,
    p: paths,
    seed,
  };
  const hit = mcCache.get(key);
  if (hit) return hit;
  const value = bootstrapMonteCarlo(rets, startValue, horizonDays, paths, seed);
  return mcCache.set(key, value);
}

/** Test-only: reset the module-level cache so tests start from a clean slate. */
export function __resetMonteCarloCache(): void {
  mcCache.clear();
}

/** Test-only: introspect cache size. */
export function __monteCarloCacheSize(): number {
  return mcCache.size();
}