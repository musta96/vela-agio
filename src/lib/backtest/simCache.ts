// In-memory + localStorage-persisted cache for client-side custom-strategy
// simulations, plus a Web Worker pool that fans grid searches across every
// available CPU core. Keyed by (bars fingerprint, rules JSON, costs JSON,
// initial capital). Bars fingerprint uses length + first/last timestamps
// to stay fast — bars are deterministic snapshots per backtest run.

import type { Condition, RiskConfig } from "@/lib/ta/strategyTypes";
import type { CostConfig } from "./costs";
import { simulateCustom, type Bar, type SimResult } from "./clientSim";

export interface CachedRun extends SimResult {}

const CACHE = new Map<string, CachedRun>();
let barsToken: string | null = null;

// Persistence -----------------------------------------------------------------
const LS_PREFIX = "simcache:v1:";
const MAX_ENTRIES = 200; // LRU cap; keeps LS payload well under quota.
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function safeLS(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

function schedulePersist() {
  if (!barsToken) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 400);
}

function persistNow() {
  const ls = safeLS();
  if (!ls || !barsToken) return;
  // Truncate to newest MAX_ENTRIES (Map preserves insertion order — we re-insert on hit).
  const entries = Array.from(CACHE.entries()).slice(-MAX_ENTRIES);
  const payload = JSON.stringify(entries);
  try {
    ls.setItem(LS_PREFIX + barsToken, payload);
  } catch {
    // Quota exceeded — drop half and try once more, then give up silently.
    const half = entries.slice(-Math.floor(MAX_ENTRIES / 2));
    try { ls.setItem(LS_PREFIX + barsToken, JSON.stringify(half)); } catch { /* noop */ }
  }
}

function hydrate(fp: string) {
  const ls = safeLS();
  if (!ls) return;
  try {
    const raw = ls.getItem(LS_PREFIX + fp);
    if (!raw) return;
    const entries = JSON.parse(raw) as [string, CachedRun][];
    for (const [k, v] of entries) CACHE.set(k, v);
  } catch { /* corrupt entry — ignore */ }
}

function pruneOtherFingerprints(currentFp: string) {
  const ls = safeLS();
  if (!ls) return;
  try {
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (k && k.startsWith(LS_PREFIX) && k !== LS_PREFIX + currentFp) ls.removeItem(k);
    }
  } catch { /* noop */ }
}

function fingerprint(bars: Bar[]): string {
  if (!bars.length) return "empty";
  return `${bars.length}:${bars[0].t}:${bars[bars.length - 1].t}:${bars[0].close.toFixed(4)}:${bars[bars.length - 1].close.toFixed(4)}`;
}

function ensureBars(bars: Bar[]) {
  const fp = fingerprint(bars);
  if (fp !== barsToken) {
    CACHE.clear();
    barsToken = fp;
    hydrate(fp);
    pruneOtherFingerprints(fp);
  }
}

function keyOf(
  rules: { entry: Condition[]; exit: Condition[]; risk: RiskConfig },
  costs: CostConfig,
  initial: number,
): string {
  return `${initial}|${JSON.stringify(rules)}|${JSON.stringify(costs)}`;
}

function store(key: string, result: CachedRun) {
  // Re-insert to bump LRU recency.
  CACHE.delete(key);
  CACHE.set(key, result);
  if (CACHE.size > MAX_ENTRIES) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  schedulePersist();
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
  if (existing) {
    // Bump recency.
    CACHE.delete(key);
    CACHE.set(key, existing);
    return { result: existing, hit: true };
  }
  const result = simulateCustom(bars, rules, initial, costs);
  store(key, result);
  return { result, hit: false };
}

export function cacheStats() {
  return { size: CACHE.size, barsToken, maxEntries: MAX_ENTRIES };
}

export function clearSimCache() {
  CACHE.clear();
  const ls = safeLS();
  if (ls && barsToken) { try { ls.removeItem(LS_PREFIX + barsToken); } catch { /* noop */ } }
  barsToken = null;
}

// Parallel pool ---------------------------------------------------------------

export type RuleSet = { entry: Condition[]; exit: Condition[]; risk: RiskConfig };
export type ProgressFn = (done: number, total: number, hits: number) => void;

function detectConcurrency(): number {
  try {
    const hc = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 0;
    return Math.max(2, Math.min(8, hc || 4));
  } catch { return 4; }
}

function supportsWorker(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

/**
 * Run many simulations in parallel using a Worker pool, honoring the cache.
 * Returns results in the same order as `jobs`. Reports progress incrementally.
 */
export async function runCachedParallel(
  bars: Bar[],
  jobs: RuleSet[],
  initial: number,
  costs: CostConfig,
  onProgress?: ProgressFn,
): Promise<{ results: CachedRun[]; hits: number }> {
  ensureBars(bars);
  const results = new Array<CachedRun>(jobs.length);
  const misses: { i: number; key: string; rules: RuleSet }[] = [];
  let hits = 0;
  for (let i = 0; i < jobs.length; i++) {
    const key = keyOf(jobs[i], costs, initial);
    const cached = CACHE.get(key);
    if (cached) {
      results[i] = cached;
      hits++;
      // Bump recency.
      CACHE.delete(key); CACHE.set(key, cached);
    } else {
      misses.push({ i, key, rules: jobs[i] });
    }
  }
  let done = hits;
  onProgress?.(done, jobs.length, hits);
  if (misses.length === 0) return { results, hits };

  // Fallback: run sequentially on the main thread when workers are unavailable.
  if (!supportsWorker()) {
    for (const m of misses) {
      const r = simulateCustom(bars, m.rules, initial, costs);
      store(m.key, r);
      results[m.i] = r;
      done++;
      onProgress?.(done, jobs.length, hits);
      // Yield so the UI stays responsive.
      await new Promise((res) => setTimeout(res, 0));
    }
    return { results, hits };
  }

  const poolSize = Math.min(detectConcurrency(), misses.length);
  const workers: Worker[] = [];
  for (let w = 0; w < poolSize; w++) {
    workers.push(new Worker(new URL("./simWorker.ts", import.meta.url), { type: "module" }));
  }

  let cursor = 0;
  await Promise.all(workers.map((w) => new Promise<void>((resolve) => {
    const feed = () => {
      if (cursor >= misses.length) { w.terminate(); resolve(); return; }
      const m = misses[cursor++];
      w.onmessage = (ev: MessageEvent<{ id: number; result: SimResult }>) => {
        const r = ev.data.result;
        store(m.key, r);
        results[m.i] = r;
        done++;
        onProgress?.(done, jobs.length, hits);
        feed();
      };
      w.onerror = () => {
        // On worker failure, fall back to a synchronous run so the sweep still finishes.
        const r = simulateCustom(bars, m.rules, initial, costs);
        store(m.key, r);
        results[m.i] = r;
        done++;
        onProgress?.(done, jobs.length, hits);
        feed();
      };
      w.postMessage({ id: m.i, bars, rules: m.rules, initial, costs });
    };
    feed();
  })));

  return { results, hits };
}