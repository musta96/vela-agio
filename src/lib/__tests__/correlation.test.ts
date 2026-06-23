import { describe, it, expect } from "vitest";
import {
  correlationMatrix,
  correlationFromCov,
  correlationStats,
  correlationBreakdowns,
  subsetCorrelation,
  correlationMemoSection,
} from "@/lib/correlation";

// Synthetic return series so the maths is deterministic.
function repeat(n: number, fn: (i: number) => number): number[] {
  return Array.from({ length: n }, (_, i) => fn(i));
}

describe("correlationMatrix", () => {
  it("returns an empty matrix for empty input", () => {
    expect(correlationMatrix([])).toEqual([]);
    expect(correlationMatrix([[]])).toEqual([]);
  });

  it("produces ρ = 1 on the diagonal for any non-degenerate input", () => {
    const T = 60;
    const a = repeat(T, (i) => Math.sin(i / 3));
    const b = repeat(T, (i) => Math.cos(i / 4) * 0.5);
    const returns = a.map((_, t) => [a[t], b[t]]);
    const m = correlationMatrix(returns);
    expect(m).toHaveLength(2);
    expect(m[0][0]).toBeCloseTo(1, 6);
    expect(m[1][1]).toBeCloseTo(1, 6);
    expect(m[0][1]).toBeCloseTo(m[1][0], 8);
  });

  it("detects perfectly correlated and anti-correlated series", () => {
    const T = 100;
    const base = repeat(T, (i) => Math.sin(i / 5));
    // Affine transform of base → ρ = +1; negation → ρ = -1.
    const returns = base.map((x) => [x, 2 * x + 0.01, -x]);
    const m = correlationMatrix(returns);
    expect(m[0][1]).toBeCloseTo(1, 6);
    expect(m[0][2]).toBeCloseTo(-1, 6);
    expect(m[1][2]).toBeCloseTo(-1, 6);
  });

  it("returns near-zero correlation for independent random walks", () => {
    const T = 5000;
    // Deterministic 'pseudo-random' streams that are uncorrelated by construction.
    const a = repeat(T, (i) => Math.sin(i * 1.7));
    const b = repeat(T, (i) => Math.cos(i * 0.31));
    const returns = a.map((_, t) => [a[t], b[t]]);
    const m = correlationMatrix(returns);
    expect(Math.abs(m[0][1])).toBeLessThan(0.1);
  });

  it("correlationFromCov inverts the cov→corr mapping cleanly", () => {
    const cov = [
      [4, 2],
      [2, 9],
    ];
    const c = correlationFromCov(cov);
    expect(c[0][0]).toBeCloseTo(1, 8);
    expect(c[1][1]).toBeCloseTo(1, 8);
    expect(c[0][1]).toBeCloseTo(2 / (2 * 3), 8); // 0.333…
    expect(c[1][0]).toBeCloseTo(c[0][1], 8);
  });
});

describe("correlationStats", () => {
  it("handles a single-asset matrix without crashing", () => {
    const s = correlationStats(["AAPL"], [[1]]);
    expect(s.pairCount).toBe(0);
    expect(s.maxPair).toBeNull();
    expect(s.diversificationScore).toBe(0);
  });

  it("scores perfectly diversified < perfectly correlated", () => {
    const symbols = ["A", "B", "C"];
    const allOnes = [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ];
    const zeros = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const hi = correlationStats(symbols, allOnes);
    const lo = correlationStats(symbols, zeros);
    expect(hi.diversificationScore).toBeLessThan(lo.diversificationScore);
    expect(hi.avgPairwise).toBeCloseTo(1, 6);
    expect(lo.avgPairwise).toBeCloseTo(0, 6);
    expect(lo.pairCount).toBe(3);
  });

  it("identifies min and max pairs by ρ", () => {
    const m = [
      [1, 0.9, -0.3],
      [0.9, 1, 0.1],
      [-0.3, 0.1, 1],
    ];
    const s = correlationStats(["X", "Y", "Z"], m);
    expect(s.maxPair).toEqual({ a: "X", b: "Y", rho: 0.9 });
    expect(s.minPair).toEqual({ a: "X", b: "Z", rho: -0.3 });
  });
});

describe("correlationBreakdowns", () => {
  it("groups by sector, geography and asset class", () => {
    const symbols = ["AAPL", "MSFT", "TLT", "GLD"];
    // Curated identity matrix is enough — we only test grouping shape here.
    const I = symbols.map((_, i) => symbols.map((__, j) => (i === j ? 1 : 0)));
    const bd = correlationBreakdowns(symbols, I);

    const tech = bd.bySector.find((g) => g.group === "Technology");
    expect(tech?.members.sort()).toEqual(["AAPL", "MSFT"]);
    expect(tech?.avgIntra).toBeCloseTo(0, 6); // identity off-diagonal

    const us = bd.byGeography.find((g) => g.group === "US");
    expect(us?.members.length).toBe(4); // all four catalog entries are US

    const classes = bd.byAssetClass.map((g) => g.group).sort();
    expect(classes).toEqual(["Bond", "Commodity", "Equity"]);
  });

  it("returns null avgIntra for single-member groups", () => {
    const symbols = ["AAPL", "TLT"];
    const m = [
      [1, 0.2],
      [0.2, 1],
    ];
    const bd = correlationBreakdowns(symbols, m);
    bd.bySector.forEach((g) => {
      if (g.members.length === 1) expect(g.avgIntra).toBeNull();
    });
  });

  it("subsetCorrelation preserves symmetry and diagonal", () => {
    const symbols = ["A", "B", "C", "D"];
    const m = [
      [1, 0.5, 0.2, -0.1],
      [0.5, 1, 0.3, 0.0],
      [0.2, 0.3, 1, 0.4],
      [-0.1, 0.0, 0.4, 1],
    ];
    const sub = subsetCorrelation(symbols, m, (_, i) => i % 2 === 0);
    expect(sub.symbols).toEqual(["A", "C"]);
    expect(sub.matrix).toEqual([
      [1, 0.2],
      [0.2, 1],
    ]);
    expect(sub.indices).toEqual([0, 2]);
  });
});

describe("correlationMemoSection", () => {
  it("returns empty string for an empty matrix", () => {
    expect(correlationMemoSection([], [])).toBe("");
  });

  it("includes the diversification score and an extreme pair", () => {
    const symbols = ["AAPL", "MSFT", "TLT"];
    const m = [
      [1, 0.8, -0.2],
      [0.8, 1, -0.1],
      [-0.2, -0.1, 1],
    ];
    const txt = correlationMemoSection(symbols, m);
    expect(txt).toMatch(/diversification score/i);
    expect(txt).toMatch(/AAPL/);
    expect(txt).toMatch(/most correlated|least correlated/i);
  });
});