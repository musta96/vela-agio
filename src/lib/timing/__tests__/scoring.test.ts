import { describe, expect, it } from "vitest";
import { buildSignals, rsi, scoreSignals, summarize } from "../scoring";

function synthCloses(n: number, fn: (i: number) => number): number[] {
  return Array.from({ length: n }, (_, i) => fn(i));
}

describe("timing scoring", () => {
  it("computes RSI within bounds", () => {
    const rising = synthCloses(60, (i) => 100 + i);
    const falling = synthCloses(60, (i) => 200 - i);
    expect(rsi(rising, 14)).toBeGreaterThan(70);
    expect(rsi(falling, 14)).toBeLessThan(30);
  });

  it("flags RSI oversold as buy", () => {
    const closes = synthCloses(60, (i) => 200 - i);
    const signals = buildSignals({ closes });
    const s = signals.find((x) => x.key === "rsi");
    expect(s?.direction).toBe("buy");
    expect(scoreSignals(signals).verdict).toBe("buy");
  });

  it("flags RSI overbought as avoid", () => {
    const closes = synthCloses(60, (i) => 100 + i);
    const signals = buildSignals({ closes });
    const s = signals.find((x) => x.key === "rsi");
    expect(s?.direction).toBe("avoid");
    expect(scoreSignals(signals).verdict).toBe("avoid");
  });

  it("adds post-earnings-dip buy signal when a dip is inside 10 sessions", () => {
    const closes = synthCloses(60, (i) => 150 + Math.sin(i / 3) * 2);
    const signals = buildSignals({ closes, daysSinceEarnings: 3, postEarningsGap: -0.06 });
    expect(signals.find((s) => s.key === "post-earnings-dip")?.direction).toBe("buy");
  });

  it("adds CPI wait signal but does not force the verdict alone", () => {
    const closes = synthCloses(60, (i) => 150 + Math.sin(i / 3) * 2);
    const signals = buildSignals({ closes, daysToCpi: 2 });
    expect(signals.find((s) => s.key === "cpi-window")?.direction).toBe("wait");
  });

  it("clamps score to [-100, 100]", () => {
    const stacked = Array.from({ length: 8 }, (_, i) => ({
      family: "tech" as const, key: `x${i}`, label: "x", direction: "buy" as const, weight: 50,
    }));
    expect(scoreSignals(stacked).score).toBe(100);
  });

  it("produces a human headline with the top signals", () => {
    const closes = synthCloses(60, (i) => 200 - i);
    const signals = buildSignals({ closes });
    const { headline, verdict } = summarize("AAPL", signals);
    expect(verdict).toBe("buy");
    expect(headline).toMatch(/AAPL/);
  });
});