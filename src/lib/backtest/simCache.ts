// In-memory + localStorage-persisted cache for client-side custom-strategy
// simulations, plus a Web Worker pool that fans grid searches across every
// available CPU core. Keyed by (bars fingerprint, rules JSON, costs JSON,
// initial capital). Bars fingerprint uses length + first/last timestamps
// to stay fast — bars are deterministic snapshots per backtest run.

import type { Condition, RiskConfig } from "@/lib/ta/strategyTypes";
import type { CostConfig } from "./costs";
import { simulateCustom, type Bar, type SimResult } from "./clientSim";

export interface CachedRun extends SimResult { _cachedAt?: number }

const CACHE = new Map<string, CachedRun>();
let barsToken: string | null = null;

// Persistence -----------------------------------------------------------------
const LS_PREFIX = "simcache:v1:";
const SETTINGS_KEY = "simcache:settings:v1";

interface Settings {
  maxEntries: number;
  maxAgeDays: number;
  maxWorkers: number | "auto"; // "auto" honours hardwareConcurrency; 0 = disable workers
}
const DEFAULT_SETTINGS: Settings = { maxEntries: 200, maxAgeDays: 14, maxWorkers: "auto" };
let settings: Settings = { ...DEFAULT_SETTINGS };

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function safeLS(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

function loadSettings() {
  const ls = safeLS(); if (!ls) return;
  try {
    const raw = ls.getItem(SETTINGS_KEY);
    if (raw) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* noop */ }
}
function saveSettings() {
  const ls = safeLS(); if (!ls) return;
  try { ls.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* noop */ }
}
loadSettings();

export function getSimCacheSettings(): Settings { return { ...settings }; }
export function setMaxEntries(n: number) {
  settings.maxEntries = Math.max(10, Math.min(2000, Math.floor(n)));
  saveSettings();
  // Evict extras.
  while (CACHE.size > settings.maxEntries) {
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
  }
  schedulePersist();
}
export function setMaxAgeDays(days: number) {
  settings.maxAgeDays = Math.max(0, Math.min(365, Math.floor(days)));
  saveSettings();
  pruneExpired();
  schedulePersist();
}
export function setMaxWorkers(n: number | "auto") {
  settings.maxWorkers = n === "auto" ? "auto" : Math.max(0, Math.min(32, Math.floor(n)));
  saveSettings();
}

function pruneExpired() {
  if (!settings.maxAgeDays) return;
  const cutoff = Date.now() - settings.maxAgeDays * 86400_000;
  for (const [k, v] of CACHE) {
    if ((v._cachedAt ?? 0) < cutoff) CACHE.delete(k);
  }
}

function schedulePersist() {
  if (!barsToken) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 400);
}

function persistNow() {
  const ls = safeLS();
  if (!ls || !barsToken) return;
  const entries = Array.from(CACHE.entries()).slice(-settings.maxEntries);
  const payload = JSON.stringify(entries);
  try {
    ls.setItem(LS_PREFIX + barsToken, payload);
  } catch {
    const half = entries.slice(-Math.floor(settings.maxEntries / 2));
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
    pruneExpired();
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
  result._cachedAt = Date.now();
  CACHE.set(key, result);
  if (CACHE.size > settings.maxEntries) {
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
  let oldest: number | null = null, newest: number | null = null;
  for (const v of CACHE.values()) {
    const t = v._cachedAt ?? 0;
    if (oldest == null || t < oldest) oldest = t;
    if (newest == null || t > newest) newest = t;
  }
  return {
    size: CACHE.size,
    barsToken,
    maxEntries: settings.maxEntries,
    maxAgeDays: settings.maxAgeDays,
    maxWorkers: settings.maxWorkers,
    oldest, newest,
  };
}

export function listCacheEntries(limit = 20): { key: string; cachedAt: number; totalReturn: number; sharpe: number; trades: number }[] {
  const out: { key: string; cachedAt: number; totalReturn: number; sharpe: number; trades: number }[] = [];
  const arr = Array.from(CACHE.entries()).reverse();
  for (const [key, v] of arr.slice(0, limit)) {
    out.push({
      key, cachedAt: v._cachedAt ?? 0,
      totalReturn: v.metrics.totalReturn, sharpe: v.metrics.sharpe, trades: v.metrics.totalTrades,
    });
  }
  return out;
}

export function clearSimCache() {
  CACHE.clear();
  const ls = safeLS();
  if (ls) {
    try {
      // Drop every fingerprint payload, not just current.
      for (let i = ls.length - 1; i >= 0; i--) {
        const k = ls.key(i);
        if (k && k.startsWith(LS_PREFIX)) ls.removeItem(k);
      }
    } catch { /* noop */ }
  }
  barsToken = null;
}

// Parallel pool ---------------------------------------------------------------

export type RuleSet = { entry: Condition[]; exit: Condition[]; risk: RiskConfig };
export type ProgressFn = (done: number, total: number, hits: number, etaMs?: number) => void;

function detectConcurrency(): number {
  try {
    const hc = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency || 4) : 4;
    const cap = settings.maxWorkers;
    if (cap === "auto") return Math.max(1, Math.min(hc, 8));
    if (cap === 0) return 0;
    return Math.max(1, Math.min(cap, hc));
  } catch { return 4; }
}

function supportsWorker(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined" && settings.maxWorkers !== 0;
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
  const started = Date.now();
  const notify = () => {
    let etaMs: number | undefined;
    const elapsed = Date.now() - started;
    const remaining = jobs.length - done;
    // ETA is only meaningful once at least one miss has completed.
    const misseDone = done - hits;
    if (misseDone > 0 && remaining > 0) etaMs = Math.round((elapsed / misseDone) * remaining);
    onProgress?.(done, jobs.length, hits, etaMs);
  };
  notify();
  if (misses.length === 0) return { results, hits };

  // Fallback: run sequentially on the main thread when workers are unavailable.
  if (!supportsWorker()) {
    for (const m of misses) {
      const r = simulateCustom(bars, m.rules, initial, costs);
      store(m.key, r);
      results[m.i] = r;
      done++;
      notify();
      // Yield so the UI stays responsive.
      await new Promise((res) => setTimeout(res, 0));
    }
    return { results, hits };
  }

  const poolSize = Math.max(1, Math.min(detectConcurrency() || 1, misses.length));
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
        notify();
        feed();
      };
      w.onerror = () => {
        // On worker failure, fall back to a synchronous run so the sweep still finishes.
        const r = simulateCustom(bars, m.rules, initial, costs);
        store(m.key, r);
        results[m.i] = r;
        done++;
        notify();
        feed();
      };
      w.postMessage({ id: m.i, bars, rules: m.rules, initial, costs });
    };
    feed();
  })));

  return { results, hits };
}