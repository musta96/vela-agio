// OHLCV normalization shared by the backtest simulator, the signal overlays and
// the detector reports. Historical feeds frequently return close-only bars,
// null gaps, unsorted timestamps or inconsistent high/low bounds — every
// advanced detector assumes a clean, causal, ascending OHLCV series.

import type { Bar } from "./types";

export interface RawBar {
  t: number;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close: number;
  volume?: number | null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Normalize a raw bar series into strict OHLCV bars:
 * - drops bars without a finite, positive close or a finite timestamp
 * - fills missing open/high/low from the close (close-only feeds)
 * - clamps high/low so that low <= min(open, close) and high >= max(open, close)
 * - drops negative volume, keeps `undefined` when the feed has none
 * - sorts ascending by timestamp and keeps the last bar per timestamp
 */
export function normalizeOhlcv(bars: RawBar[] | null | undefined): Bar[] {
  if (!bars || !bars.length) return [];
  const byTime = new Map<number, Bar>();
  for (const raw of bars) {
    const t = num(raw?.t);
    const close = num(raw?.close);
    if (t === null || close === null || close <= 0) continue;
    const open = num(raw.open) ?? close;
    const highRaw = num(raw.high) ?? Math.max(open, close);
    const lowRaw = num(raw.low) ?? Math.min(open, close);
    const high = Math.max(highRaw, lowRaw, open, close);
    const low = Math.min(lowRaw, highRaw, open, close);
    const vol = num(raw.volume);
    const bar: Bar = { t, open, high, low, close };
    if (vol !== null && vol >= 0) bar.volume = vol;
    byTime.set(t, bar);
  }
  return Array.from(byTime.values()).sort((a, b) => a.t - b.t);
}

/** True when at least one bar carries real (non-synthetic) volume. */
export function hasRealVolume(bars: Bar[]): boolean {
  return bars.some((b) => typeof b.volume === "number" && b.volume > 0);
}
