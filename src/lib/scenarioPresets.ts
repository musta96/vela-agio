/**
 * Local-only persistence for user-saved scenario presets used by
 * `MacroScenarioLab` and the Goals Monte Carlo simulator.
 *
 * Stored in `localStorage` under one versioned key so we can migrate
 * the schema later without colliding with stale data. All helpers are
 * pure and SSR-safe — they no-op when `window` is unavailable.
 */

export type PresetScope = "macro" | "mc";

export interface MacroPresetPayload {
  equity: number;       // % e.g. -15
  ratesBps: number;     // bps
  creditBps: number;    // bps
  oil: number;          // %
  gold: number;         // %
  usd: number;          // %
  runs?: number;        // simulation runs the user prefers (for MC overlays)
  confidences?: number[]; // e.g. [0.95, 0.99]
}

export interface McPresetPayload {
  initial: number;
  monthly: number;
  years: number;
  target: number;
  mean: number;        // expected annual return
  sd: number;          // annual vol
  runs: number;
  confidences: number[]; // [0.95, 0.99]
}

export type PresetPayload<S extends PresetScope> =
  S extends "macro" ? MacroPresetPayload : McPresetPayload;

export interface ScenarioPreset<S extends PresetScope = PresetScope> {
  id: string;
  name: string;
  scope: S;
  createdAt: number;
  payload: PresetPayload<S>;
}

const STORAGE_KEY = "vela.scenarioPresets.v1";

type Store = { macro: ScenarioPreset<"macro">[]; mc: ScenarioPreset<"mc">[] };

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStore(): Store {
  if (!isBrowser()) return { macro: [], mc: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { macro: [], mc: [] };
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      macro: Array.isArray(parsed.macro) ? parsed.macro : [],
      mc: Array.isArray(parsed.mc) ? parsed.mc : [],
    };
  } catch {
    return { macro: [], mc: [] };
  }
}

function writeStore(store: Store) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota or privacy mode — silently ignore */
  }
}

function makeId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* ignored */ }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listPresets<S extends PresetScope>(scope: S): ScenarioPreset<S>[] {
  const store = readStore();
  return (scope === "macro" ? store.macro : store.mc) as ScenarioPreset<S>[];
}

export function savePreset<S extends PresetScope>(
  scope: S,
  name: string,
  payload: PresetPayload<S>,
): ScenarioPreset<S> {
  const trimmed = name.trim() || "Untitled preset";
  const store = readStore();
  // Cast through `any` once — the discriminated union narrows fine to the
  // caller but TypeScript can't prove the assignment back into the store.
  const list = (scope === "macro" ? store.macro : store.mc) as ScenarioPreset[];
  // Overwrite-by-name if a preset already exists under the same label —
  // matches the way users mentally model "save" vs "save as".
  const idx = list.findIndex((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const preset = {
    id: idx >= 0 ? list[idx].id : makeId(),
    name: trimmed,
    scope,
    createdAt: idx >= 0 ? list[idx].createdAt : Date.now(),
    payload,
  } as ScenarioPreset<S>;
  if (idx >= 0) list[idx] = preset as ScenarioPreset;
  else list.unshift(preset as ScenarioPreset);
  writeStore(store);
  return preset;
}

export function deletePreset(scope: PresetScope, id: string): void {
  const store = readStore();
  if (scope === "macro") store.macro = store.macro.filter((p) => p.id !== id);
  else store.mc = store.mc.filter((p) => p.id !== id);
  writeStore(store);
}

export function getPreset<S extends PresetScope>(scope: S, id: string): ScenarioPreset<S> | null {
  return (listPresets(scope).find((p) => p.id === id) ?? null) as ScenarioPreset<S> | null;
}

/** Test/debug helper — clears everything in the namespace. */
export function _resetPresetsForTests(): void {
  if (isBrowser()) window.localStorage.removeItem(STORAGE_KEY);
}