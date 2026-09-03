import { describe, expect, it } from "vitest";
import { computeIndicatorSeries, latestIndicatorSummary } from "@/lib/ta/indicators";
import type { Bar } from "@/lib/ta/types";

const bars: Bar[] = Array.from({ length: 60 }, (_, i) => ({
  t: i, open: 100 + i, high: 102 + i, low: 99 + i, close: 100 + i, volume: 1000,
}));

describe("technical indicators", () => {
  it("only exposes moving averages after their configured windows", () => {
    const series = computeIndicatorSeries(bars, { smaFast: 10, smaSlow: 30 });
    expect(series[8]?.sma20).toBeUndefined();
    expect(series[9]?.sma20).toBe(104.5);
    expect(series[28]?.sma50).toBeUndefined();
    expect(series[29]?.sma50).toBe(114.5);
  });

  it("keeps RSI bounded and returns a latest summary", () => {
    const summary = latestIndicatorSummary(bars);
    expect(summary?.rsi14).toBeGreaterThanOrEqual(0);
    expect(summary?.rsi14).toBeLessThanOrEqual(100);
    expect(summary?.sma20).toBe(149.5);
  });
});
