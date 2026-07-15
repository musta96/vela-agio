import type { Bar, Pivot, SRZone, Trendline, StructureShift, Bias } from "./types";

// ---------- Swing pivot detection ----------
// A high pivot at i is a bar whose high is strictly greater than every
// high in [i-left, i+right] (excluding i). Symmetric for low pivots.
export function findPivots(bars: Bar[], left = 3, right = 3): Pivot[] {
  const out: Pivot[] = [];
  for (let i = left; i < bars.length - right; i++) {
    let isHigh = true;
    let isLow = true;
    const h = bars[i].high;
    const l = bars[i].low;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (bars[j].high >= h) isHigh = false;
      if (bars[j].low <= l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) out.push({ index: i, t: bars[i].t, price: h, kind: "high" });
    if (isLow) out.push({ index: i, t: bars[i].t, price: l, kind: "low" });
  }
  return out;
}

// ---------- Support & resistance clustering ----------
// Group pivots whose prices are within `tolerancePct` of each other and rank
// by touch count. Strength is normalized touches / max-touches.
export function supportResistance(
  bars: Bar[],
  tolerancePct = 1.2,
  maxZones = 8,
): SRZone[] {
  const pivots = findPivots(bars);
  const clusters: { prices: number[]; type: "support" | "resistance" }[] = [];
  for (const p of pivots) {
    const type = p.kind === "high" ? "resistance" : "support";
    const c = clusters.find(
      (cl) =>
        cl.type === type &&
        (Math.abs(cl.prices[0] - p.price) / cl.prices[0]) * 100 < tolerancePct,
    );
    if (c) c.prices.push(p.price);
    else clusters.push({ prices: [p.price], type });
  }
  const withTouch = clusters.map((c) => ({
    price: c.prices.reduce((a, b) => a + b, 0) / c.prices.length,
    type: c.type,
    touches: c.prices.length,
  }));
  const maxTouches = withTouch.reduce((m, z) => Math.max(m, z.touches), 1);
  return withTouch
    .sort((a, b) => b.touches - a.touches)
    .slice(0, maxZones)
    .map((z) => ({ ...z, strength: z.touches / maxTouches }));
}

// ---------- Trendlines (simple linear regression through pivots) ----------
// Returns the strongest up- and down-trend lines by fit + touch count.
export function findTrendlines(bars: Bar[]): Trendline[] {
  const pivots = findPivots(bars);
  const highs = pivots.filter((p) => p.kind === "high").slice(-6); // recent highs
  const lows = pivots.filter((p) => p.kind === "low").slice(-6);
  const out: Trendline[] = [];

  const build = (a: Pivot, b: Pivot, kind: "up" | "down"): Trendline | null => {
    if (b.index <= a.index) return null;
    const slope = (b.price - a.price) / (b.index - a.index);
    const intercept = a.price - slope * a.index;
    // Confirm slope direction matches kind
    if (kind === "up" && slope <= 0) return null;
    if (kind === "down" && slope >= 0) return null;
    // Look for a breakout after `b`.
    let broken: Trendline["broken"];
    for (let i = b.index + 1; i < bars.length; i++) {
      const y = slope * i + intercept;
      if (kind === "up" && bars[i].close < y * 0.995) {
        broken = { index: i, t: bars[i].t, price: bars[i].close };
        break;
      }
      if (kind === "down" && bars[i].close > y * 1.005) {
        broken = { index: i, t: bars[i].t, price: bars[i].close };
        break;
      }
    }
    return {
      kind,
      from: { index: a.index, t: a.t, price: a.price },
      to: { index: b.index, t: b.t, price: b.price },
      slope,
      intercept,
      broken,
    };
  };

  // Downward trendline: connect two most-recent descending highs.
  for (let i = highs.length - 1; i > 0; i--) {
    for (let j = i - 1; j >= 0; j--) {
      if (highs[j].price > highs[i].price) {
        const t = build(highs[j], highs[i], "down");
        if (t) { out.push(t); break; }
      }
    }
    if (out.length) break;
  }
  // Upward trendline: connect two most-recent ascending lows.
  for (let i = lows.length - 1; i > 0; i--) {
    for (let j = i - 1; j >= 0; j--) {
      if (lows[j].price < lows[i].price) {
        const t = build(lows[j], lows[i], "up");
        if (t) { out.push(t); break; }
      }
    }
    if (out.some((x) => x.kind === "up")) break;
  }
  return out;
}

// ---------- Market structure (BOS / CHoCH) ----------
// Walks the pivot sequence tracking higher-highs / higher-lows (bullish) vs
// lower-highs / lower-lows (bearish). BOS = break in the same direction as
// the current trend, CHoCH = first break against the current trend.
export function detectStructure(bars: Bar[]): StructureShift[] {
  const pivots = findPivots(bars);
  if (pivots.length < 4) return [];
  const shifts: StructureShift[] = [];
  let trend: Bias = "neutral";
  let lastHigh: Pivot | null = null;
  let lastLow: Pivot | null = null;

  for (const p of pivots) {
    if (p.kind === "high") {
      if (lastHigh && p.price > lastHigh.price) {
        if (trend === "bullish") {
          shifts.push({ index: p.index, t: p.t, kind: "BOS", bias: "bullish", level: lastHigh.price });
        } else if (trend === "bearish") {
          shifts.push({ index: p.index, t: p.t, kind: "CHoCH", bias: "bullish", level: lastHigh.price });
          trend = "bullish";
        } else {
          trend = "bullish";
        }
      }
      lastHigh = p;
    } else {
      if (lastLow && p.price < lastLow.price) {
        if (trend === "bearish") {
          shifts.push({ index: p.index, t: p.t, kind: "BOS", bias: "bearish", level: lastLow.price });
        } else if (trend === "bullish") {
          shifts.push({ index: p.index, t: p.t, kind: "CHoCH", bias: "bearish", level: lastLow.price });
          trend = "bearish";
        } else {
          trend = "bearish";
        }
      }
      lastLow = p;
    }
  }
  return shifts;
}