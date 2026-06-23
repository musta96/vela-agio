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
  implementation: z.array(ImplementationSchema).optional(),
  instruments: z.array(InstrumentSchema).optional(),
  rebalance_triggers: z.array(z.string()).optional(),
  methodology: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  disclosures: z.string().optional(),
});

export type MemoInput = z.infer<typeof MemoInputSchema>;
export type Holding = z.infer<typeof HoldingSchema>;
export type Instrument = z.infer<typeof InstrumentSchema>;
export type Correlation = z.infer<typeof CorrelationSchema>;
export type Diversification = z.infer<typeof DiversificationSchema>;