import { describe, it, expect } from "vitest";
import {
  DEFAULT_SIGNAL_TILT, computeSymbolTilt, applySignalTilts, portfolioTiltSummary,
} from "@/lib/portfolio/signalTilt";
import type { SignalStat } from "@/lib/backtest/signalReport";

const stat = (over: Partial<SignalStat>): SignalStat => ({
  kind: "Order block", signals: 10, winRate: 60,
  averageReturn: 1, bestReturn: 5, worstReturn: -3, ...over,
});

describe("computeSymbolTilt", () => {
  it("returns a neutral tilt when there is no qualifying evidence", () => {
    expect(computeSymbolTilt("AAPL", [])).toMatchObject({ score: 0, driftDelta: 0, volFactor: 1 });
    // Below the minimum sample size the signal kind is ignored.
    const thin = computeSymbolTilt("AAPL", [stat({ signals: 1, averageReturn: 40 })]);
    expect(thin).toMatchObject({ score: 0, driftDelta: 0, volFactor: 1, kinds: 0 });
  });

  it("tilts drift positively for a bullish edge and negatively for a bearish one", () => {
    const bull = computeSymbolTilt("AAPL", [stat({ averageReturn: 1, signals: 20 })]);
    const bear = computeSymbolTilt("AAPL", [stat({ averageReturn: -1, signals: 20 })]);
    expect(bull.driftDelta).toBeGreaterThan(0);
    expect(bear.driftDelta).toBeLessThan(0);
    expect(bull.driftDelta).toBeCloseTo(-bear.driftDelta, 12);
    // 1% per 10 bars annualises to ~25.2%, i.e. about half of a full tilt.
    expect(bull.annualisedEdge).toBeCloseTo(0.252, 3);
    expect(bull.score).toBeCloseTo(0.504, 3);
  });

  it("clamps the drift shift to the configured maximum", () => {
    const extreme = computeSymbolTilt("AAPL", [stat({ averageReturn: 500, signals: 50 })]);
    expect(extreme.score).toBe(1);
    expect(extreme.driftDelta).toBeCloseTo(DEFAULT_SIGNAL_TILT.maxDriftShift, 12);
  });

  it("weights signal kinds by their observation count", () => {
    const tilt = computeSymbolTilt("AAPL", [
      stat({ kind: "Order block", averageReturn: 2, signals: 90 }),
      stat({ kind: "Candlestick", averageReturn: -2, signals: 10 }),
    ]);
    // The heavily-observed bullish kind dominates the thin bearish one.
    expect(tilt.score).toBeGreaterThan(0);
    expect(tilt.kinds).toBe(2);
    expect(tilt.signals).toBe(100);
  });

  it("raises volatility when signal kinds disagree", () => {
    const agree = computeSymbolTilt("AAPL", [
      stat({ kind: "Order block", averageReturn: 1 }),
      stat({ kind: "Candlestick", averageReturn: 1 }),
    ]);
    const disagree = computeSymbolTilt("AAPL", [
      stat({ kind: "Order block", averageReturn: 4 }),
      stat({ kind: "Candlestick", averageReturn: -4 }),
    ]);
    expect(agree.volFactor).toBeCloseTo(1, 12);
    expect(disagree.volFactor).toBeGreaterThan(1);
    expect(disagree.volFactor).toBeLessThanOrEqual(1 + DEFAULT_SIGNAL_TILT.maxVolShift);
  });
});

describe("applySignalTilts", () => {
  const assets = [
    { symbol: "AAPL", weight: 0.5, mu: 0.08, sigma: 0.2 },
    { symbol: "TLT", weight: 0.5, mu: 0.03, sigma: 0.1 },
  ];

  it("adjusts only the symbols that have a tilt", () => {
    const tilt = { ...computeSymbolTilt("AAPL", [stat({ averageReturn: 1, signals: 20 })]) };
    const out = applySignalTilts(assets, [tilt]);
    expect(out[0].mu).toBeCloseTo(0.08 + tilt.driftDelta, 12);
    expect(out[0].sigma).toBeCloseTo(0.2 * tilt.volFactor, 12);
    expect(out[1]).toEqual(assets[1]);
    // Weights must never be mutated by a tilt.
    expect(out.map((a) => a.weight)).toEqual([0.5, 0.5]);
  });

  it("summarises the portfolio-level impact by weight", () => {
    const tilts = [
      { ...computeSymbolTilt("AAPL", [stat({ averageReturn: 1, signals: 20 })]) },
      { ...computeSymbolTilt("TLT", [stat({ averageReturn: -1, signals: 20 })]) },
    ];
    const summary = portfolioTiltSummary(assets, tilts);
    expect(summary.driftDelta).toBeCloseTo(0, 12);
    expect(summary.signals).toBe(40);
  });
});
