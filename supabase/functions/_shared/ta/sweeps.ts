// Liquidity sweep (stop-run) detector.
// A "sweep" is a bar whose wick pierces a prior swing high/low by at least
// `minPenetrationATR` × ATR14 and then closes back inside the level within
// `reclaimBars`. The wick/body ratio filter avoids counting ordinary trend bars.

import type { Bar, Pivot } from "./types.ts";
import { findPivots } from "./structure.ts";

export interface SweepConfig {
  lookback: number;          // how many bars back to search for swing levels
  wickRatio: number;         // min wick / body
  minPenetrationATR: number; // min pierce measured in ATR units
  reclaimBars: number;       // must reclaim within this many bars
}

export const DEFAULT_SWEEP_CONFIG: SweepConfig = {
  lookback: 40,
  wickRatio: 2,
  minPenetrationATR: 0.25,
  reclaimBars: 2,
};

export interface Sweep {
  index: number;
  t: number;
  bias: "bullish" | "bearish"; // bullish = swept low then reclaimed up
  sweptLevel: number;
  penetrationATR: number;
  wick: number;
  reclaimed: boolean;
}

function atr14(bars: Bar[]): number[] {
  const out = new Array<number>(bars.length).fill(0);
  const trs: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const prev = bars[i - 1];
    const tr = prev
      ? Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - prev.close), Math.abs(bars[i].low - prev.close))
      : bars[i].high - bars[i].low;
    trs.push(tr);
    if (i >= 14) {
      let s = 0; for (let k = i - 13; k <= i; k++) s += trs[k];
      out[i] = s / 14;
    }
  }
  return out;
}

export function detectSweeps(bars: Bar[], cfg: Partial<SweepConfig> = {}): Sweep[] {
  const config = { ...DEFAULT_SWEEP_CONFIG, ...cfg };
  if (bars.length < 20) return [];
  const pivots: Pivot[] = findPivots(bars);
  const atr = atr14(bars);
  const out: Sweep[] = [];

  for (let i = 15; i < bars.length; i++) {
    const b = bars[i];
    const body = Math.max(1e-9, Math.abs(b.close - b.open));
    const upperWick = b.high - Math.max(b.open, b.close);
    const lowerWick = Math.min(b.open, b.close) - b.low;
    const a = atr[i]; if (!a) continue;

    // Prior swing lookup within window.
    const priorLows = pivots.filter((p) => p.kind === "low"  && p.index < i - 1 && p.index >= i - config.lookback);
    const priorHighs = pivots.filter((p) => p.kind === "high" && p.index < i - 1 && p.index >= i - config.lookback);

    // Bullish sweep: pierce a prior low then close back above it.
    for (const p of priorLows) {
      if (b.low >= p.price) continue;
      const penetrationATR = (p.price - b.low) / a;
      if (penetrationATR < config.minPenetrationATR) continue;
      if (lowerWick / body < config.wickRatio) continue;
      let reclaimed = b.close > p.price;
      if (!reclaimed) {
        for (let k = 1; k <= config.reclaimBars && i + k < bars.length; k++) {
          if (bars[i + k].close > p.price) { reclaimed = true; break; }
        }
      }
      out.push({ index: i, t: b.t, bias: "bullish", sweptLevel: p.price, penetrationATR, wick: lowerWick, reclaimed });
      break;
    }
    // Bearish sweep: pierce a prior high then close back below.
    for (const p of priorHighs) {
      if (b.high <= p.price) continue;
      const penetrationATR = (b.high - p.price) / a;
      if (penetrationATR < config.minPenetrationATR) continue;
      if (upperWick / body < config.wickRatio) continue;
      let reclaimed = b.close < p.price;
      if (!reclaimed) {
        for (let k = 1; k <= config.reclaimBars && i + k < bars.length; k++) {
          if (bars[i + k].close < p.price) { reclaimed = true; break; }
        }
      }
      out.push({ index: i, t: b.t, bias: "bearish", sweptLevel: p.price, penetrationATR, wick: upperWick, reclaimed });
      break;
    }
  }
  return out;
}

/** Recent unique swing highs/lows for chart annotation. */
export function recentSwings(bars: Bar[], lookback = 60, max = 6): Pivot[] {
  const pivots = findPivots(bars).filter((p) => p.index >= bars.length - lookback);
  return pivots.slice(-max);
}