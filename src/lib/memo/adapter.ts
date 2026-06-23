/**
 * Adapter from the legacy `GeneratePortfolioMemoOptions` shape (used by
 * PortfolioMemoBuilder, CopilotChat, Portfolio.tsx) to the new structured
 * `MemoInput` contract consumed by `requestMemoPdf`.
 *
 * Best-effort: any field the legacy options do not provide is left undefined,
 * which triggers the fallback rules in the new generator (the section either
 * renders with the available subset or is omitted; never empty scaffolding).
 */
import type { GeneratePortfolioMemoOptions } from "@/lib/generatePortfolioMemo";
import type { MemoInput } from "./schema";

export function legacyPortfolioToMemoInput(
  opts: GeneratePortfolioMemoOptions,
): MemoInput {
  const allocation = Object.entries(opts.allocation ?? {});
  const totalWeight = allocation.reduce((a, [, w]) => a + Number(w || 0), 0) || 1;
  const ccy = opts.currency ?? "EUR";

  const instruments = allocation.map(([symbol, w]) => {
    const weightPct = (Number(w) / totalWeight) * 100;
    return {
      ticker: symbol,
      name: symbol,
      allocation: `${ccy} weight ${weightPct.toFixed(1)}%`,
    };
  });

  return {
    memo_type: "strategy",
    meta: {
      title: opts.portfolioName ?? "Portfolio Strategy",
      subtitle: opts.riskProfile ? `Risk profile: ${opts.riskProfile}` : undefined,
      base_currency: ccy,
      generated_at: new Date().toISOString(),
      confidential: true,
    },
    cover: {
      kicker: "PORTFOLIO STRATEGY MEMO",
      stats: [
        { label: "POSITIONS", value: String(allocation.length) },
        opts.riskProfile
          ? { label: "RISK PROFILE", value: String(opts.riskProfile) }
          : null,
        { label: "BASE CURRENCY", value: ccy },
      ].filter(Boolean) as MemoInput["cover"] extends infer C
        ? C extends { stats?: infer S }
          ? NonNullable<S>
          : never
        : never,
    },
    summary: {
      mandate: opts.riskProfile ? `Risk profile: ${opts.riskProfile}` : undefined,
      philosophy_paragraphs: opts.strategyThesis ? [opts.strategyThesis] : undefined,
      assessment_paragraphs: opts.customSections?.executiveSummary
        ? [opts.customSections.executiveSummary]
        : undefined,
      allocation_summary: instruments.map((i, idx) => ({
        sleeve: i.ticker,
        weight: (Number(allocation[idx][1]) / totalWeight) * 100,
      })),
    },
    instruments,
    disclosures:
      opts.customSections?.riskAssessment ??
      "This document is for informational purposes only and does not constitute investment advice. Past performance is not indicative of future results.",
  };
}