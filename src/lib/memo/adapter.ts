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

/**
 * Optional per-ticker deep-dive payload, shaped after the `deep-analysis`
 * edge function response. All fields are optional — anything missing simply
 * omits that row of the instrument section.
 */
export interface InstrumentDeepDive {
  name?: string;
  fundamentals?: Record<string, unknown> | null;
  valuation?: {
    dcf?: { intrinsicPerShare?: number; upsidePct?: number } | null;
    ddm?: { intrinsicPerShare?: number; upsidePct?: number } | null;
  } | null;
  analysis?: {
    thesis?: string;
    bullCase?: string;
    bearCase?: string;
    risks?: string[];
    recommendation?: string;
    targetPrice?: number;
    suitability?: string;
  } | null;
}

function fmtNum(v: unknown, digits = 2): string | undefined {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function buildInstrumentSection(
  symbol: string,
  weightPct: number,
  ccy: string,
  dd: InstrumentDeepDive | undefined,
): NonNullable<MemoInput["instruments"]>[number] {
  const base = {
    ticker: symbol,
    name: dd?.name ?? symbol,
    allocation: `${ccy} weight ${weightPct.toFixed(1)}%`,
  };
  if (!dd) return base;

  const f = (dd.fundamentals ?? {}) as Record<string, unknown>;
  const analysis = dd.analysis ?? {};
  const dcf = dd.valuation?.dcf;
  const price = fmtNum(f.price);
  const pe = fmtNum(f.trailingPE);
  const mcap = fmtNum(f.marketCap, 0);
  const yieldPct = typeof f.dividendYield === "number" ? `${(f.dividendYield * 100).toFixed(2)}%` : undefined;

  const overviewBits: string[] = [];
  if (f.sector) overviewBits.push(`Sector ${String(f.sector)}`);
  if (f.industry) overviewBits.push(`industry ${String(f.industry)}`);
  if (mcap) overviewBits.push(`market cap ${mcap}`);
  if (price) overviewBits.push(`last ${price}`);
  if (pe) overviewBits.push(`P/E ${pe}`);
  if (yieldPct) overviewBits.push(`yield ${yieldPct}`);
  const overview = overviewBits.length ? overviewBits.join(" · ") : undefined;

  const rationaleParts: string[] = [];
  if (analysis.thesis) rationaleParts.push(analysis.thesis);
  if (analysis.bullCase) rationaleParts.push(`Bull case: ${analysis.bullCase}`);
  if (analysis.bearCase) rationaleParts.push(`Bear case: ${analysis.bearCase}`);
  if (dcf?.intrinsicPerShare != null) {
    const up = typeof dcf.upsidePct === "number" ? ` (${(dcf.upsidePct * 100).toFixed(1)}% vs. price)` : "";
    rationaleParts.push(`DCF intrinsic value ≈ ${fmtNum(dcf.intrinsicPerShare)}${up}.`);
  }
  if (analysis.targetPrice != null) {
    rationaleParts.push(`Target price: ${fmtNum(analysis.targetPrice)}.`);
  }
  const rationale = rationaleParts.length ? rationaleParts.join(" ") : undefined;

  const suitability =
    analysis.suitability ??
    (analysis.recommendation ? `Recommendation: ${analysis.recommendation}.` : undefined);

  const risks = (analysis.risks ?? [])
    .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
    .slice(0, 6)
    .map((r) => ({ name: "Risk", desc: r }));

  const metric = analysis.recommendation
    ? { label: "Rec", value: analysis.recommendation }
    : price
      ? { label: "Last", value: `${ccy} ${price}` }
      : undefined;

  return {
    ...base,
    overview,
    rationale,
    suitability,
    risks: risks.length ? risks : undefined,
    metric,
  };
}

export function legacyPortfolioToMemoInput(
  opts: GeneratePortfolioMemoOptions,
  instrumentAnalyses?: Record<string, InstrumentDeepDive>,
): MemoInput {
  const allocation = Object.entries(opts.allocation ?? {});
  const totalWeight = allocation.reduce((a, [, w]) => a + Number(w || 0), 0) || 1;
  const ccy = opts.currency ?? "EUR";

  const instruments = allocation.map(([symbol, w]) => {
    const weightPct = (Number(w) / totalWeight) * 100;
    return buildInstrumentSection(symbol, weightPct, ccy, instrumentAnalyses?.[symbol]);
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