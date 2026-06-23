import { describe, it, expect } from "vitest";
import {
  MACRO_SCENARIOS,
  applyMacroScenario,
  histogram,
  instrumentShock,
  quantile,
  type MacroShock,
  type ScenarioPosition,
} from "@/lib/quantScenarios";
import type { InstrumentMeta } from "@/lib/instrumentMeta";

// ----------------------------------------------------------------------
// Deterministic fixtures — kept terse and explicit so future regressions
// produce obvious diffs.
// ----------------------------------------------------------------------

const META_EQUITY_US_TECH: InstrumentMeta = {
  symbol: "TECH",
  sector: "Technology",
  geography: "US",
  assetClass: "Equity",
};
const META_BOND_LONG: InstrumentMeta = {
  symbol: "TLT",
  sector: "Long Treasury",
  geography: "US",
  assetClass: "Bond",
};
const META_GOLD: InstrumentMeta = {
  symbol: "GLD",
  sector: "Precious Metals",
  geography: "Global",
  assetClass: "Commodity",
};
const META_CRYPTO: InstrumentMeta = {
  symbol: "BTC",
  sector: "Crypto",
  geography: "Global",
  assetClass: "Crypto",
};

const EQUITY_DOWN_20: MacroShock = { equity: -0.20 };
const RATES_UP_100BPS: MacroShock = { ratesBps: 100 };
const GOLD_UP_10: MacroShock = { gold: 0.10 };

describe("instrumentShock", () => {
  it("applies sector beta × geography for equities", () => {
    const shock = instrumentShock(META_EQUITY_US_TECH, EQUITY_DOWN_20);
    // Tech beta = 1.35, US geo = 1.0, no oil tilt for tech
    expect(shock).toBeCloseTo(-0.20 * 1.35, 6);
  });

  it("uses duration to translate rates moves for bonds", () => {
    const shock = instrumentShock(META_BOND_LONG, RATES_UP_100BPS);
    // Long treasury duration = 17; +100bps = +0.01 rate → -17% price
    expect(shock).toBeCloseTo(-0.17, 6);
  });

  it("maps gold shock directly to precious-metals commodities", () => {
    const shock = instrumentShock(META_GOLD, GOLD_UP_10);
    // Pure gold shock, no USD offset
    expect(shock).toBeCloseTo(0.10, 6);
  });

  it("amplifies equity shocks for crypto (high-beta proxy)", () => {
    const shock = instrumentShock(META_CRYPTO, EQUITY_DOWN_20);
    expect(shock).toBeCloseTo(-0.20 * 1.8, 6);
  });

  it("returns 0 for an unshocked instrument", () => {
    expect(instrumentShock(META_EQUITY_US_TECH, {})).toBe(0);
  });
});

describe("applyMacroScenario", () => {
  const positions: ScenarioPosition[] = [
    { symbol: "AAPL", name: "Apple", value: 6000 },
    { symbol: "TLT", name: "Long Treasuries", value: 2000 },
    { symbol: "GLD", name: "Gold", value: 2000 },
  ];

  it("aggregates weights to ~1 across positions", () => {
    const result = applyMacroScenario(positions, MACRO_SCENARIOS[0]);
    const totalW = result.byPosition.reduce((s, p) => s + p.weight, 0);
    expect(totalW).toBeCloseTo(1, 6);
    expect(result.byPosition).toHaveLength(3);
  });

  it("derives pnlPct as pnl / total exposure", () => {
    const result = applyMacroScenario(positions, MACRO_SCENARIOS[0]);
    const total = positions.reduce((s, p) => s + p.value, 0);
    expect(result.pnlPct).toBeCloseTo(result.pnl / total, 6);
  });

  it("groups by asset-class bucket", () => {
    const result = applyMacroScenario(positions, MACRO_SCENARIOS[0]);
    const labels = result.byBucket.map((b) => b.bucket).sort();
    expect(labels).toEqual(["Bond", "Commodity", "Equity"]);
  });

  it("returns sorted byBucket ascending by pnl (worst first)", () => {
    const result = applyMacroScenario(positions, MACRO_SCENARIOS[0]);
    for (let i = 1; i < result.byBucket.length; i++) {
      expect(result.byBucket[i].pnl).toBeGreaterThanOrEqual(result.byBucket[i - 1].pnl);
    }
  });

  it("zero positions returns empty arrays and zero pnl", () => {
    const r = applyMacroScenario([], MACRO_SCENARIOS[0]);
    expect(r.pnl).toBe(0);
    expect(r.byPosition).toEqual([]);
    expect(r.byBucket).toEqual([]);
  });
});

describe("histogram & quantile", () => {
  it("histogram returns the requested number of bins for a varied sample", () => {
    const xs = Array.from({ length: 200 }, (_, i) => i);
    const h = histogram(xs, 10);
    expect(h).toHaveLength(10);
    expect(h.reduce((s, b) => s + b.count, 0)).toBe(xs.length);
    expect(h[0].low).toBe(0);
    expect(h[h.length - 1].high).toBe(199);
  });

  it("histogram collapses to a single bin when all values are equal", () => {
    const h = histogram([5, 5, 5, 5], 8);
    expect(h).toHaveLength(1);
    expect(h[0].count).toBe(4);
  });

  it("histogram on empty input is an empty array", () => {
    expect(histogram([], 5)).toEqual([]);
  });

  it("quantile is monotonic across q", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(quantile(xs, 0.1)).toBeLessThan(quantile(xs, 0.5));
    expect(quantile(xs, 0.5)).toBeLessThan(quantile(xs, 0.9));
  });

  it("quantile on empty array returns 0", () => {
    expect(quantile([], 0.5)).toBe(0);
  });
});

describe("MACRO_SCENARIOS curated regimes", () => {
  it("every scenario has unique id and well-formed shock", () => {
    const ids = new Set(MACRO_SCENARIOS.map((s) => s.id));
    expect(ids.size).toBe(MACRO_SCENARIOS.length);
    for (const s of MACRO_SCENARIOS) {
      expect(typeof s.name).toBe("string");
      expect(s.shock).toBeTruthy();
    }
  });

  it("GFC 2008 reduces portfolio value for an equity-heavy book", () => {
    const positions: ScenarioPosition[] = [
      { symbol: "AAPL", value: 8000 },
      { symbol: "MSFT", value: 2000 },
    ];
    const gfc = MACRO_SCENARIOS.find((s) => s.id === "gfc-2008")!;
    const result = applyMacroScenario(positions, gfc);
    expect(result.pnl).toBeLessThan(0);
  });

  it("Soft Landing improves an equity-heavy book", () => {
    const positions: ScenarioPosition[] = [
      { symbol: "AAPL", value: 8000 },
      { symbol: "MSFT", value: 2000 },
    ];
    const soft = MACRO_SCENARIOS.find((s) => s.id === "soft-landing")!;
    const result = applyMacroScenario(positions, soft);
    expect(result.pnl).toBeGreaterThan(0);
  });
});