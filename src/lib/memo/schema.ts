import { z } from "zod";

/** ---------- shared atoms ---------- */
const Sign = z.enum(["positive", "negative", "amber", "neutral"]).optional();

const StatCell = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  sign: Sign,
});

const KeyMetric = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  sign: Sign,
});

/** ---------- meta + cover + summary ---------- */
export const MemoMetaSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  base_currency: z.string().length(3).optional(),
  generated_at: z.string().optional(),
  confidential: z.boolean().optional(),
});

export const CoverSchema = z.object({
  kicker: z.string().optional(),
  stats: z.array(StatCell).max(8).optional(),
});

export const SummarySchema = z.object({
  stance: z.string().optional(),
  conviction: z.string().optional(),
  risk_budget: z.string().optional(),
  horizon: z.string().optional(),
  mandate: z.string().optional(),
  assessment_paragraphs: z.array(z.string()).optional(),
  philosophy_paragraphs: z.array(z.string()).optional(),
  key_metrics: z.array(KeyMetric).optional(),
  actions: z
    .array(
      z.object({
        n: z.number().int().optional(),
        action: z.string(),
        rationale: z.string().optional(),
        impact: z.string().optional(),
        priority: z.enum(["High", "Medium", "Low"]).optional(),
      }),
    )
    .optional(),
  allocation_summary: z
    .array(
      z.object({
        sleeve: z.string(),
        weight: z.number(),
        instruments: z.string().optional(),
      }),
    )
    .optional(),
  capital_deployment: z
    .array(z.object({ label: z.string(), weight: z.number() }))
    .optional(),
});

/** ---------- portfolio sections ---------- */
export const HoldingSchema = z.object({
  symbol: z.string(),
  name: z.string().optional(),
  weight: z.number().optional(),
  value: z.number().optional(),
  cost: z.number().optional(),
  pl: z.number().optional(),
  pl_pct: z.number().optional(),
  contribution: z.number().optional(),
});

export const GeoSchema = z.object({ region: z.string(), weight: z.number() });
export const SectorSchema = z.object({ sector: z.string(), weight: z.number() });

export const DiversificationSchema = z.object({
  verdict: z.string(),
  axes: z.array(
    z.object({
      lens: z.string(),
      hhi: z.number(),
      effective_n: z.number().optional(),
      reading: z.string().optional(),
    }),
  ),
});

export const MacroStressSchema = z.object({
  scenario: z.string(),
  pl_pct: z.number(),
  pl_eur: z.number().optional(),
  severity: z.number().min(0).max(1).optional(),
});

export const CorrelationSchema = z.object({
  method: z.string(),
  labels: z.array(z.string()),
  matrix: z.array(z.array(z.number())),
});

export const ImplementationSchema = z.object({
  sleeve: z.string(),
  current: z.number(),
  target: z.number(),
  change: z.number(),
  instrument: z.string().optional(),
});

/** ---------- strategy sections ---------- */
export const InstrumentSchema = z.object({
  ticker: z.string(),
  name: z.string().optional(),
  allocation: z.string().optional(),
  tag: z.string().optional(),
  metric: z
    .object({
      label: z.string(),
      value: z.string(),
      sign: Sign,
    })
    .optional(),
  overview: z.string().optional(),
  rationale: z.string().optional(),
  suitability: z.string().optional(),
  risks: z
    .array(z.object({ name: z.string(), desc: z.string() }))
    .optional(),
  diversification: z.string().optional(),
});

/** ---------- v2: references, macro, portfolio-risk, assumptions ---------- */
export const ReferenceSchema = z.object({
  n: z.number().int().positive(),
  label: z.string().min(1),
  url: z.string().optional(),
  retrieved_at: z.string().optional(),
});

export const MacroSchema = z.object({
  headline: z.string().optional(),
  base: z.string().optional(),
  bull: z.string().optional(),
  bear: z.string().optional(),
  regime: z.string().optional(),
});

export const PortfolioRiskSchema = z.object({
  currency: z.string().optional(),
  ann_return: z.number().optional(),
  ann_vol: z.number().optional(),
  var95: z.number().optional(),
  cvar95: z.number().optional(),
  var99: z.number().optional(),
  cvar99: z.number().optional(),
  observations: z.number().optional(),
  mc_percentiles: z
    .object({
      p5: z.number().optional(),
      p25: z.number().optional(),
      p50: z.number().optional(),
      p75: z.number().optional(),
      p95: z.number().optional(),
    })
    .optional(),
  scenarios: z
    .array(z.object({
      name: z.string(),
      pl_pct: z.number(),
      pl_amount: z.number().optional(),
    }))
    .optional(),
});

export const CorrelationDriversSchema = z.object({
  diversifying: z.array(z.object({ a: z.string(), b: z.string(), v: z.number() })).optional(),
  concentrating: z.array(z.object({ a: z.string(), b: z.string(), v: z.number() })).optional(),
  /**
   * Correlation sensitivity narrative: how scenario assumptions (risk profile,
   * macro regime) reshape pairwise correlations and diversification benefit.
   */
  sensitivity: z
    .object({
      paragraphs: z.array(z.string()).optional(),
      regime_deltas: z
        .array(z.object({ regime: z.string(), note: z.string() }))
        .optional(),
    })
    .optional(),
});

export const AssumptionsSchema = z.object({
  bullets: z.array(z.string()).optional(),
  data_gaps: z.array(z.string()).optional(),
  models: z.array(z.string()).optional(),
});

/** ---------- root contract ---------- */
export const MemoInputSchema = z.object({
  memo_type: z.enum(["portfolio", "strategy"]),
  meta: MemoMetaSchema,
  cover: CoverSchema.optional(),
  summary: SummarySchema.optional(),
  holdings: z.array(HoldingSchema).optional(),
  allocation: z
    .array(z.object({ sleeve: z.string(), weight: z.number() }))
    .optional(),
  geography_lookthrough: z.array(GeoSchema).optional(),
  sectors_gics: z.array(SectorSchema).optional(),
  diversification: DiversificationSchema.optional(),
  macro_stress: z.array(MacroStressSchema).optional(),
  correlation: CorrelationSchema.optional(),
  correlation_drivers: CorrelationDriversSchema.optional(),
  macro: MacroSchema.optional(),
  portfolio_risk: PortfolioRiskSchema.optional(),
  assumptions: AssumptionsSchema.optional(),
  references: ReferenceSchema.array().optional(),
  implementation: z.array(ImplementationSchema).optional(),
  instruments: z.array(InstrumentSchema).optional(),
  rebalance_triggers: z.array(z.string()).optional(),
  methodology: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  disclosures: z.string().optional(),
  parent_id: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
});

export type MemoInput = z.infer<typeof MemoInputSchema>;
export type Holding = z.infer<typeof HoldingSchema>;
export type Instrument = z.infer<typeof InstrumentSchema>;
export type Correlation = z.infer<typeof CorrelationSchema>;
export type Diversification = z.infer<typeof DiversificationSchema>;
export type MemoReference = z.infer<typeof ReferenceSchema>;
export type MemoMacro = z.infer<typeof MacroSchema>;
export type MemoPortfolioRisk = z.infer<typeof PortfolioRiskSchema>;
export type MemoAssumptions = z.infer<typeof AssumptionsSchema>;