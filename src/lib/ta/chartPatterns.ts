import type { Bar, ChartPatternHit, Pivot } from "./types";
import { findPivots } from "./structure";

// Chart-pattern detection is intentionally lightweight — it looks at the last
// 4-6 pivots and matches classic geometry rather than aiming for perfect fits.

function pct(a: number, b: number) {
  return Math.abs(a - b) / Math.max(a, b);
}

export function detectChartPatterns(bars: Bar[]): ChartPatternHit[] {
  if (bars.length < 40) return [];
  const pivots = findPivots(bars);
  const out: ChartPatternHit[] = [];
  const highs = pivots.filter((p) => p.kind === "high");
  const lows = pivots.filter((p) => p.kind === "low");

  // ---- Head & Shoulders (H&S) ----
  // Look at the last 3 highs. Middle must be highest; shoulders roughly equal.
  if (highs.length >= 3) {
    const [L, H, R] = highs.slice(-3);
    if (H.price > L.price && H.price > R.price && pct(L.price, R.price) < 0.04) {
      const neckline = Math.min(
        ...bars.slice(L.index, R.index + 1).map((b) => b.low),
      );
      const target = neckline - (H.price - neckline);
      out.push({
        name: "Head & Shoulders",
        bias: "bearish",
        from: L.index, to: R.index,
        keyPrice: neckline,
        target,
        invalidation: H.price,
      });
    }
  }
  // Inverse H&S
  if (lows.length >= 3) {
    const [L, H, R] = lows.slice(-3);
    if (H.price < L.price && H.price < R.price && pct(L.price, R.price) < 0.04) {
      const neckline = Math.max(
        ...bars.slice(L.index, R.index + 1).map((b) => b.high),
      );
      const target = neckline + (neckline - H.price);
      out.push({
        name: "Inverse Head & Shoulders",
        bias: "bullish",
        from: L.index, to: R.index,
        keyPrice: neckline,
        target,
        invalidation: H.price,
      });
    }
  }

  // ---- Double Top / Bottom ----
  if (highs.length >= 2) {
    const [a, b] = highs.slice(-2);
    if (pct(a.price, b.price) < 0.02 && b.index - a.index >= 3) {
      const trough = Math.min(...bars.slice(a.index, b.index + 1).map((x) => x.low));
      out.push({
        name: "Double Top",
        bias: "bearish",
        from: a.index, to: b.index,
        keyPrice: trough,
        target: trough - (a.price - trough),
        invalidation: Math.max(a.price, b.price),
      });
    }
  }
  if (lows.length >= 2) {
    const [a, b] = lows.slice(-2);
    if (pct(a.price, b.price) < 0.02 && b.index - a.index >= 3) {
      const peak = Math.max(...bars.slice(a.index, b.index + 1).map((x) => x.high));
      out.push({
        name: "Double Bottom",
        bias: "bullish",
        from: a.index, to: b.index,
        keyPrice: peak,
        target: peak + (peak - a.price),
        invalidation: Math.min(a.price, b.price),
      });
    }
  }

  // ---- Triangles (ascending / descending / symmetrical) ----
  if (highs.length >= 2 && lows.length >= 2) {
    const H1 = highs[highs.length - 2], H2 = highs[highs.length - 1];
    const L1 = lows[lows.length - 2], L2 = lows[lows.length - 1];
    const highsFlat = pct(H1.price, H2.price) < 0.015;
    const lowsRising = L2.price > L1.price * 1.005;
    const highsFalling = H2.price < H1.price * 0.995;
    const lowsFlat = pct(L1.price, L2.price) < 0.015;
    const from = Math.min(H1.index, L1.index);
    const to = Math.max(H2.index, L2.index);
    const key = (H1.price + H2.price) / 2;
    if (highsFlat && lowsRising) {
      out.push({ name: "Ascending Triangle", bias: "bullish", from, to, keyPrice: key,
        target: key + (key - L1.price), invalidation: L2.price });
    } else if (highsFalling && lowsFlat) {
      const keyLow = (L1.price + L2.price) / 2;
      out.push({ name: "Descending Triangle", bias: "bearish", from, to, keyPrice: keyLow,
        target: keyLow - (H1.price - keyLow), invalidation: H2.price });
    } else if (highsFalling && lowsRising) {
      out.push({ name: "Symmetrical Triangle", bias: "neutral", from, to, keyPrice: key,
        invalidation: undefined });
    }
  }

  // ---- Flags & wedges (very lightweight) ----
  // Bull flag: strong up move (>= 5% over 5 bars) then 3-6 bars of small
  // pullback with lower highs & lower lows contained inside the flagpole range.
  const n = bars.length;
  if (n >= 15) {
    const poleEnd = n - 8;
    const poleStart = Math.max(0, poleEnd - 6);
    const poleChange = (bars[poleEnd].close - bars[poleStart].close) / bars[poleStart].close;
    const flag = bars.slice(poleEnd, n);
    const flagHighs = flag.map((b) => b.high);
    const flagLows = flag.map((b) => b.low);
    const monotonicDown =
      flagHighs.slice(1).every((v, i) => v <= flagHighs[i]) &&
      flagLows.slice(1).every((v, i) => v <= flagLows[i]);
    const monotonicUp =
      flagHighs.slice(1).every((v, i) => v >= flagHighs[i]) &&
      flagLows.slice(1).every((v, i) => v >= flagLows[i]);
    if (poleChange > 0.05 && monotonicDown) {
      out.push({
        name: "Bull Flag", bias: "bullish",
        from: poleStart, to: n - 1,
        keyPrice: Math.max(...flagHighs),
        target: bars[poleEnd].close + (bars[poleEnd].close - bars[poleStart].close),
        invalidation: Math.min(...flagLows),
      });
    }
    if (poleChange < -0.05 && monotonicUp) {
      out.push({
        name: "Bear Flag", bias: "bearish",
        from: poleStart, to: n - 1,
        keyPrice: Math.min(...flagLows),
        target: bars[poleEnd].close - (bars[poleStart].close - bars[poleEnd].close),
        invalidation: Math.max(...flagHighs),
      });
    }
  }

  return out;
}