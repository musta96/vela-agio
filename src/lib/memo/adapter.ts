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
import type {
  MemoInput,
  MemoReference,
  MemoMacro,
  MemoPortfolioRisk,
  MemoAssumptions,
} from "./schema";

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
  /** Optional list of provider sources returned by the enrichment call. */
  sources?: Array<{ label: string; url?: string; retrieved_at?: string }>;
}

/** Extra payload supported by v2 memos. All fields optional. */
export interface MemoExtras {
  macro?: MemoMacro;
  portfolio_risk?: MemoPortfolioRisk;
  correlation?: { method: string; labels: string[]; matrix: number[][] };
  correlation_drivers?: {
    diversifying?: Array<{ a: string; b: string; v: number }>;
    concentrating?: Array<{ a: string; b: string; v: number }>;
  };
  assumptions?: MemoAssumptions;
  extra_references?: MemoReference[];
  parent_id?: string;
  version?: number;
  /** When true, tickers with no deep-dive payload are omitted from the appendix. */
  onlyDeepDiveTickers?: boolean;
}

/** Registry that assigns stable `[N]` citation ids to each unique source. */
class RefRegistry {
  private index = new Map<string, number>();
  private list: MemoReference[] = [];
  add(label: string, url?: string, retrieved_at?: string): number {
    const key = `${label}|${url ?? ""}`;
    const existing = this.index.get(key);
    if (existing) return existing;
    const n = this.list.length + 1;
    this.index.set(key, n);
    this.list.push({ n, label, url, retrieved_at });
    return n;
  }
  all(): MemoReference[] { return this.list.slice(); }
  /** Seed the registry from a pre-existing numbered reference list. */
  seed(refs: MemoReference[] | undefined): void {
    for (const r of refs ?? []) {
      const key = `${r.label}|${r.url ?? ""}`;
      if (!this.index.has(key)) {
        this.index.set(key, r.n);
        this.list.push({ ...r });
      }
    }
  }
}

export { RefRegistry };

/**
 * Djb2 hash — mirrors the server-side `simpleHash` in generate-memo-pdf so
 * client-side fingerprints of updated instrument sections match what the
 * server persisted, letting us detect drift for incremental refreshes.
 */
export function fingerprintInstrument(instrument: NonNullable<MemoInput["instruments"]>[number]): string {
  const key = JSON.stringify({ m: instrument.metric, r: instrument.risks?.map((x) => x.desc) });
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

type CorrelationDrivers = NonNullable<MemoInput["correlation_drivers"]>;

/**
 * Build a deterministic correlation-sensitivity narrative from the scenario
 * assumptions (risk profile + macro regime), and merge it into any
 * caller-supplied `correlation_drivers` payload. Existing pairs/sensitivity
 * fields on the caller payload always win.
 */
export function withCorrelationSensitivity(
  base: CorrelationDrivers | undefined,
  ctx: { riskProfile?: string; regime?: string; hasCorrelation: boolean },
): CorrelationDrivers | undefined {
  if (!ctx.hasCorrelation && !base?.diversifying?.length && !base?.concentrating?.length) {
    return base;
  }
  if (base?.sensitivity) return base; // caller-supplied wins

  const rp = (ctx.riskProfile ?? "balanced").toLowerCase();
  const regime = ctx.regime?.trim();
  const riskLine =
    rp === "conservative" || rp === "moderate"
      ? `Because the mandate leans ${rp}, the sizing of risk-off pairs (duration, quality income) dominates the diversification benefit; correlations that spike toward 1 in stress episodes shrink the effective breadth of the book far more than in a growthier profile.`
      : rp === "growth" || rp === "aggressive"
        ? `Because the mandate leans ${rp}, the sizing of risk-on pairs (equity beta, credit, cyclicals) dominates; pairwise correlations that already sit above 0.6 tend to converge further in risk-off tape, so the marginal diversification benefit is smaller than the matrix suggests.`
        : `A balanced sizing keeps the effective number of bets close to the raw count today, but that convergence is not stable across regimes and the drivers should be re-read at each rebalance.`;

  const paragraphs = [
    "The correlation drivers above are conditional on the current sample window and the strategy inputs. Different scenario assumptions rewrite both which pairs diversify and by how much.",
    riskLine,
    regime
      ? `Under the assumed macro regime (${regime}), stock-bond correlation runs closer to the base case; the diversifying pairs above are largely intact. A regime shift toward risk-off or a re-acceleration of inflation would compress those pairs toward the concentrating cluster and cut the realised diversification benefit.`
      : `Absent a stated regime, treat the matrix as a same-window snapshot: any regime shift (disinflation stalling, growth shock, liquidity event) can flip diversifying pairs into concentrating ones within weeks.`,
  ];

  const regime_deltas = [
    {
      regime: "Risk-off / recession",
      note: "Equity–credit and cross-region equity pairs converge toward 1; duration and gold typically decorrelate, so the diversifying block above widens and dominates portfolio behaviour.",
    },
    {
      regime: "Inflation re-acceleration",
      note: "Stock-bond correlation flips positive; duration stops hedging equities, and real assets / commodities become the effective diversifier instead of Treasuries.",
    },
    {
      regime: "Liquidity shock",
      note: "Historically low-correlation pairs correlate on the way down; the matrix understates tail co-movement and the concentrating cluster is what actually drives short-horizon drawdowns.",
    },
  ];

  return {
    ...base,
    sensitivity: { paragraphs, regime_deltas },
  };
}

function fmtNum(v: unknown, digits = 2): string | undefined {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function buildInstrumentSection(
  symbol: string,
  weightPct: number,
  ccy: string,
  dd: InstrumentDeepDive | undefined,
  refs: RefRegistry,
): NonNullable<MemoInput["instruments"]>[number] {
  const base = {
    ticker: symbol,
    name: dd?.name ?? symbol,
    allocation: `${ccy} weight ${weightPct.toFixed(1)}%`,
  };
  if (!dd) return base;

  // Cite every fundamentals/valuation claim to the same-day pull of the
  // upstream data. When explicit sources are supplied by the caller we use
  // those; otherwise we synthesize a generic Yahoo Finance reference so the
  // rendered PDF still has a numbered citation and reference-list entry.
  const providedSources = dd.sources ?? [];
  const primaryCite = providedSources.length
    ? refs.add(providedSources[0].label, providedSources[0].url, providedSources[0].retrieved_at)
    : refs.add(`Yahoo Finance · ${symbol} quote summary`, `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`, new Date().toISOString());
  for (let i = 1; i < providedSources.length; i++) {
    refs.add(providedSources[i].label, providedSources[i].url, providedSources[i].retrieved_at);
  }
  const cite = `[${primaryCite}]`;

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
  const overview = overviewBits.length ? `${overviewBits.join(" · ")} ${cite}` : undefined;

  const rationaleParts: string[] = [];
  if (analysis.thesis) rationaleParts.push(analysis.thesis);
  if (analysis.bullCase) rationaleParts.push(`Bull case: ${analysis.bullCase}`);
  if (analysis.bearCase) rationaleParts.push(`Bear case: ${analysis.bearCase}`);
  if (dcf?.intrinsicPerShare != null) {
    const up = typeof dcf.upsidePct === "number" ? ` (${(dcf.upsidePct * 100).toFixed(1)}% vs. price)` : "";
    rationaleParts.push(`DCF intrinsic value ≈ ${fmtNum(dcf.intrinsicPerShare)}${up} ${cite}.`);
  }
  if (analysis.targetPrice != null) {
    rationaleParts.push(`Target price: ${fmtNum(analysis.targetPrice)} ${cite}.`);
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
  extras?: MemoExtras,
): MemoInput {
  const allocation = Object.entries(opts.allocation ?? {});
  const totalWeight = allocation.reduce((a, [, w]) => a + Number(w || 0), 0) || 1;
  const ccy = opts.currency ?? "EUR";
  const refs = new RefRegistry();

  const includeSymbols = extras?.onlyDeepDiveTickers
    ? allocation.filter(([sym]) => Boolean(instrumentAnalyses?.[sym]))
    : allocation;
  const instruments = includeSymbols.map(([symbol, w]) => {
    const weightPct = (Number(w) / totalWeight) * 100;
    return buildInstrumentSection(symbol, weightPct, ccy, instrumentAnalyses?.[symbol], refs);
  });

  // Merge caller-supplied references (e.g. macro FRED links) into the registry
  // so they render in the numbered list without duplication.
  (extras?.extra_references ?? []).forEach((r) => refs.add(r.label, r.url, r.retrieved_at));

  // Auto-derive a correlation-sensitivity narrative from the risk profile and
  // macro regime so every memo explains how the scenario assumptions reshape
  // pairwise correlations, without requiring callers to hand-author it.
  const correlation_drivers = withCorrelationSensitivity(
    extras?.correlation_drivers,
    { riskProfile: opts.riskProfile, regime: extras?.macro?.regime, hasCorrelation: Boolean(extras?.correlation) },
  );

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
        weight: (Number(includeSymbols[idx][1]) / totalWeight) * 100,
      })),
    },
    instruments,
    macro: extras?.macro,
    portfolio_risk: extras?.portfolio_risk,
    correlation: extras?.correlation,
    correlation_drivers,
    assumptions: extras?.assumptions,
    references: refs.all(),
    parent_id: extras?.parent_id,
    version: extras?.version,
    disclosures:
      opts.customSections?.riskAssessment ??
      "This document is for informational purposes only and does not constitute investment advice. Past performance is not indicative of future results.",
  };
}