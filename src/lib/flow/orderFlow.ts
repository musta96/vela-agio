// Order-flow proxy from OHLC bars: since we don't have L2 tape data, we
// approximate buy vs sell pressure from where the close prints inside each bar,
// weighted by volume. Signed delta is the "buying minus selling" volume proxy.

import type { Bar } from "@/lib/ta/types";

export interface FlowPoint {
  t: number;
  delta: number;    // signed volume proxy
  cumDelta: number; // cumulative delta since window start
  close: number;
  imbalance: number; // -1..1 (where in the bar the close printed)
}

export interface FlowSummary {
  points: FlowPoint[];
  totalDelta: number;
  buyPct: number;
  sellPct: number;
  bias: "bullish" | "bearish" | "neutral";
  divergence: "bullish" | "bearish" | null; // price vs cumDelta divergence
}

export function computeOrderFlow(bars: Bar[]): FlowSummary {
  const points: FlowPoint[] = [];
  let cum = 0;
  let buyV = 0, sellV = 0;
  for (const b of bars) {
    const v = b.volume && b.volume > 0 ? b.volume : 1;
    const range = Math.max(1e-9, b.high - b.low);
    // 1 when close = high, -1 when close = low.
    const imbalance = ((b.close - b.low) - (b.high - b.close)) / range;
    const delta = v * imbalance;
    cum += delta;
    if (delta >= 0) buyV += delta; else sellV += -delta;
    points.push({ t: b.t, delta, cumDelta: cum, close: b.close, imbalance });
  }
  const totalDelta = cum;
  const totalAbs = buyV + sellV;
  const buyPct = totalAbs > 0 ? (buyV / totalAbs) * 100 : 50;
  const sellPct = 100 - buyPct;
  const bias: FlowSummary["bias"] =
    buyPct > 58 ? "bullish" : buyPct < 42 ? "bearish" : "neutral";

  // Divergence: price making new highs while cumDelta is not (bearish), or vice-versa.
  let divergence: FlowSummary["divergence"] = null;
  if (points.length > 20) {
    const last = points.length - 1;
    const start = last - 20;
    let pHi = -Infinity, pLo = Infinity, dHi = -Infinity, dLo = Infinity;
    for (let i = start; i <= last; i++) {
      pHi = Math.max(pHi, points[i].close);
      pLo = Math.min(pLo, points[i].close);
      dHi = Math.max(dHi, points[i].cumDelta);
      dLo = Math.min(dLo, points[i].cumDelta);
    }
    const priceNearHi = points[last].close >= pHi * 0.998;
    const deltaNearHi = points[last].cumDelta >= dHi * 0.98;
    const priceNearLo = points[last].close <= pLo * 1.002;
    const deltaNearLo = points[last].cumDelta <= dLo * 0.98;
    if (priceNearHi && !deltaNearHi) divergence = "bearish";
    else if (priceNearLo && !deltaNearLo) divergence = "bullish";
  }
  return { points, totalDelta, buyPct, sellPct, bias, divergence };
}