import type { Bar, FVG, OrderBlock, LiquidityGrab, SupplyDemandZone } from "./types.ts";
import { findPivots } from "./structure.ts";

// ---------- Fair Value Gaps (3-bar imbalance) ----------
// Bullish FVG: low[i+1] > high[i-1] — creates a gap where price hasn't traded.
// Bearish FVG: high[i+1] < low[i-1].
export function detectFVGs(bars: Bar[]): FVG[] {
  const out: FVG[] = [];
  for (let i = 1; i < bars.length - 1; i++) {
    const prev = bars[i - 1];
    const next = bars[i + 1];
    if (next.low > prev.high) {
      const top = next.low;
      const bottom = prev.high;
      let filled = false;
      for (let j = i + 2; j < bars.length; j++) {
        if (bars[j].low <= bottom) { filled = true; break; }
      }
      out.push({ index: i, t: bars[i].t, bias: "bullish", top, bottom, filled });
    }
    if (next.high < prev.low) {
      const top = prev.low;
      const bottom = next.high;
      let filled = false;
      for (let j = i + 2; j < bars.length; j++) {
        if (bars[j].high >= top) { filled = true; break; }
      }
      out.push({ index: i, t: bars[i].t, bias: "bearish", top, bottom, filled });
    }
  }
  return out;
}

// ---------- Order Blocks ----------
// Bullish OB: the last down-close candle before a strong up move (>= 2× ATR).
// Bearish OB: last up-close candle before a strong down move.
export function detectOrderBlocks(bars: Bar[]): OrderBlock[] {
  if (bars.length < 20) return [];
  // Rough ATR-like measure — average range over 14 bars.
  const window = 14;
  const rangeAvg: number[] = new Array(bars.length).fill(0);
  for (let i = window; i < bars.length; i++) {
    let s = 0;
    for (let j = i - window; j < i; j++) s += bars[j].high - bars[j].low;
    rangeAvg[i] = s / window;
  }
  const out: OrderBlock[] = [];
  for (let i = 1; i < bars.length - 3; i++) {
    const c = bars[i];
    const move = bars[i + 1].close - bars[i + 1].open;
    const magnitude = Math.abs(move);
    if (magnitude < rangeAvg[i + 1] * 1.5) continue;
    // Bullish OB — down candle followed by strong up.
    if (c.close < c.open && move > 0 && bars[i + 1].close > c.high) {
      out.push({ index: i, t: c.t, bias: "bullish", top: c.high, bottom: c.low });
    }
    // Bearish OB — up candle followed by strong down.
    if (c.close > c.open && move < 0 && bars[i + 1].close < c.low) {
      out.push({ index: i, t: c.t, bias: "bearish", top: c.high, bottom: c.low });
    }
  }
  // Keep only zones that haven't been fully retested through.
  return out.slice(-12);
}

// ---------- Liquidity grabs ----------
// Bullish grab: bar sweeps a prior swing-low then closes back above it.
// Bearish grab: bar sweeps a prior swing-high then closes back below it.
export function detectLiquidityGrabs(bars: Bar[]): LiquidityGrab[] {
  const pivots = findPivots(bars);
  const out: LiquidityGrab[] = [];
  for (let i = 5; i < bars.length; i++) {
    const b = bars[i];
    // Look at pivots at least 3 bars behind i.
    const priorLows = pivots.filter((p) => p.kind === "low" && p.index < i - 2 && p.index > i - 40);
    const priorHighs = pivots.filter((p) => p.kind === "high" && p.index < i - 2 && p.index > i - 40);
    for (const p of priorLows) {
      if (b.low < p.price && b.close > p.price) {
        out.push({ index: i, t: b.t, bias: "bullish", sweptLevel: p.price, reclaimPrice: b.close });
        break;
      }
    }
    for (const p of priorHighs) {
      if (b.high > p.price && b.close < p.price) {
        out.push({ index: i, t: b.t, bias: "bearish", sweptLevel: p.price, reclaimPrice: b.close });
        break;
      }
    }
  }
  return out;
}

// ---------- Supply / Demand zones ----------
// Base = a cluster of 2-6 low-range bars ("consolidation") followed by a
// wide-range departure bar. Demand = base → up. Supply = base → down.
export function detectSupplyDemand(bars: Bar[]): SupplyDemandZone[] {
  if (bars.length < 30) return [];
  const window = 14;
  const rangeAvg: number[] = new Array(bars.length).fill(0);
  for (let i = window; i < bars.length; i++) {
    let s = 0;
    for (let j = i - window; j < i; j++) s += bars[j].high - bars[j].low;
    rangeAvg[i] = s / window;
  }
  const out: SupplyDemandZone[] = [];
  let i = window;
  while (i < bars.length - 2) {
    // Find a run of small-range bars.
    let start = i;
    while (i < bars.length - 2 && (bars[i].high - bars[i].low) < rangeAvg[i] * 0.7) i++;
    const len = i - start;
    if (len >= 2 && len <= 6) {
      const dep = bars[i]; // departure bar
      const depRange = dep.high - dep.low;
      if (depRange > rangeAvg[i] * 1.5) {
        // Zone spans the highs/lows of the base bars.
        const top = Math.max(...bars.slice(start, i).map((b) => b.high));
        const bottom = Math.min(...bars.slice(start, i).map((b) => b.low));
        const bias = dep.close > dep.open ? "bullish" : "bearish";
        // "Fresh" if no later bar has traded back through the zone.
        let fresh = true;
        for (let j = i + 1; j < bars.length; j++) {
          if (bars[j].low <= top && bars[j].high >= bottom) { fresh = false; break; }
        }
        out.push({
          from: { index: start, t: bars[start].t },
          to: { index: i - 1, t: bars[i - 1].t },
          top, bottom, bias, fresh,
        });
      }
    }
    i++;
  }
  return out.slice(-8);
}