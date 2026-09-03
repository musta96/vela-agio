import { describe, expect, it } from "vitest";
import { normalizeOhlcv } from "@/lib/ta/normalize";
import { detectCandlestickPatterns } from "@/lib/ta/candlesticks";
import { supportResistance, findPivots } from "@/lib/ta/structure";
import { computeAVWAP } from "@/lib/ta/avwap";
import { computeVolumeProfile } from "@/lib/ta/volumeProfile";
import type { Bar } from "@/lib/ta/types";

const bar = (t: number, close: number, open = close, high = Math.max(open, close), low = Math.min(open, close), volume = 100): Bar => ({ t, open, high, low, close, volume });

describe("advanced TA OHLCV regressions", () => {
  it("normalizes close-only, unsorted, duplicate input and clamps bounds", () => {
    const out = normalizeOhlcv([{ t: 2, close: 20 }, { t: 1, close: 10 }, { t: 2, open: 15, high: 12, low: 30, close: 25 }]);
    expect(out.map((b) => b.t)).toEqual([1, 2]);
    expect(out[0]).toMatchObject({ open: 10, high: 10, low: 10, close: 10 });
    expect(out[1]).toMatchObject({ open: 15, high: 30, low: 12, close: 25 });
  });
  it("detects a bullish marubozu", () => {
    const hits = detectCandlestickPatterns([bar(1, 110, 100, 110, 100)]);
    expect(hits.some((h) => h.name === "Marubozu" && h.bias === "bullish")).toBe(true);
  });
  it("finds the center pivot and clusters nearby resistance", () => {
    const closes = [100, 101, 102, 103, 102, 101, 100, 101, 102, 103, 102, 101, 100];
    const bars = closes.map((c, i) => bar(i, c, c, c + 0.1, c - 0.1));
    expect(findPivots(bars).some((p) => p.kind === "high" && p.index === 3)).toBe(true);
    expect(supportResistance(bars, 1.2).some((z) => z.type === "resistance" && z.touches >= 2)).toBe(true);
  });
  it("starts AVWAP only at the selected anchor and computes a profile POC", () => {
    const bars = Array.from({ length: 6 }, (_, i) => bar(i, 100 + i, 100 + i, 101 + i, 99 + i, i === 4 ? 1000 : 10));
    const avwap = computeAVWAP(bars, 3);
    expect(avwap.slice(0, 3).every((p) => p.avwap === null)).toBe(true);
    expect(avwap[3].avwap).toBeCloseTo(103);
    const profile = computeVolumeProfile(bars, 6);
    expect(profile).not.toBeNull();
    expect(profile?.poc).toBeGreaterThan(100);
  });
});
