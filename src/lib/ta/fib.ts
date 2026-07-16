// Fibonacci retracement + extension calculator, driven by the last significant impulse.

import type { Bar, Pivot } from "./types";
import { findPivots } from "./structure";

export type FibDirection = "up" | "down";

export interface FibLevel {
  ratio: number;
  price: number;
  kind: "retracement" | "extension";
  label: string;
  inGoldenZone?: boolean;
}

export interface FibAnalysis {
  direction: FibDirection;
  from: { index: number; t: number; price: number };
  to: { index: number; t: number; price: number };
  levels: FibLevel[];
  currentPrice: number;
  atLevel?: FibLevel;    // nearest level within 0.5% of price
  bias: "bullish" | "bearish" | "neutral";
  goldenZone: { top: number; bottom: number };
}

const RETR = [0.236, 0.382, 0.5, 0.618, 0.786];
const EXT  = [1.272, 1.618, 2.0, 2.618];

/** Uses the two most-recent significant swing pivots to define the impulse. */
export function computeFibonacci(bars: Bar[]): FibAnalysis | null {
  if (bars.length < 20) return null;
  const pivots: Pivot[] = findPivots(bars);
  if (pivots.length < 2) return null;
  // Take the two most-recent pivots that alternate high/low.
  let a: Pivot | null = null, b: Pivot | null = null;
  for (let i = pivots.length - 1; i >= 0 && !a; i--) {
    if (!b) b = pivots[i];
    else if (pivots[i].kind !== b.kind) { a = pivots[i]; break; }
  }
  if (!a || !b) return null;
  const from = a.index < b.index ? a : b;
  const to = a.index < b.index ? b : a;
  const direction: FibDirection = to.price > from.price ? "up" : "down";
  const move = to.price - from.price;
  const levels: FibLevel[] = [];
  for (const r of RETR) {
    const price = to.price - move * r;
    levels.push({ ratio: r, price, kind: "retracement", label: `${(r * 100).toFixed(1)}%` });
  }
  for (const r of EXT) {
    const price = to.price + move * (r - 1);
    levels.push({ ratio: r, price, kind: "extension", label: `${(r * 100).toFixed(1)}%` });
  }
  const golden = direction === "up"
    ? { bottom: to.price - move * 0.618, top: to.price - move * 0.5 }
    : { bottom: to.price - move * 0.5, top: to.price - move * 0.618 };
  const gTop = Math.max(golden.top, golden.bottom);
  const gBot = Math.min(golden.top, golden.bottom);
  for (const l of levels) l.inGoldenZone = l.price >= gBot && l.price <= gTop;

  const currentPrice = bars[bars.length - 1].close;
  let atLevel: FibLevel | undefined;
  let closest = Infinity;
  for (const l of levels) {
    const d = Math.abs(l.price - currentPrice) / currentPrice;
    if (d < closest && d < 0.005) { closest = d; atLevel = l; }
  }
  const bias: FibAnalysis["bias"] =
    atLevel && atLevel.kind === "retracement" && atLevel.inGoldenZone
      ? (direction === "up" ? "bullish" : "bearish")
      : "neutral";

  return {
    direction, from: { index: from.index, t: from.t, price: from.price },
    to: { index: to.index, t: to.t, price: to.price },
    levels, currentPrice, atLevel, bias,
    goldenZone: { top: gTop, bottom: gBot },
  };
}