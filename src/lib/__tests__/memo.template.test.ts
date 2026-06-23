import { describe, expect, it } from "vitest";
import { applyFallbacks } from "@/lib/memo/fallbacks";
import { renderMemoHtml } from "@/lib/memo/template";
import type { MemoInput } from "@/lib/memo/schema";

const portfolioFixture: MemoInput = {
  memo_type: "portfolio",
  meta: {
    title: "My Portfolio",
    subtitle: "Multi-asset discretionary review",
    base_currency: "EUR",
    generated_at: "2026-06-23T15:36:00Z",
    confidential: true,
  },
  cover: {
    kicker: "PORTFOLIO INVESTMENT MEMORANDUM",
    stats: [
      { label: "TOTAL VALUE", value: "EUR 18,422" },
      { label: "COST BASIS", value: "EUR 15,358" },
      { label: "UNREALISED P/L", value: "+19.9%", sign: "positive" },
      { label: "RISK RATING", value: "Elevated", sign: "amber" },
    ],
  },
  summary: {
    stance: "Constructive, rebalance",
    conviction: "Medium-high",
    risk_budget: "118% (over)",
    horizon: "Tactical: 3-6m",
    assessment_paragraphs: ["The book carries elevated single-factor risk.", "Action: trim thematic sleeve."],
    key_metrics: [{ label: "Total market value", value: "EUR 18,422" }],
    actions: [{ n: 1, action: "Trim BCHN to 8%", priority: "High" }],
  },
  holdings: [
    { symbol: "BCHN.MI", weight: 19.1, value: 3524, cost: 2346, pl: 1178, pl_pct: 50.2, contribution: 7.7 },
  ],
  correlation: {
    method: "pearson_log_1y",
    labels: ["BCHN", "SWDA"],
    matrix: [[1, 0.69], [0.69, 1]],
  },
  disclosures: "Informational only.",
};

const sparseStrategyFixture: MemoInput = {
  memo_type: "strategy",
  meta: { title: "Strategy", base_currency: "EUR" },
  instruments: [{ ticker: "SWDA", name: "iShares Core MSCI World", allocation: "EUR 30,000 / 30%" }],
};

describe("renderMemoHtml", () => {
  it("never renders an em dash or an empty marquee cell", () => {
    const { input } = applyFallbacks(portfolioFixture);
    const html = renderMemoHtml(input);
    expect(html).not.toMatch(/—/);
    expect(html).not.toMatch(/<div class="cell"><div class="label"><\/div>/);
  });

  it("omits the correlation section when matrix is invalid", () => {
    const broken: MemoInput = {
      ...portfolioFixture,
      correlation: { method: "proxy", labels: ["A"], matrix: [[1]] },
    };
    const { input } = applyFallbacks(broken);
    const html = renderMemoHtml(input);
    expect(html).not.toMatch(/Return-based correlation/);
  });

  it("renders a sparse strategy memo without empty headings", () => {
    const { input } = applyFallbacks(sparseStrategyFixture);
    const html = renderMemoHtml(input);
    expect(html).toMatch(/SWDA/);
    // No empty section headings (a section header followed immediately by another section)
    expect(html).not.toMatch(/<h1 class="section">[^<]+<\/h1>\s*<h1 class="section">/);
  });

  it("emits the cover marquee with grid-template-columns matching cell count", () => {
    const { input } = applyFallbacks(portfolioFixture);
    const html = renderMemoHtml(input);
    expect(html).toMatch(/grid-template-columns: repeat\(4, 1fr\)/);
  });
});