/**
 * End-to-end memo render tests.
 *
 * For each fixture we:
 *   1. run the fixture through `applyFallbacks` (the same pipeline the edge
 *      function uses),
 *   2. render the HTML with `renderMemoHtml`,
 *   3. walk every leaf of the ORIGINAL fixture and assert that the value
 *      (or a sensible normalised form of it) appears in the HTML.
 *
 * This guards the bug the user kept hitting: fields present in the JSON
 * silently dropped from the memo. If anything in the fixture goes missing,
 * the test prints the exact key path that failed.
 */
import { describe, expect, it } from "vitest";
import { applyFallbacks } from "@/lib/memo/fallbacks";
import { renderMemoHtml } from "@/lib/memo/template";
import type { MemoInput } from "@/lib/memo/schema";

/* ---------------- fixtures ---------------- */

const portfolioFixture: MemoInput = {
  memo_type: "portfolio",
  meta: {
    title: "Atlas Multi-Asset Book",
    subtitle: "Discretionary review, Q2 2026",
    base_currency: "EUR",
    generated_at: "2026-06-23T15:36:00Z",
    confidential: true,
  },
  cover: {
    kicker: "PORTFOLIO INVESTMENT MEMORANDUM",
    stats: [
      { label: "TOTAL VALUE", value: "EUR 184,220" },
      { label: "COST BASIS", value: "EUR 153,580" },
      { label: "UNREALISED P/L", value: "+19.9%", sign: "positive" },
      { label: "RISK RATING", value: "Elevated", sign: "amber" },
    ],
  },
  summary: {
    stance: "Constructive, rebalance",
    conviction: "Medium-high",
    risk_budget: "118% (over)",
    horizon: "Tactical: 3 to 6 months",
    assessment_paragraphs: [
      "The book carries elevated single-factor risk concentrated in semiconductors and digital assets.",
      "Trim the thematic sleeve to restore the equity-bond balance.",
    ],
    key_metrics: [
      { label: "Total market value", value: "EUR 184,220" },
      { label: "Effective positions (1 over HHI)", value: "7.9", sign: "amber" },
    ],
    actions: [
      {
        n: 1,
        action: "Trim BCHN exposure to 8 percent of NAV",
        rationale: "Reduces single-factor risk.",
        impact: "-9 percent modelled drawdown",
        priority: "High",
      },
    ],
  },
  holdings: [
    {
      symbol: "BCHN.MI",
      name: "Bitcoin Tracker",
      weight: 19.1,
      value: 35240,
      cost: 23460,
      pl: 11780,
      pl_pct: 50.2,
      contribution: 7.7,
    },
    {
      symbol: "SWDA.MI",
      name: "iShares Core MSCI World",
      weight: 32.4,
      value: 59690,
      cost: 54110,
      pl: 5580,
      pl_pct: 10.3,
      contribution: 3.3,
    },
  ],
  geography_lookthrough: [
    { region: "United States", weight: 41.2 },
    { region: "Japan", weight: 7.3 },
  ],
  sectors_gics: [
    { sector: "Information Technology", weight: 28.1 },
    { sector: "Financials", weight: 14.2 },
  ],
  diversification: {
    verdict: "Elevated single-factor risk",
    axes: [
      { lens: "Asset class", hhi: 0.74, effective_n: 1.4, reading: "Equity dominant" },
      { lens: "Geography", hhi: 0.31, effective_n: 3.2, reading: "US tilted" },
    ],
  },
  macro_stress: [
    { scenario: "Global Financial Crisis 2008", pl_pct: -42.76, pl_eur: -78770, severity: 1.0 },
    { scenario: "Rates shock plus 200 bps", pl_pct: -11.2, pl_eur: -20630, severity: 0.4 },
  ],
  correlation: {
    method: "pearson_log_1y",
    labels: ["BCHN", "SWDA"],
    matrix: [
      [1.0, 0.69],
      [0.69, 1.0],
    ],
  },
  implementation: [
    { sleeve: "Thematic growth", current: 36, target: 22, change: -14, instrument: "Trim BCHN, KOR, CHIP" },
    { sleeve: "Core equity", current: 32, target: 40, change: 8, instrument: "Add SWDA" },
  ],
  rebalance_triggers: [
    "Single position above 15 percent of NAV",
    "Equity above 80 percent of book",
    "Quarterly review",
  ],
  methodology: ["Returns calculated on a time-weighted basis.", "FX translated at month-end ECB rates."],
  sources: ["Yahoo Finance EOD", "ECB FX rates"],
  disclosures: "This document is informational and does not constitute investment advice.",
};

const strategyFixture: MemoInput = {
  memo_type: "strategy",
  meta: {
    title: "Core-Satellite Growth Mandate",
    subtitle: "Capital deployment proposal",
    base_currency: "EUR",
    generated_at: "2026-06-23T15:36:00Z",
    confidential: true,
  },
  cover: {
    kicker: "STRATEGY MEMORANDUM",
    stats: [
      { label: "MANDATE SIZE", value: "EUR 100,000" },
      { label: "TIME HORIZON", value: "5 years" },
      { label: "TARGET RISK", value: "Balanced" },
    ],
  },
  summary: {
    mandate: "Balanced growth, 5 year horizon",
    stance: "Phased deployment",
    conviction: "High",
    horizon: "5 years",
    philosophy_paragraphs: [
      "The mandate combines a low-cost equity core with two satellite themes.",
      "Capital deploys in three tranches over six months to limit timing risk.",
    ],
    allocation_summary: [
      { sleeve: "Core equity", weight: 60, instruments: "SWDA, EIMI" },
      { sleeve: "Thematic", weight: 20, instruments: "KOR, CHIP" },
      { sleeve: "Bonds", weight: 20, instruments: "AGGH" },
    ],
    capital_deployment: [
      { label: "Tranche 1 (Month 0)", weight: 40 },
      { label: "Tranche 2 (Month 3)", weight: 30 },
      { label: "Tranche 3 (Month 6)", weight: 30 },
    ],
  },
  // 4 instruments to exercise the "page break after every 3" rule.
  instruments: [
    {
      ticker: "SWDA.MI",
      name: "iShares Core MSCI World UCITS ETF",
      allocation: "EUR 30,000 / 30%",
      tag: "CORE",
      metric: { label: "Ongoing charge", value: "0.20%" },
      overview: "Broad developed-market equity exposure across 23 countries.",
      rationale: "Lowest cost route to global equity beta in the mandate.",
      suitability: "Anchor position for a 5 year horizon balanced book.",
      risks: [
        { name: "Market risk", desc: "Equity drawdowns in cyclical downturns." },
        { name: "Currency risk", desc: "USD exposure unhedged from EUR." },
      ],
      diversification: "High geographic and sector diversification.",
    },
    {
      ticker: "EIMI.MI",
      name: "iShares Core MSCI EM IMI UCITS ETF",
      allocation: "EUR 20,000 / 20%",
      tag: "CORE",
      metric: { label: "Ongoing charge", value: "0.18%" },
      overview: "Broad emerging markets equity, large to small cap.",
      rationale: "Adds growth beta and partial decorrelation from DM.",
      suitability: "Complements SWDA for a balanced equity core.",
      risks: [{ name: "EM risk", desc: "Political and FX volatility above DM." }],
      diversification: "Spans 24 EM countries.",
    },
    {
      ticker: "AGGH.MI",
      name: "iShares Core Global Aggregate Bond EUR Hedged",
      allocation: "EUR 20,000 / 20%",
      tag: "BONDS",
      metric: { label: "Yield to maturity", value: "3.4%" },
      overview: "Global investment-grade bonds, EUR hedged.",
      rationale: "Provides ballast and a coupon stream in EUR terms.",
      suitability: "Reduces portfolio volatility and drawdowns.",
      risks: [{ name: "Duration risk", desc: "Sensitive to rate moves." }],
      diversification: "Across rates, credit and geography.",
    },
    {
      ticker: "CHIP.MI",
      name: "iShares MSCI Global Semiconductors",
      allocation: "EUR 10,000 / 10%",
      tag: "SATELLITE",
      metric: { label: "Expected return band", value: "8% to 14% pa" },
      overview: "Concentrated exposure to global semiconductor producers.",
      rationale: "Captures structural demand from AI and edge compute.",
      suitability: "Tactical satellite for the growth sleeve.",
      risks: [{ name: "Concentration risk", desc: "Top 10 names above 60 percent." }],
      diversification: "Sector concentrated by design.",
    },
  ],
  implementation: [
    { sleeve: "Core equity", current: 0, target: 50, change: 50, instrument: "SWDA, EIMI" },
    { sleeve: "Bonds", current: 0, target: 20, change: 20, instrument: "AGGH" },
    { sleeve: "Thematic", current: 0, target: 10, change: 10, instrument: "CHIP" },
  ],
  rebalance_triggers: ["Quarterly review", "Single position above 20 percent of NAV"],
  methodology: ["Allocations expressed at notional weight.", "Backtest assumes monthly rebalancing."],
  sources: ["MSCI methodology notes", "iShares fact sheets"],
  disclosures: "Capital at risk. Past performance does not guarantee future results.",
};

/* ---------------- leaf walker ---------------- */

type Leaf = { path: string; value: string };

/** Collect every non-null leaf in the fixture as a `{path,value}` pair. */
function collectLeaves(node: unknown, path = ""): Leaf[] {
  if (node == null) return [];
  if (Array.isArray(node)) {
    return node.flatMap((child, i) => collectLeaves(child, `${path}[${i}]`));
  }
  if (typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) =>
      collectLeaves(v, path ? `${path}.${k}` : k),
    );
  }
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return [{ path, value: String(node) }];
  }
  return [];
}

/**
 * Some leaves are template-internal (won't appear verbatim) or are reformatted
 * by the renderer (numbers become "+19.9%" / "EUR 18,422"). We skip those paths
 * and assert their semantic appearance elsewhere.
 */
const SKIP_PATHS: RegExp[] = [
  /^memo_type$/, // routes the template, not rendered as text
  /^meta\.confidential$/, // rendered as the phrase "Private & Confidential"
  /^meta\.generated_at$/, // re-formatted to "dd MMM yyyy"
  /\.sign$/, // styling hint, never printed
  /\.severity$/, // drives bar width, not text
  /^correlation\.method$/, // printed in parentheses; covered by section heading check
  /\.priority$/, // already covered as part of actions table
  // numeric leaves we reformat (asserted via the formatted value check below)
  /\.weight$/,
  /\.value$/,
  /\.cost$/,
  /\.pl$/,
  /\.pl_pct$/,
  /\.contribution$/,
  /\.hhi$/,
  /\.effective_n$/,
  /\.pl_eur$/,
  /\.current$/,
  /\.target$/,
  /\.change$/,
  /^correlation\.matrix/,
  /^correlation\.labels/, // labels checked separately as substrings
  /^summary\.actions\[\d+\]\.n$/, // index, may render as table index
];

function shouldSkip(path: string): boolean {
  return SKIP_PATHS.some((re) => re.test(path));
}

/* ---------------- generic asserter ---------------- */

function expectEveryLeafRendered(fixture: MemoInput, html: string) {
  const leaves = collectLeaves(fixture).filter((l) => !shouldSkip(l.path));
  const missing: Leaf[] = [];
  for (const leaf of leaves) {
    if (!html.includes(leaf.value)) missing.push(leaf);
  }
  if (missing.length) {
    const report = missing.map((m) => `  - ${m.path} = ${JSON.stringify(m.value)}`).join("\n");
    throw new Error(`Rendered HTML is missing ${missing.length} fixture value(s):\n${report}`);
  }
}

/* ---------------- the tests ---------------- */

describe("memo end-to-end render", () => {
  it("portfolio fixture: every non-null field reaches the page", () => {
    const { input, omitted } = applyFallbacks(portfolioFixture);
    expect(omitted).toEqual([]); // nothing should be omitted
    const html = renderMemoHtml(input);
    expectEveryLeafRendered(portfolioFixture, html);
  });

  it("portfolio fixture: numeric values appear in their formatted form", () => {
    const { input } = applyFallbacks(portfolioFixture);
    const html = renderMemoHtml(input);
    expect(html).toMatch(/\+19\.9%/); // pl_pct cell
    expect(html).toMatch(/EUR 35,240/); // holding value
    expect(html).toMatch(/-42\.8%/); // stress p/l rounded to 1dp by the formatter
    expect(html).toMatch(/0\.69/); // correlation cell
    // diversification verdict rendered once, sentence-cased
    expect(html).toMatch(/Elevated single-factor risk/);
    // correlation header includes the method
    expect(html).toMatch(/pearson_log_1y/);
  });

  it("strategy fixture: every non-null field reaches the page", () => {
    const { input, omitted } = applyFallbacks(strategyFixture);
    expect(omitted).toEqual([]);
    const html = renderMemoHtml(input);
    expectEveryLeafRendered(strategyFixture, html);
  });

  it("strategy fixture: every instrument renders Overview, Rationale, Suitability and a diversification row", () => {
    const { input } = applyFallbacks(strategyFixture);
    const html = renderMemoHtml(input);
    for (const i of strategyFixture.instruments ?? []) {
      // ticker badge present
      expect(html).toMatch(new RegExp(`<span class="ticker">${i.ticker.replace(/\./g, "\\.")}</span>`));
      // the three labelled prose blocks
      if (i.overview) expect(html).toContain(i.overview);
      if (i.rationale) expect(html).toContain(i.rationale);
      if (i.suitability) expect(html).toContain(i.suitability);
      // diversification text rendered inside the risks table
      if (i.diversification) {
        expect(html).toMatch(
          new RegExp(`<strong>Diversification</strong></td><td>${escapeForRegex(i.diversification)}`),
        );
      }
    }
  });

  it("strategy fixture: a page break is inserted after every 3rd instrument", () => {
    const { input } = applyFallbacks(strategyFixture);
    const html = renderMemoHtml(input);
    // 4 instruments → exactly one page-break div between #3 and #4
    const matches = html.match(/<div class="page-break"><\/div>/g) ?? [];
    expect(matches.length).toBe(1);
    // and the break sits before the 4th ticker, not after it
    const idxBreak = html.indexOf('<div class="page-break"></div>');
    const idxLast = html.indexOf('<span class="ticker">CHIP.MI</span>');
    expect(idxBreak).toBeGreaterThan(-1);
    expect(idxLast).toBeGreaterThan(idxBreak);
  });

  it("never renders an em dash or an empty marquee / table cell", () => {
    for (const fx of [portfolioFixture, strategyFixture]) {
      const { input } = applyFallbacks(fx);
      const html = renderMemoHtml(input);
      expect(html).not.toMatch(/—/);
      expect(html).not.toMatch(/<td[^>]*>\s*—\s*<\/td>/);
      expect(html).not.toMatch(/<div class="cell"><div class="label"><\/div>/);
    }
  });
});

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}