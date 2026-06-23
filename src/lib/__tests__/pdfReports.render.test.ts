/**
 * Deterministic rendering test for the Goals and Risk PDF generators.
 *
 * We don't try to byte-compare the rendered PDF (jsPDF output isn't stable
 * across versions). Instead we mock `jspdf` + `jspdf-autotable` so every
 * `doc.text(...)` and `autoTable(...)` call is recorded. The test then
 * asserts that the Monte Carlo histogram, confidence percentiles, and
 * scenario summary blocks always reach the renderer, in both reports.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted so the factories can reference shared state) ──────
const recorder = vi.hoisted(() => {
  const textCalls: string[] = [];
  const autoTableCalls: Array<{ head: unknown[]; body: unknown[] }> = [];
  class FakeDoc {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    lastAutoTable: { finalY: number } | null = { finalY: 60 };
    setFillColor() {} setDrawColor() {} setTextColor() {}
    setFont() {} setFontSize() {} setLineWidth() {}
    rect() {} line() {} addPage() {} setPage() {}
    getNumberOfPages() { return 1; }
    splitTextToSize(text: string) { return [String(text)]; }
    text(arg: unknown) {
      if (Array.isArray(arg)) textCalls.push(arg.map(String).join("\n"));
      else if (typeof arg === "string") textCalls.push(arg);
    }
    output(kind: string) { return kind === "bloburl" ? "blob:mock" : ""; }
    save() {}
  }
  return { textCalls, autoTableCalls, FakeDoc };
});

vi.mock("jspdf", () => ({ default: recorder.FakeDoc }));
vi.mock("jspdf-autotable", () => ({
  default: (_doc: unknown, opts: { head?: unknown[]; body?: unknown[] }) => {
    recorder.autoTableCalls.push({ head: opts.head ?? [], body: opts.body ?? [] });
  },
}));

const { textCalls, autoTableCalls } = recorder;

// Import AFTER mocks are registered.
import {
  generateGoalsPlanReport,
  generatePortfolioRiskReport,
} from "@/lib/pdfReports";
import type { ClassVarCvar, ScenarioByClassRow } from "@/lib/scenarioVar";

beforeEach(() => {
  textCalls.length = 0;
  autoTableCalls.length = 0;
});
afterEach(() => {
  vi.clearAllMocks();
});

function joinedText(): string {
  return textCalls.join("\n");
}

function autoTableFlat(): string {
  return autoTableCalls
    .map((c) => JSON.stringify({ head: c.head, body: c.body }))
    .join("\n");
}

// ── Goals PDF ────────────────────────────────────────────────────────
describe("generateGoalsPlanReport (deterministic render)", () => {
  const baseInput = {
    name: "Retirement",
    initial: 20_000,
    monthly: 500,
    years: 5,
    target: 50_000,
    expectedReturn: 0.07,
    volatility: 0.15,
    successProb: 0.62,
    paths: {
      p10: Array.from({ length: 60 }, (_, i) => 20_000 + i * 100),
      median: Array.from({ length: 60 }, (_, i) => 20_000 + i * 200),
      p90: Array.from({ length: 60 }, (_, i) => 20_000 + i * 350),
    },
    histogram: [
      { bin: 30_000, count: 5, low: 25_000, high: 32_500 },
      { bin: 40_000, count: 12, low: 32_500, high: 45_000 },
      { bin: 55_000, count: 8, low: 45_000, high: 60_000 },
    ],
    confidenceMetrics: [
      { confidence: 0.95, var: 4200, cvar: 5800, pctValue: 28_500 },
      { confidence: 0.99, var: 6100, cvar: 7900, pctValue: 24_900 },
    ],
    scenarioSummary: [
      { name: "Bear regime", description: "Lower drift, higher vol", successProb: 0.21, medianFinal: 34_000 },
      { name: "Base case", description: "House view", successProb: 0.62, medianFinal: 52_000 },
      { name: "Bull regime", description: "Upside path", successProb: 0.88, medianFinal: 71_000 },
    ],
  };

  it("renders the histogram, confidence, and scenario sections", () => {
    generateGoalsPlanReport(baseInput);
    const text = joinedText();
    const tables = autoTableFlat();

    // Histogram block
    expect(text).toMatch(/Final-value distribution \(Monte Carlo\)/);

    // Confidence metrics table appears in autoTable head
    expect(tables).toMatch(/VaR \(loss vs initial\)/);
    expect(tables).toMatch(/CVaR \(avg of tail\)/);
    expect(tables).toMatch(/95%/);
    expect(tables).toMatch(/99%/);

    // Scenario summary block
    expect(text).toMatch(/Scenario summary/);
    expect(tables).toMatch(/Bear regime/);
    expect(tables).toMatch(/Bull regime/);
    expect(tables).toMatch(/Success prob\./);
  });

  it("still renders without optional sections (backwards compatible)", () => {
    const { histogram: _h, confidenceMetrics: _c, scenarioSummary: _s, ...input } = baseInput;
    generateGoalsPlanReport(input);
    const text = joinedText();
    // The non-optional blocks must still appear.
    expect(text).toMatch(/SUCCESS PROBABILITY/);
    expect(text).toMatch(/MEDIAN OUTCOME/);
    // And the histogram/scenario heading must NOT appear when omitted.
    expect(text).not.toMatch(/Final-value distribution/);
    expect(text).not.toMatch(/Scenario summary/);
  });

  it("orders sections deterministically across two runs", () => {
    generateGoalsPlanReport(baseInput);
    const firstText = joinedText();
    const firstTables = autoTableFlat();
    textCalls.length = 0;
    autoTableCalls.length = 0;
    generateGoalsPlanReport(baseInput);
    expect(joinedText()).toBe(firstText);
    expect(autoTableFlat()).toBe(firstTables);
  });
});

// ── Risk PDF ─────────────────────────────────────────────────────────
describe("generatePortfolioRiskReport (deterministic render)", () => {
  const portfolio: ClassVarCvar = {
    assetClass: "Portfolio",
    value: 100_000,
    weight: 1,
    varByConf: { 0.95: -0.018, 0.99: -0.031 },
    cvarByConf: { 0.95: -0.024, 0.99: -0.039 },
    observations: 240,
  };
  const byClass: ClassVarCvar[] = [
    {
      assetClass: "Equity",
      value: 70_000,
      weight: 0.7,
      varByConf: { 0.95: -0.022, 0.99: -0.036 },
      cvarByConf: { 0.95: -0.029, 0.99: -0.045 },
      observations: 240,
    },
    {
      assetClass: "Bond",
      value: 30_000,
      weight: 0.3,
      varByConf: { 0.95: -0.006, 0.99: -0.011 },
      cvarByConf: { 0.95: -0.009, 0.99: -0.015 },
      observations: 240,
    },
  ];
  const scenarioMatrix: ScenarioByClassRow[] = [
    {
      assetClass: "Equity",
      value: 70_000,
      cells: [
        { scenarioId: "gfc-2008", scenarioName: "GFC 2008", pnl: -18000, pnlPct: -0.18 },
        { scenarioId: "covid-2020", scenarioName: "COVID 2020", pnl: -14000, pnlPct: -0.14 },
      ],
      worst: { scenarioId: "gfc-2008", scenarioName: "GFC 2008", pnl: -18000, pnlPct: -0.18 },
    },
    {
      assetClass: "Portfolio",
      value: 100_000,
      cells: [
        { scenarioId: "gfc-2008", scenarioName: "GFC 2008", pnl: -19000, pnlPct: -0.19 },
        { scenarioId: "covid-2020", scenarioName: "COVID 2020", pnl: -15000, pnlPct: -0.15 },
      ],
      worst: { scenarioId: "gfc-2008", scenarioName: "GFC 2008", pnl: -19000, pnlPct: -0.19 },
    },
  ];

  const baseInput = {
    totalValue: 100_000,
    currency: "€",
    metrics: { vol: 0.18, sharpe: 0.9, maxDD: -0.22, beta: 0.95 },
    histVar: { var95: 0.018, cvar95: 0.024, var99: 0.031, parametricVaR95: 0.019 },
    byAssetClass: byClass,
    portfolio,
    scenarioMatrix,
    scenarioOrder: [
      { id: "gfc-2008", name: "GFC 2008" },
      { id: "covid-2020", name: "COVID 2020" },
    ],
    stressRows: [
      { name: "−10% equity", description: "Broad equity drawdown", pnlPct: -0.085, pnl: -8500 },
    ],
    topPositions: [
      { symbol: "AAPL", name: "Apple", value: 40_000, weight: 0.4 },
    ],
  };

  it("renders headline KPIs, VaR table, scenario matrix, and stress rows", () => {
    generatePortfolioRiskReport(baseInput);
    const text = joinedText();
    const tables = autoTableFlat();

    // Headline labels
    expect(text).toMatch(/PORTFOLIO VALUE/);
    expect(text).toMatch(/VOLATILITY/);
    expect(text).toMatch(/SHARPE \(1Y\)/);
    expect(text).toMatch(/MAX DRAWDOWN/);

    // Section titles
    expect(text).toMatch(/VaR & CVaR by asset class/);
    expect(text).toMatch(/Macro scenario P\/L by asset class/);
    expect(text).toMatch(/Stress scenarios/);
    expect(text).toMatch(/Top positions/);

    // VaR table has both asset classes and the portfolio total row
    expect(tables).toMatch(/Equity/);
    expect(tables).toMatch(/Bond/);
    expect(tables).toMatch(/Portfolio/);

    // Scenario matrix retains both scenarios as columns
    expect(tables).toMatch(/GFC 2008/);
    expect(tables).toMatch(/COVID 2020/);
  });

  it("omits the top-positions block when none provided", () => {
    const { topPositions: _tp, ...input } = baseInput;
    generatePortfolioRiskReport(input);
    expect(joinedText()).not.toMatch(/Top positions/);
  });

  it("produces identical text/table calls across two runs (deterministic)", () => {
    generatePortfolioRiskReport(baseInput);
    const firstText = joinedText();
    const firstTables = autoTableFlat();
    textCalls.length = 0;
    autoTableCalls.length = 0;
    generatePortfolioRiskReport(baseInput);
    expect(joinedText()).toBe(firstText);
    expect(autoTableFlat()).toBe(firstTables);
  });
});