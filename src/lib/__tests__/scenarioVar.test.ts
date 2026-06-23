import { describe, it, expect } from "vitest";
import {
  scenarioByAssetClassMatrix,
  varCvarByAssetClass,
  type BreakdownPosition,
} from "@/lib/scenarioVar";
import { MACRO_SCENARIOS } from "@/lib/quantScenarios";

/**
 * Generate a deterministic close series with a known mean and amplitude
 * via a tiny LCG so tests don't depend on global Math.random ordering.
 */
function syntheticCloses(seed: number, len: number, baseDrift = 0.001, amplitude = 0.02): number[] {
  let s = seed >>> 0;
  const closes = [100];
  for (let i = 1; i < len; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const u = (s + 1) / 4_294_967_297;
    const shock = (u - 0.5) * amplitude;
    closes.push(closes[i - 1] * (1 + baseDrift + shock));
  }
  return closes;
}

describe("varCvarByAssetClass", () => {
  const positions: BreakdownPosition[] = [
    { symbol: "AAPL", value: 4000, closes: syntheticCloses(1, 260) },     // Equity
    { symbol: "MSFT", value: 3000, closes: syntheticCloses(2, 260) },     // Equity
    { symbol: "TLT", value: 2000, closes: syntheticCloses(3, 260, 0.0005, 0.008) }, // Bond
    { symbol: "GLD", value: 1000, closes: syntheticCloses(4, 260, 0.0003, 0.012) }, // Commodity
  ];

  it("returns one row per asset class plus a portfolio aggregate", () => {
    const out = varCvarByAssetClass(positions, [0.95, 0.99]);
    const labels = out.byClass.map((r) => r.assetClass).sort();
    expect(labels).toContain("Equity");
    expect(labels).toContain("Bond");
    expect(labels).toContain("Commodity");
    expect(out.portfolio.assetClass).toBe("Portfolio");
    expect(out.portfolio.weight).toBeCloseTo(1, 6);
  });

  it("weights within each class sum to the class total", () => {
    const out = varCvarByAssetClass(positions, [0.95]);
    const totalEquity = positions.filter((p) => ["AAPL", "MSFT"].includes(p.symbol)).reduce((s, p) => s + p.value, 0);
    const equityRow = out.byClass.find((r) => r.assetClass === "Equity");
    expect(equityRow?.value).toBe(totalEquity);
  });

  it("VaR 99% is at least as deep as VaR 95% (more negative tail)", () => {
    const out = varCvarByAssetClass(positions, [0.95, 0.99]);
    for (const row of [...out.byClass, out.portfolio]) {
      if (row.observations === 0) continue;
      // valueAtRisk returns the signed quantile loss (negative). Deeper tail
      // ⇒ more negative number, so |99%| ≥ |95%|.
      expect(Math.abs(row.varByConf[0.99])).toBeGreaterThanOrEqual(Math.abs(row.varByConf[0.95]) - 1e-9);
    }
  });

  it("|CVaR| ≥ |VaR| at the same confidence (tail mean dominates)", () => {
    const out = varCvarByAssetClass(positions, [0.95]);
    for (const row of [...out.byClass, out.portfolio]) {
      if (row.observations === 0) continue;
      expect(Math.abs(row.cvarByConf[0.95])).toBeGreaterThanOrEqual(Math.abs(row.varByConf[0.95]) - 1e-9);
    }
  });

  it("handles positions without bars gracefully (no historical VaR row)", () => {
    const out = varCvarByAssetClass([{ symbol: "AAPL", value: 1000 }], [0.95]);
    expect(out.byClass[0].observations).toBe(0);
    expect(out.byClass[0].varByConf[0.95]).toBe(0);
  });

  it("empty positions returns no class rows and a zero portfolio aggregate", () => {
    const out = varCvarByAssetClass([], [0.95]);
    expect(out.byClass).toEqual([]);
    expect(out.portfolio.observations).toBe(0);
    expect(out.portfolio.varByConf[0.95]).toBe(0);
  });
});

describe("scenarioByAssetClassMatrix", () => {
  const positions: BreakdownPosition[] = [
    { symbol: "AAPL", value: 6000 },
    { symbol: "TLT", value: 2000 },
    { symbol: "GLD", value: 2000 },
  ];

  it("produces one cell per scenario per asset-class row", () => {
    const subset = MACRO_SCENARIOS.slice(0, 3);
    const out = scenarioByAssetClassMatrix(positions, subset);
    // Three asset classes touched + one Portfolio row
    const classRows = out.rows.filter((r) => r.assetClass !== "Portfolio");
    expect(classRows.length).toBeGreaterThanOrEqual(3);
    for (const row of out.rows) expect(row.cells).toHaveLength(subset.length);
  });

  it("Portfolio row P/L equals the per-class pnl sum within rounding", () => {
    const subset = MACRO_SCENARIOS.slice(0, 3);
    const out = scenarioByAssetClassMatrix(positions, subset);
    const portfolio = out.rows.find((r) => r.assetClass === "Portfolio")!;
    portfolio.cells.forEach((cell, idx) => {
      const sum = out.rows
        .filter((r) => r.assetClass !== "Portfolio")
        .reduce((s, r) => s + r.cells[idx].pnl, 0);
      expect(cell.pnl).toBeCloseTo(sum, 4);
    });
  });

  it("returns empty rows when no positions provided", () => {
    expect(scenarioByAssetClassMatrix([], MACRO_SCENARIOS).rows).toEqual([]);
  });

  it("worst cell is the lowest-pnlPct cell in the row", () => {
    const subset = MACRO_SCENARIOS.slice(0, 3);
    const out = scenarioByAssetClassMatrix(positions, subset);
    for (const row of out.rows) {
      const min = Math.min(...row.cells.map((c) => c.pnlPct));
      expect(row.worst?.pnlPct).toBeCloseTo(min, 6);
    }
  });
});