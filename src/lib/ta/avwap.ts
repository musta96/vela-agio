// Anchored VWAP (AVWAP).
// Anchor = a bar index chosen by the user (or auto-picked from swing high/low / event).
// From the anchor forward, VWAP = cumulative(price × volume) / cumulative(volume).
// If bars have no volume we fall back to a synthetic volume of 1 per bar (still useful for shape).

import type { Bar, Pivot } from "./types";
import { findPivots } from "./structure";

export type AnchorKind = "swing_high" | "swing_low" | "session_start" | "custom";
export interface AnchorSpec {
  kind: AnchorKind;
  index: number;
  label: string;
  t: number;
  price: number;
}

export interface AVWAPPoint {
  t: number;
  index: number;
  price: number;
  avwap: number | null;
}

function typicalPrice(b: Bar): number {
  return (b.high + b.low + b.close) / 3;
}

export function computeAVWAP(bars: Bar[], anchorIndex: number): AVWAPPoint[] {
  const out: AVWAPPoint[] = new Array(bars.length);
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (i < anchorIndex) {
      out[i] = { t: b.t, index: i, price: b.close, avwap: null };
      continue;
    }
    const v = b.volume && b.volume > 0 ? b.volume : 1;
    cumPV += typicalPrice(b) * v;
    cumV += v;
    out[i] = { t: b.t, index: i, price: b.close, avwap: cumV > 0 ? cumPV / cumV : null };
  }
  return out;
}

/**
 * Suggest 2–3 useful anchor points automatically:
 * - Most recent significant swing low
 * - Most recent significant swing high
 * - The last major impulse start (largest 5-bar move in the last 60 bars)
 */
export function suggestAnchors(bars: Bar[]): AnchorSpec[] {
  if (bars.length < 20) return [];
  const pivots: Pivot[] = findPivots(bars);
  const recent = pivots.filter((p) => p.index > bars.length - 120);
  const lastLow = [...recent].reverse().find((p) => p.kind === "low");
  const lastHigh = [...recent].reverse().find((p) => p.kind === "high");
  const anchors: AnchorSpec[] = [];
  if (lastLow) anchors.push({ kind: "swing_low", index: lastLow.index, label: "Swing Low", t: lastLow.t, price: lastLow.price });
  if (lastHigh) anchors.push({ kind: "swing_high", index: lastHigh.index, label: "Swing High", t: lastHigh.t, price: lastHigh.price });

  // Impulse start = start of the largest 5-bar percentage move in the last 60 bars.
  const lookback = Math.min(60, bars.length - 6);
  let bestI = -1, bestMag = 0;
  for (let i = bars.length - lookback; i < bars.length - 5; i++) {
    if (i < 0) continue;
    const mag = Math.abs(bars[i + 5].close - bars[i].close) / bars[i].close;
    if (mag > bestMag) { bestMag = mag; bestI = i; }
  }
  if (bestI >= 0 && bestMag > 0.02) {
    anchors.push({ kind: "custom", index: bestI, label: `Impulse start (${(bestMag * 100).toFixed(1)}%)`, t: bars[bestI].t, price: bars[bestI].close });
  }
  return anchors;
}

/**
 * Reclaim event: price crossed back above the AVWAP after being below (or vice-versa).
 * Returns the most recent reclaim of each direction, or null if none in the window.
 */
export function detectAVWAPReclaim(points: AVWAPPoint[]): { bullish?: number; bearish?: number } {
  const out: { bullish?: number; bearish?: number } = {};
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].avwap, b = points[i].avwap;
    if (a == null || b == null) continue;
    const pa = points[i - 1].price, pb = points[i].price;
    if (pa < a && pb > b) out.bullish = i;
    if (pa > a && pb < b) out.bearish = i;
  }
  return out;
}