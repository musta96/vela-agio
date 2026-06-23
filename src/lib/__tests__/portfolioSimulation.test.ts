import { describe, it, expect } from "vitest";
import {
  cholesky,
  estimateAssetStats,
  runPortfolioSimulation,
} from "@/lib/portfolioSimulation";

// Deterministic LCG so the GBM math can be asserted without flakiness.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 1) / 4_294_967_297;
  };
}

describe("cholesky", () => {
  it("factorises a 2×2 positive-definite matrix so L L^T = A", () => {
    const A = [[4, 2], [2, 3]];
    const L = cholesky(A);
    expect(L[0][0]).toBeCloseTo(2, 6);
    expect(L[0][1]).toBeCloseTo(0, 6);
    expect(L[1][0]).toBeCloseTo(1, 6);
    expect(L[1][1]).toBeCloseTo(Math.sqrt(2), 6);
    const llt00 = L[0][0] ** 2 + L[0][1] ** 2;
    const llt11 = L[1][0] ** 2 + L[1][1] ** 2;
    const llt01 = L[0][0] * L[1][0] + L[0][1] * L[1][1];
    expect(llt00).toBeCloseTo(A[0][0], 6);
    expect(llt11).toBeCloseTo(A[1][1], 6);
    expect(llt01).toBeCloseTo(A[0][1], 6);
  });

  it("preserves the identity matrix", () => {
    const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    expect(cholesky(I)).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  });

  it("gracefully clamps tiny negative diagonals from float noise", () => {
    const A = [[1, 0.9999999], [0.9999999, 1]];
    const L = cholesky(A);
    // Off-diagonal close to 1, diagonal positive (clamped to >= 1e-12).
    expect(L[1][0]).toBeCloseTo(1, 5);
    expect(L[1][1]).toBeGreaterThanOrEqual(0);
  });
});

describe("estimateAssetStats", () => {
  it("annualises mean and sd of constant returns correctly", () => {
    const rets = Array.from({ length: 252 }, () => 0.001);
    const [{ mu, sigma }] = estimateAssetStats([rets], 252);
    expect(mu).toBeCloseTo(0.252, 5);
    expect(sigma).toBeLessThan(1e-6);
  });

  it("handles empty series with sensible defaults", () => {
    const [{ mu, sigma }] = estimateAssetStats([[]], 252);
    expect(mu).toBe(0);
    expect(sigma).toBeGreaterThan(0);
  });
});

describe("runPortfolioSimulation", () => {
  it("zero-vol portfolio compounds at exactly the drift rate", () => {
    const res = runPortfolioSimulation({
      assets: [{ symbol: "X", weight: 1, mu: 0.10, sigma: 0 }],
      corr: [[1]],
      initialValue: 100,
      horizonYears: 5,
      runs: 25,
      stepsPerYear: 12,
      rng: makeRng(1),
    });
    const analytical = 100 * Math.exp(0.10 * 5);
    expect(res.expected).toBeCloseTo(analytical, 4);
    expect(res.var95).toBe(0);
    expect(res.probLoss).toBe(0);
    expect(res.percentiles.p05).toBeCloseTo(analytical, 4);
  });

  it("E[V_T] approximates the GBM analytical mean V0·exp(μT)", () => {
    const res = runPortfolioSimulation({
      assets: [{ symbol: "X", weight: 1, mu: 0.08, sigma: 0.20 }],
      corr: [[1]],
      initialValue: 100,
      horizonYears: 10,
      runs: 4000,
      stepsPerYear: 12,
      rng: makeRng(7),
    });
    const analytical = 100 * Math.exp(0.08 * 10);
    const ratio = res.expected / analytical;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.25);
    expect(res.var95).toBeGreaterThan(0);
    expect(res.cvar95).toBeGreaterThanOrEqual(res.var95);
  });

  it("produces a monotonic fan chart and CDF with sensitivity rows", () => {
    const res = runPortfolioSimulation({
      assets: [
        { symbol: "A", weight: 0.6, mu: 0.07, sigma: 0.15 },
        { symbol: "B", weight: 0.4, mu: 0.04, sigma: 0.08 },
      ],
      corr: [[1, 0.2], [0.2, 1]],
      initialValue: 1000,
      horizonYears: 3,
      runs: 500,
      stepsPerYear: 12,
      rng: makeRng(11),
    });
    expect(res.fanChart.length).toBeGreaterThan(1);
    res.fanChart.forEach((p) => {
      expect(p.p05).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p95);
    });
    // CDF probabilities are non-decreasing.
    for (let i = 1; i < res.cdf.length; i++) {
      expect(res.cdf[i].p).toBeGreaterThanOrEqual(res.cdf[i - 1].p);
    }
    expect(res.sensitivity).toHaveLength(2);
    res.sensitivity.forEach((s) => {
      expect(Number.isFinite(s.deltaExpected)).toBe(true);
      expect(Number.isFinite(s.deltaVar95)).toBe(true);
    });
  });

  it("CVaR is always ≥ VaR at the same confidence level", () => {
    const res = runPortfolioSimulation({
      assets: [{ symbol: "X", weight: 1, mu: 0.05, sigma: 0.30 }],
      corr: [[1]],
      initialValue: 1000,
      horizonYears: 1,
      runs: 1500,
      rng: makeRng(99),
    });
    expect(res.cvar95).toBeGreaterThanOrEqual(res.var95);
    expect(res.cvar99).toBeGreaterThanOrEqual(res.var99);
    expect(res.var99).toBeGreaterThanOrEqual(res.var95); // 99% tail is deeper
  });

  it("auto-normalises unscaled weights", () => {
    const a = runPortfolioSimulation({
      assets: [
        { symbol: "A", weight: 30, mu: 0.05, sigma: 0.10 },
        { symbol: "B", weight: 70, mu: 0.05, sigma: 0.10 },
      ],
      corr: [[1, 1], [1, 1]],
      initialValue: 100,
      horizonYears: 1,
      runs: 50,
      rng: makeRng(3),
    });
    const b = runPortfolioSimulation({
      assets: [
        { symbol: "A", weight: 0.3, mu: 0.05, sigma: 0.10 },
        { symbol: "B", weight: 0.7, mu: 0.05, sigma: 0.10 },
      ],
      corr: [[1, 1], [1, 1]],
      initialValue: 100,
      horizonYears: 1,
      runs: 50,
      rng: makeRng(3),
    });
    expect(a.expected).toBeCloseTo(b.expected, 6);
  });
});