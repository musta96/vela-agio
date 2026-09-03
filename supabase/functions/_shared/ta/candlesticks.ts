import type { Bar, CandlePatternHit, CandlePatternName, Bias } from "./types.ts";

// All measurements are relative to bar body and range so they work
// on any instrument / timeframe without hard-coded price thresholds.

interface Anatomy {
  body: number;        // |close - open|
  range: number;       // high - low
  upperWick: number;   // high - max(open, close)
  lowerWick: number;   // min(open, close) - low
  isBull: boolean;     // close > open
  isBear: boolean;     // close < open
  midBody: number;
}

function anatomy(b: Bar): Anatomy {
  const body = Math.abs(b.close - b.open);
  const range = Math.max(b.high - b.low, 1e-9);
  const upperWick = b.high - Math.max(b.open, b.close);
  const lowerWick = Math.min(b.open, b.close) - b.low;
  return {
    body,
    range,
    upperWick,
    lowerWick,
    isBull: b.close > b.open,
    isBear: b.close < b.open,
    midBody: (b.open + b.close) / 2,
  };
}

// Simple trend probe using last 10 bars' close direction.
function priorTrend(bars: Bar[], i: number, look = 10): Bias {
  const start = Math.max(0, i - look);
  if (i <= start) return "neutral";
  const first = bars[start].close;
  const last = bars[i - 1].close;
  const diffPct = (last - first) / first;
  if (diffPct > 0.02) return "bullish";
  if (diffPct < -0.02) return "bearish";
  return "neutral";
}

function hit(
  bars: Bar[],
  i: number,
  name: CandlePatternName,
  bias: Bias,
  description: string,
  invalidation?: number,
): CandlePatternHit {
  const b = bars[i];
  return {
    index: i,
    t: b.t,
    name,
    bias,
    priceHigh: b.high,
    priceLow: b.low,
    description,
    invalidation,
  };
}

// Detect all candlestick patterns across the full series.
export function detectCandlestickPatterns(bars: Bar[]): CandlePatternHit[] {
  const out: CandlePatternHit[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const a = anatomy(b);
    const trend = priorTrend(bars, i);

    // ---- Single-bar patterns ----
    // Doji family: very small body.
    const bodyPctOfRange = a.body / a.range;
    if (bodyPctOfRange < 0.08) {
      // Dragonfly doji: long lower wick, no upper wick.
      if (a.lowerWick > a.range * 0.6 && a.upperWick < a.range * 0.1) {
        out.push(hit(bars, i, "Dragonfly Doji", "bullish",
          "Sellers pushed price lower but were fully absorbed by the close — bullish reversal signal.", b.low));
      } else if (a.upperWick > a.range * 0.6 && a.lowerWick < a.range * 0.1) {
        out.push(hit(bars, i, "Gravestone Doji", "bearish",
          "Buyers pushed high but were fully rejected by the close — bearish reversal signal.", b.high));
      } else {
        out.push(hit(bars, i, "Doji", "neutral",
          "Indecision candle — trend continuation less likely without confirmation."));
      }
    } else if (bodyPctOfRange < 0.35 && a.upperWick > a.body && a.lowerWick > a.body) {
      // Spinning top: small body, wicks on both sides.
      out.push(hit(bars, i, "Spinning Top", "neutral",
        "Small body with balanced wicks — buyers and sellers fighting; wait for confirmation."));
    }

    // Marubozu: virtually no wicks.
    if (bodyPctOfRange > 0.9) {
      out.push(hit(bars, i, "Marubozu", a.isBull ? "bullish" : "bearish",
        a.isBull
          ? "Wide bullish body with no wicks — buyers in full control of the session."
          : "Wide bearish body with no wicks — sellers in full control of the session.",
        a.isBull ? b.low : b.high));
    }

    // Hammer / Hanging man: long lower wick, small body near top, small upper wick.
    if (a.lowerWick > 2 * a.body && a.upperWick < a.body && a.body / a.range < 0.35) {
      if (trend === "bearish") {
        out.push(hit(bars, i, "Hammer", "bullish",
          "Long lower wick after a downtrend — sellers rejected, potential bullish reversal.",
          b.low));
      } else if (trend === "bullish") {
        out.push(hit(bars, i, "Hanging Man", "bearish",
          "Long lower wick after an uptrend — buyers losing control, bearish reversal risk.",
          b.high));
      }
    }

    // Inverted hammer / Shooting star: long upper wick.
    if (a.upperWick > 2 * a.body && a.lowerWick < a.body && a.body / a.range < 0.35) {
      if (trend === "bearish") {
        out.push(hit(bars, i, "Inverted Hammer", "bullish",
          "Long upper wick after a downtrend — buyers tested higher; bullish reversal signal on confirmation.",
          b.low));
      } else if (trend === "bullish") {
        out.push(hit(bars, i, "Shooting Star", "bearish",
          "Long upper wick after an uptrend — buyers rejected at highs; bearish reversal signal.",
          b.high));
      }
    }

    // ---- Two-bar patterns ----
    if (i >= 1) {
      const p = bars[i - 1];
      const pa = anatomy(p);
      // Bullish engulfing
      if (pa.isBear && a.isBull && b.open <= p.close && b.close >= p.open && a.body > pa.body) {
        out.push(hit(bars, i, "Bullish Engulfing", "bullish",
          "Full-body bullish engulfing of the prior bearish bar — momentum flip to buyers.", b.low));
      }
      // Bearish engulfing
      if (pa.isBull && a.isBear && b.open >= p.close && b.close <= p.open && a.body > pa.body) {
        out.push(hit(bars, i, "Bearish Engulfing", "bearish",
          "Full-body bearish engulfing of the prior bullish bar — momentum flip to sellers.", b.high));
      }
      // Piercing line
      if (pa.isBear && a.isBull && b.open < p.low && b.close > pa.midBody && b.close < p.open) {
        out.push(hit(bars, i, "Piercing Line", "bullish",
          "Bullish reversal: bar opens below prior low, closes back above its midpoint.",
          b.low));
      }
      // Dark cloud cover
      if (pa.isBull && a.isBear && b.open > p.high && b.close < pa.midBody && b.close > p.open) {
        out.push(hit(bars, i, "Dark Cloud Cover", "bearish",
          "Bearish reversal: bar opens above prior high, closes back below its midpoint.",
          b.high));
      }
    }

    // ---- Three-bar patterns ----
    if (i >= 2) {
      const p1 = bars[i - 1];
      const p2 = bars[i - 2];
      const a1 = anatomy(p1);
      const a2 = anatomy(p2);

      // Morning star: big bear, small body, big bull closing above midpoint of p2.
      if (a2.isBear && a1.body < a2.body * 0.5 && a.isBull && b.close > a2.midBody) {
        out.push(hit(bars, i, "Morning Star", "bullish",
          "Three-bar bullish reversal: capitulation, indecision, then strong buy back through midpoint.",
          Math.min(p1.low, b.low)));
      }
      // Evening star: big bull, small body, big bear closing below midpoint of p2.
      if (a2.isBull && a1.body < a2.body * 0.5 && a.isBear && b.close < a2.midBody) {
        out.push(hit(bars, i, "Evening Star", "bearish",
          "Three-bar bearish reversal: euphoria, indecision, then strong sell back through midpoint.",
          Math.max(p1.high, b.high)));
      }

      // Three white soldiers: 3 rising bulls, each closing near its high.
      if (a2.isBull && a1.isBull && a.isBull
          && p1.close > p2.close && b.close > p1.close
          && p1.open > p2.open && p1.open < p2.close
          && b.open > p1.open && b.open < p1.close
          && a2.upperWick < a2.body * 0.4
          && a1.upperWick < a1.body * 0.4
          && a.upperWick < a.body * 0.4) {
        out.push(hit(bars, i, "Three White Soldiers", "bullish",
          "Three consecutive strong bull candles closing at/near highs — sustained buying pressure.",
          p2.low));
      }
      // Three black crows: mirror.
      if (a2.isBear && a1.isBear && a.isBear
          && p1.close < p2.close && b.close < p1.close
          && p1.open < p2.open && p1.open > p2.close
          && b.open < p1.open && b.open > p1.close
          && a2.lowerWick < a2.body * 0.4
          && a1.lowerWick < a1.body * 0.4
          && a.lowerWick < a.body * 0.4) {
        out.push(hit(bars, i, "Three Black Crows", "bearish",
          "Three consecutive strong bear candles closing at/near lows — sustained selling pressure.",
          p2.high));
      }
    }
  }
  return out;
}

// Only the pattern hits touching the most recent `windowBars` bars.
export function recentCandlePatterns(bars: Bar[], windowBars = 5): CandlePatternHit[] {
  const all = detectCandlestickPatterns(bars);
  const cutoff = bars.length - windowBars;
  return all.filter((h) => h.index >= cutoff);
}