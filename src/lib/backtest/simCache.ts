// Lightweight in-memory cache for client-side custom-strategy simulations.
// Keyed by (bars fingerprint, rules JSON, costs JSON, initial capital).
// Bars fingerprint uses length + first/last timestamps to stay fast — bars are
// deterministic snapshots returned by the edge function per backtest run.

import type { Condition, RiskConfig } from "@/lib/ta/strategyTypes";
import type { CostConfig } from "./costs";
import { simulateCustom, type Bar, type SimResult } from "./clientSim";

export interface CachedRun extends SimResult {}

const CACHE = new Map<string, CachedRun>();
let barsToken: string | null = null;
let currentBars: Bar[] | null = null;

function fingerprint(bars: Bar[]): string {
  if (!bars.length) return "empty";
  return `${bars.length}:${bars[0].t}:${bars[bars.length - 1].t}:${bars[0].close.toFixed(4)}:${bars[bars.length - 1].close.toFixed(4)}`;
}

function ensureBars(bars: Bar[]) {
  const fp = fingerprint(bars);
  if (fp !== barsToken) {
    // Bars changed — invalidate.
    CACHE.clear();
    barsToken = fp;
    currentBars = bars;
  }
}

function keyOf(
  rules: { entry: Condition[]; exit: Condition[]; risk: RiskConfig },
  costs: CostConfig,
  initial: number,
): string {
  return `${initial}|${JSON.stringify(rules)}|${JSON.stringify(costs)}`;
}

export function runCached(
  bars: Bar[],
  rules: { entry: Condition[]; exit: Condition[]; risk: RiskConfig },
  initial: number,
  costs: CostConfig,
): { result: CachedRun; hit: boolean } {
  ensureBars(bars);
  const key = keyOf(rules, costs, initial);
  const existing = CACHE.get(key);
  if (existing) return { result: existing, hit: true };
  const result = simulateCustom(bars, rules, initial, costs);
  CACHE.set(key, result);
  return { result, hit: false };
}

export function cacheStats() {
  return { size: CACHE.size, barsToken };
}

export function clearSimCache() {
  CACHE.clear();
  barsToken = null;
  currentBars = null;
}