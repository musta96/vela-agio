/**
 * Vela memo PDF generator (self-contained Deno edge function).
 * Mirrors src/lib/memo/* so the function bundles without cross-folder imports.
 * Returns { pdf_base64 } when Browserless is configured, otherwise { html }.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
export const tokens = {
  color: {
    ink: "#0A0E14",
    navy: "#0B2447",
    navyDeep: "#0A1F3A",
    ocean: "#1E5B8C",
    steel: "#5A7896",
    muted: "#6B7280",
    line: "#D8DEE6",
    line2: "#EAEEF3",
    panel: "#F4F7FA",
    white: "#FFFFFF",
    positive: "#1A7D54",
    positiveBg: "#E6F4EC",
    negative: "#B4282A",
    negativeBg: "#FBEBEB",
    amber: "#B07A12",
    amberBg: "#FBF2DF",
    gold: "#A67C00",
    teal: "#0F6E56",
    coverTitle: "#FFFFFF",
    coverSub: "#B8C6D6",
    coverKicker: "#5DCAA5",
    coverAccent: "#7FB2D9",
    coverFoot: "#5A728F",
    corr: ["#E0EFE6", "#FBF2DF", "#FAE3C9", "#F3C9C4", "#E59A93"],
  },
  font: {
    sans: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    mono: "'IBM Plex Mono', 'SF Mono', Menlo, monospace",
    serif: "'Georgia', serif",
  },
  size: {
    coverTitle: 30,
    coverSub: 11,
    h1: 15,
    sec: 11,
    sub: 9,
    body: 8.7,
    small: 7.6,
    label: 6.6,
    th: 7.2,
    td: 7.8,
    tickerLg: 12,
  },
  leading: { body: 13.2, small: 10.5, tight: 9 },
  tracking: { label: 1.4 },
  space: { xs: 3, sm: 5, md: 8, lg: 10, xl: 14, section: 18 },
  page: {
    size: "A4",
    marginTop: 20,
    marginBottom: 18,
    marginLeft: 20,
    marginRight: 20,
    headerY: 13,
    footerY: 11,
  },
  table: {
    headerFill: "#0B2447",
    headerText: "#FFFFFF",
    rowAltFill: "#F4F7FA",
    rowSep: "#EAEEF3",
    outerBox: "#D8DEE6",
    cellPadX: 7,
    cellPadY: 4.5,
    accentRowAbove: "#1E5B8C",
  },
  rule: { hairline: 0.5, accent: 1.0, disclosureLeft: 2.5 },
  radius: { none: 0, sm: 3 },
  logo: {
    mainSail: "#1E5B8C",
    accentSail: "#0F6E56",
    hull: "#9CC3E0",
  },
} as const;
export function int(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value).toLocaleString("en-US");
}

export function pct(value: number | null | undefined, dp = 1): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(dp)}%`;
}

export function pctPlain(value: number | null | undefined, dp = 1): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${value.toFixed(dp)}%`;
}

export function money(
  value: number | null | undefined,
  ccy = "EUR",
  dp = 0,
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const body = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
  const sign = value < 0 ? "-" : "";
  return `${ccy} ${sign}${body}`;
}

/** Sentence case: first letter capitalised, rest preserved (acronyms intact). */
export function sentenceCase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

/** Escape for inclusion in HTML text nodes / attribute values. */
export function esc(input: string | number | null | undefined): string {
  if (input == null) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}/**

/**
 * Escape prose and turn `[N]` citation markers into `<sup>N</sup>`. N must
 * match a reference id present in `input.references`; unmatched markers are
 * still rendered as superscripts so proofing catches the mismatch visually.
 */
export function escWithCitations(input: string | null | undefined): string {
  if (input == null) return "";
  const escaped = esc(input);
  return escaped.replace(/\[(\d{1,2})\]/g, (_m, n) => `<sup class="cite">${n}</sup>`);
}

/**
 * Writing-style sanitizer enforcing the Vela memo prose rules:
 *  - no em dashes anywhere
 *  - no en dashes as sentence punctuation (preserved in numeric ranges)
 *  - banned words / banned constructions removed
 *  - no rhetorical-question section openers, no "X, Y, and Z" triad rhythm at top of paragraph
 *  - no hedging stacks ("may potentially possibly")
 */

const BANNED_WORDS: RegExp[] = [
  /\brobust\b/gi,
  /\bleverage(?:s|d|ing)?\b/gi, // verb usage of "leverage"; we strip all forms to be safe
  /\bnavigate(?:s|d|ing)?\b/gi,
  /\bin today'?s landscape\b/gi,
  /\bever[-\s]?evolving\b/gi,
  /\bfast[-\s]?paced\b/gi,
  /\bgame[-\s]?changer\b/gi,
  /\bdelve(?:s|d|ing)?\b/gi,
  /\bunlock(?:s|ed|ing)?\b/gi,
  /\bharness(?:es|ed|ing)?\b/gi,
  /\btapestry\b/gi,
  /\btestament\b/gi,
  /\bunderscore(?:s|d|ing)?\b/gi,
  /\bpivotal\b/gi,
  /\brealm\b/gi,
  /\blandscape\b/gi,
  /\bit'?s worth noting\b/gi,
  /\bit'?s important to note\b/gi,
  /\bwhen it comes to\b/gi,
];

const BANNED_CONSTRUCTIONS: RegExp[] = [
  /\bit'?s not just [^.]+,?\s*it'?s [^.]+\./gi,
  /\bmore than just [^.]+\./gi,
  /\bwhether you'?re [^.]+ or [^.]+\./gi,
];

const HEDGING_STACK = /\b(may|might|could)\s+(potentially|possibly|perhaps)\s+(possibly|potentially)?\b/gi;

/** Replace em-dashes and stray en-dash punctuation while keeping numeric ranges. */
export function stripDashes(text: string): string {
  let out = text;
  // em dash always banned
  out = out.replace(/\s*—\s*/g, ", ");
  // en dash between word chars → comma; en dash between digits stays (range)
  out = out.replace(/(\D)\s*–\s*(\D)/g, "$1, $2");
  out = out.replace(/\s+–\s+/g, ", ");
  return out;
}

/** Remove or rephrase banned words / constructions; leave the rest intact. */
export function stripBannedLanguage(text: string): string {
  let out = text;
  for (const re of BANNED_CONSTRUCTIONS) out = out.replace(re, "");
  for (const re of BANNED_WORDS) out = out.replace(re, "");
  out = out.replace(HEDGING_STACK, (_m, modal) => modal);
  // collapse double spaces / orphan punctuation left over
  out = out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1");
  return out;
}

/** Drop a leading rhetorical-question paragraph opener. */
export function dropRhetoricalOpener(text: string): string {
  return text.replace(/^\s*[A-Z][^.?!]{0,160}\?\s+/u, "");
}

/** Apply all sanitization rules in order. Safe on `undefined` / empty input. */
export function sanitizeProse(input: string | null | undefined): string {
  if (!input) return "";
  let out = String(input);
  out = stripDashes(out);
  out = stripBannedLanguage(out);
  out = dropRhetoricalOpener(out);
  return out.trim();
}

/** Same rules, applied paragraph-by-paragraph, preserving paragraph breaks. */
export function sanitizeParagraphs(paragraphs: readonly string[] | null | undefined): string[] {
  if (!paragraphs) return [];
  return paragraphs.map(sanitizeProse).filter((p) => p.length > 0);
}

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

/** ---------- references, macro, portfolio-risk, assumptions ---------- */
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
  references: z.array(ReferenceSchema).optional(),
  implementation: z.array(ImplementationSchema).optional(),
  instruments: z.array(InstrumentSchema).optional(),
  rebalance_triggers: z.array(z.string()).optional(),
  methodology: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  disclosures: z.string().optional(),
  // Optional persistence hints for the Documents library: when set, the new
  // memo row will be stored as a version-bumped child of `parent_id`.
  parent_id: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
});

export type MemoInput = z.infer<typeof MemoInputSchema>;
export type Holding = z.infer<typeof HoldingSchema>;
export type Instrument = z.infer<typeof InstrumentSchema>;
export type Correlation = z.infer<typeof CorrelationSchema>;
export type Diversification = z.infer<typeof DiversificationSchema>;

export interface FallbackResult {
  input: MemoInput;
  /** Sections that were intentionally omitted because the data was missing. */
  omitted: string[];
}

/**
 * Apply the data-integrity rules from the spec:
 *  - drop null/empty marquee cells
 *  - omit correlation if not return-based or not a full square
 *  - drop holdings without a real symbol
 *  - drop sector rows lacking a GICS sector
 *  - sanitize every prose field
 * Mutates a deep clone of the input; the original is left untouched.
 */
export function applyFallbacks(raw: MemoInput): FallbackResult {
  const out: MemoInput = JSON.parse(JSON.stringify(raw));
  const omitted: string[] = [];

  // ---- cover marquee: drop empty / null cells ----
  if (out.cover?.stats) {
    out.cover.stats = out.cover.stats.filter(
      (s) => s && s.value && s.value !== "—" && s.value.trim().length > 0,
    );
    if (out.cover.stats.length === 0) {
      delete out.cover.stats;
      omitted.push("cover.stats");
    }
  }

  // ---- summary prose ----
  if (out.summary) {
    if (out.summary.assessment_paragraphs) {
      out.summary.assessment_paragraphs = sanitizeParagraphs(out.summary.assessment_paragraphs);
      if (out.summary.assessment_paragraphs.length === 0) {
        delete out.summary.assessment_paragraphs;
      }
    }
    if (out.summary.philosophy_paragraphs) {
      out.summary.philosophy_paragraphs = sanitizeParagraphs(out.summary.philosophy_paragraphs);
      if (out.summary.philosophy_paragraphs.length === 0) {
        delete out.summary.philosophy_paragraphs;
      }
    }
    if (out.summary.key_metrics) {
      out.summary.key_metrics = out.summary.key_metrics.filter(
        (m) => m && m.value && m.value !== "—" && m.value.trim().length > 0,
      );
      if (out.summary.key_metrics.length === 0) delete out.summary.key_metrics;
    }
    if (out.summary.actions) {
      out.summary.actions = out.summary.actions
        .map((a) => ({
          ...a,
          action: sanitizeProse(a.action),
          rationale: a.rationale ? sanitizeProse(a.rationale) : undefined,
          impact: a.impact ? sanitizeProse(a.impact) : undefined,
        }))
        .filter((a) => a.action.length > 0);
      if (out.summary.actions.length === 0) delete out.summary.actions;
    }
  }

  // ---- holdings: require a symbol ----
  if (out.holdings) {
    out.holdings = out.holdings.filter((h) => h.symbol && h.symbol.trim().length > 0);
    if (out.holdings.length === 0) {
      delete out.holdings;
      omitted.push("holdings");
    }
  }

  // ---- geography (look-through only) ----
  if (out.geography_lookthrough) {
    out.geography_lookthrough = out.geography_lookthrough.filter(
      (g) => g.region && Number.isFinite(g.weight) && g.weight > 0,
    );
    if (out.geography_lookthrough.length === 0) {
      delete out.geography_lookthrough;
      omitted.push("geography_lookthrough");
    }
  }

  // ---- sectors (GICS only) ----
  if (out.sectors_gics) {
    out.sectors_gics = out.sectors_gics.filter(
      (s) => s.sector && Number.isFinite(s.weight) && s.weight > 0,
    );
    if (out.sectors_gics.length === 0) {
      delete out.sectors_gics;
      omitted.push("sectors_gics");
    }
  }

  // ---- correlation must be return-based, square, and complete ----
  if (out.correlation) {
    if (!isValidReturnCorrelation(out.correlation)) {
      delete out.correlation;
      omitted.push("correlation");
    }
  }

  // ---- macro stress ----
  if (out.macro_stress) {
    out.macro_stress = out.macro_stress.filter(
      (m) => m.scenario && Number.isFinite(m.pl_pct),
    );
    if (out.macro_stress.length === 0) {
      delete out.macro_stress;
      omitted.push("macro_stress");
    }
  }

  // ---- implementation ----
  if (out.implementation) {
    out.implementation = out.implementation.filter(
      (r) => r.sleeve && Number.isFinite(r.current) && Number.isFinite(r.target),
    );
    if (out.implementation.length === 0) {
      delete out.implementation;
      omitted.push("implementation");
    }
  }

  // ---- instruments: sanitize every prose field, drop empty risks ----
  if (out.instruments) {
    out.instruments = out.instruments
      .filter((i) => i.ticker && i.ticker.trim().length > 0)
      .map((i) => ({
        ...i,
        overview: i.overview ? sanitizeProse(i.overview) : undefined,
        rationale: i.rationale ? sanitizeProse(i.rationale) : undefined,
        suitability: i.suitability ? sanitizeProse(i.suitability) : undefined,
        diversification: i.diversification ? sanitizeProse(i.diversification) : undefined,
        risks: i.risks
          ?.map((r) => ({ name: r.name, desc: sanitizeProse(r.desc) }))
          .filter((r) => r.name && r.desc),
      }));
    if (out.instruments.length === 0) {
      delete out.instruments;
      omitted.push("instruments");
    }
  }

  // ---- methodology / sources / disclosures ----
  if (out.methodology) {
    out.methodology = sanitizeParagraphs(out.methodology);
    if (out.methodology.length === 0) delete out.methodology;
  }
  if (out.sources) {
    out.sources = out.sources.filter((s) => s && s.trim().length > 0);
    if (out.sources.length === 0) delete out.sources;
  }
  if (out.disclosures) {
    out.disclosures = sanitizeProse(out.disclosures);
    if (!out.disclosures) delete out.disclosures;
  }

  return { input: out, omitted };
}

function isValidReturnCorrelation(c: Correlation): boolean {
  if (!c.method.toLowerCase().startsWith("pearson")) return false;
  if (!Array.isArray(c.labels) || c.labels.length < 2) return false;
  const n = c.labels.length;
  if (!Array.isArray(c.matrix) || c.matrix.length !== n) return false;
  for (const row of c.matrix) {
    if (!Array.isArray(row) || row.length !== n) return false;
    for (const v of row) if (!Number.isFinite(v)) return false;
  }
  return true;
}

/**
 * Resolve a per-instrument metric for the marquee/header.
 * Priority: explicit metric → null. The engine is responsible for choosing a
 * sensible derived metric per instrument type; we never invent one.
 */
export function pickInstrumentMetric(
  instrument: { metric?: { label?: string; value?: string; sign?: unknown } },
): { label: string; value: string } | null {
  const m = instrument.metric;
  if (!m || !m.label || !m.value || m.value === "—" || !m.value.trim()) return null;
  return { label: m.label, value: m.value };
}
/**
 * HTML/CSS template for the Vela investment memo PDF.
 * All styling resolves through `tokens` — no literal hex / sizes in component HTML.
 * The template emits one self-contained HTML document suitable for Chromium print.
 */

/** Render the full HTML doc for a memo. Input must already be fallback-cleaned. */
export function renderMemoHtml(input: MemoInput): string {
  const body = input.memo_type === "portfolio" ? portfolioBody(input) : strategyBody(input);
  const toc = tableOfContents(input);
  const macro = macroSection(input);
  const risk = portfolioRiskSection(input);
  const corrDrivers = correlationDriversSection(input);
  const references = referencesSection(input);
  const assumptions = assumptionsSection(input);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(input.meta.title)}</title>
<style>${stylesheet()}</style>
</head>
<body>
${cover(input)}
<main class="doc">
${toc}
${macro}
${body}
${risk}
${corrDrivers}
${assumptions}
${methodologyAndDisclosures(input)}
${references}
</main>
${runningChrome(input)}
</body>
</html>`;
}

/* ============================== stylesheet ============================== */

function stylesheet(): string {
  const c = tokens.color;
  const s = tokens.size;
  const sp = tokens.space;
  const p = tokens.page;
  const t = tokens.table;
  return `
@page { size: ${p.size}; margin: ${p.marginTop}mm ${p.marginRight}mm ${p.marginBottom}mm ${p.marginLeft}mm; }
@page :first { margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; color: ${c.ink}; font-family: ${tokens.font.sans}; font-size: ${s.body}pt; line-height: ${tokens.leading.body}pt; }
.doc { padding: 0; }
h1.section { font-size: ${s.h1}pt; font-weight: 700; color: ${c.navy}; margin: ${sp.section}pt 0 ${sp.md}pt; letter-spacing: 0; }
h2.sub { font-size: ${s.sec}pt; font-weight: 700; color: ${c.navy}; margin: ${sp.lg}pt 0 ${sp.sm}pt; }
p { margin: 0 0 ${sp.sm}pt; }
.kicker { font-family: ${tokens.font.mono}; font-size: ${s.label}pt; letter-spacing: ${tokens.tracking.label}pt; text-transform: uppercase; color: ${c.ocean}; }

/* ---------- cover ---------- */
.cover { width: 210mm; height: 297mm; background: ${c.navy}; color: ${c.coverTitle}; padding: 24mm 20mm; display: flex; flex-direction: column; page-break-after: always; position: relative; }
.cover .logo { display: flex; align-items: center; gap: 8pt; }
.cover .wordmark { font-size: 14pt; font-weight: 700; letter-spacing: 0.4pt; color: ${c.coverTitle}; }
.cover .kicker-cover { color: ${c.coverKicker}; font-family: ${tokens.font.mono}; font-size: ${s.label}pt; letter-spacing: ${tokens.tracking.label}pt; text-transform: uppercase; margin-top: 28mm; }
.cover h1 { font-size: ${s.coverTitle}pt; line-height: 1.1; margin: ${sp.md}pt 0 ${sp.sm}pt; color: ${c.coverTitle}; font-weight: 700; }
.cover .sub { font-size: ${s.coverSub}pt; color: ${c.coverSub}; max-width: 140mm; }
.cover .spacer { flex: 1; }
.cover .marquee { background: ${c.navyDeep}; border-radius: ${tokens.radius.sm}pt; padding: 14pt 16pt; display: grid; gap: 16pt; }
.cover .marquee .cell .label { font-family: ${tokens.font.mono}; font-size: ${s.label}pt; letter-spacing: ${tokens.tracking.label}pt; text-transform: uppercase; color: ${c.coverSub}; }
.cover .marquee .cell .value { font-size: ${Math.round(s.coverTitle * 0.5)}pt; font-weight: 700; color: ${c.coverTitle}; margin-top: 4pt; }
.cover .marquee .cell .value.positive { color: ${c.positive}; }
.cover .marquee .cell .value.negative { color: ${c.negative}; }
.cover .marquee .cell .value.amber { color: ${c.amber}; }
.cover .foot { color: ${c.coverFoot}; font-size: ${s.small}pt; margin-top: 12pt; }

/* ---------- recommendation / mandate strip ---------- */
.strip { display: grid; gap: 0; border: ${tokens.rule.hairline}pt solid ${c.line}; border-radius: ${tokens.radius.sm}pt; background: ${c.panel}; }
.strip .cell { padding: ${sp.md}pt ${sp.lg}pt; border-right: ${tokens.rule.hairline}pt solid ${c.line}; }
.strip .cell:last-child { border-right: none; }
.strip .cell .label { font-family: ${tokens.font.mono}; font-size: ${s.label}pt; letter-spacing: ${tokens.tracking.label}pt; text-transform: uppercase; color: ${c.steel}; }
.strip .cell .value { font-size: ${s.sec}pt; font-weight: 700; color: ${c.navy}; margin-top: 3pt; }

/* ---------- data table ---------- */
table.data { width: 100%; border-collapse: collapse; border: ${tokens.rule.hairline}pt solid ${t.outerBox}; font-size: ${s.td}pt; }
table.data thead th { background: ${t.headerFill}; color: ${t.headerText}; text-align: left; font-size: ${s.th}pt; font-weight: 700; padding: ${t.cellPadY}pt ${t.cellPadX}pt; }
table.data thead th.num { text-align: right; }
table.data tbody td { padding: ${t.cellPadY}pt ${t.cellPadX}pt; border-top: ${tokens.rule.hairline}pt solid ${t.rowSep}; vertical-align: middle; }
table.data tbody tr:nth-child(even) td { background: ${t.rowAltFill}; }
table.data td.num { text-align: right; font-variant-numeric: tabular-nums; font-family: ${tokens.font.mono}; }
table.data td.pos { color: ${c.positive}; }
table.data td.neg { color: ${c.negative}; }

/* ---------- severity bar ---------- */
.bar { position: relative; height: 7pt; background: ${c.line2}; border-radius: 1pt; overflow: hidden; min-width: 60pt; }
.bar > span { display: block; height: 100%; background: ${c.negative}; }
.bar.amber > span { background: ${c.amber}; }

/* ---------- correlation matrix ---------- */
table.corr { width: 100%; border-collapse: collapse; font-size: ${s.td}pt; }
table.corr th, table.corr td { padding: ${t.cellPadY}pt ${t.cellPadX}pt; text-align: center; font-family: ${tokens.font.mono}; }
table.corr thead th { background: ${t.headerFill}; color: ${t.headerText}; font-size: ${s.th}pt; }
table.corr tbody th { background: ${t.headerFill}; color: ${t.headerText}; font-size: ${s.th}pt; text-align: left; }

/* ---------- per-instrument block ---------- */
.instr { break-inside: avoid; padding: ${sp.lg}pt 0; border-top: ${tokens.rule.accent}pt solid ${c.ocean}; margin-top: ${sp.lg}pt; }
.instr .head { display: flex; align-items: baseline; justify-content: space-between; gap: ${sp.md}pt; }
.instr .ticker { font-family: ${tokens.font.mono}; font-size: ${s.tickerLg}pt; font-weight: 700; color: ${c.navy}; }
.instr .name { font-size: ${s.body}pt; color: ${c.steel}; flex: 1; }
.instr .alloc { font-family: ${tokens.font.mono}; font-size: ${s.sec}pt; font-weight: 700; color: ${c.navy}; }
.instr .metric { font-family: ${tokens.font.mono}; font-size: ${s.small}pt; color: ${c.muted}; margin-top: 2pt; }
.instr h3 { font-size: ${s.sub}pt; font-weight: 700; color: ${c.ocean}; margin: ${sp.md}pt 0 ${sp.xs}pt; }

/* ---------- disclosure box ---------- */
.disclosure { background: ${c.panel}; border-left: ${tokens.rule.disclosureLeft}pt solid ${c.gold}; border-radius: 0; padding: ${sp.md}pt ${sp.lg}pt; font-size: ${s.small}pt; line-height: ${tokens.leading.small}pt; color: ${c.muted}; text-align: justify; }

/* ---------- running header/footer (paged-media) ---------- */
.running-header, .running-footer { position: fixed; left: 0; right: 0; padding: 0 ${p.marginLeft}mm; color: ${c.steel}; font-size: ${s.small}pt; }
.running-header { top: ${p.headerY}mm; display: flex; justify-content: space-between; align-items: center; border-bottom: ${tokens.rule.hairline}pt solid ${c.line}; padding-bottom: 4pt; }
.running-footer { bottom: ${p.footerY}mm; display: flex; justify-content: space-between; align-items: center; border-top: ${tokens.rule.hairline}pt solid ${c.line}; padding-top: 4pt; }
.running-header .right, .running-footer .right { color: ${c.muted}; }

/* keep-together helper */
.keep { break-inside: avoid; }
.page-break { break-after: page; }

/* citations + TOC + macro grid + KPI strip + references */
sup.cite { color: ${c.ocean}; font-family: ${tokens.font.mono}; font-size: ${s.label}pt; padding-left: 1pt; }
.toc { border: ${tokens.rule.hairline}pt solid ${c.line}; border-radius: ${tokens.radius.sm}pt; padding: ${sp.lg}pt ${sp.xl}pt; margin-top: ${sp.md}pt; }
.toc ol { margin: 0; padding-left: ${sp.xl}pt; color: ${c.ink}; }
.toc li { padding: 2pt 0; font-size: ${s.body}pt; }
.macro { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: ${sp.md}pt; margin-top: ${sp.md}pt; }
.macro .card { border: ${tokens.rule.hairline}pt solid ${c.line}; border-radius: ${tokens.radius.sm}pt; padding: ${sp.md}pt ${sp.lg}pt; }
.macro .card .label { font-family: ${tokens.font.mono}; font-size: ${s.label}pt; letter-spacing: ${tokens.tracking.label}pt; text-transform: uppercase; color: ${c.steel}; }
.macro .card.base .label { color: ${c.ocean}; }
.macro .card.bull .label { color: ${c.positive}; }
.macro .card.bear .label { color: ${c.negative}; }
.macro .card p { margin: ${sp.xs}pt 0 0; font-size: ${s.body}pt; }
.kpi { display: grid; gap: 0; border: ${tokens.rule.hairline}pt solid ${c.line}; border-radius: ${tokens.radius.sm}pt; background: ${c.panel}; }
.kpi .cell { padding: ${sp.sm}pt ${sp.md}pt; border-right: ${tokens.rule.hairline}pt solid ${c.line}; }
.kpi .cell:last-child { border-right: none; }
.kpi .cell .label { font-family: ${tokens.font.mono}; font-size: ${s.label}pt; letter-spacing: ${tokens.tracking.label}pt; text-transform: uppercase; color: ${c.steel}; }
.kpi .cell .value { font-size: ${s.sec}pt; font-weight: 700; color: ${c.navy}; margin-top: 2pt; font-family: ${tokens.font.mono}; }
.refs ol { padding-left: ${sp.xl}pt; margin: 0; }
.refs li { padding: 2pt 0; font-size: ${s.small}pt; color: ${c.muted}; }
.refs li a { color: ${c.ocean}; text-decoration: none; word-break: break-all; }
`;
}

/* ============================== cover ============================== */

function cover(input: MemoInput): string {
  const meta = input.meta;
  const cov = input.cover ?? {};
  const stats = cov.stats ?? [];
  const gridCols = Math.max(1, Math.min(4, stats.length));
  const cells = stats
    .map((s) => {
      const cls = s.sign ? ` ${s.sign}` : "";
      return `<div class="cell"><div class="label">${esc(s.label)}</div><div class="value${cls}">${esc(s.value)}</div></div>`;
    })
    .join("");
  const marquee = stats.length
    ? `<div class="marquee" style="grid-template-columns: repeat(${gridCols}, 1fr);">${cells}</div>`
    : "";
  const kicker = cov.kicker ? `<div class="kicker-cover">${esc(cov.kicker)}</div>` : "";
  return `
<section class="cover">
  <div class="logo">${sailMark()}<span class="wordmark">Vela</span></div>
  ${kicker}
  <h1>${esc(meta.title)}</h1>
  ${meta.subtitle ? `<div class="sub">${esc(meta.subtitle)}</div>` : ""}
  <div class="spacer"></div>
  ${marquee}
  <div class="foot">${meta.confidential === false ? "" : "Private &amp; Confidential. "}${meta.generated_at ? esc(formatDate(meta.generated_at)) : ""}</div>
</section>`;
}

function sailMark(): string {
  // simple inline SVG using logo tokens (no external assets in print)
  return `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
    <polygon points="2,18 11,2 11,18" fill="${tokens.logo.mainSail}"/>
    <polygon points="11,18 11,6 19,18" fill="${tokens.logo.accentSail}"/>
    <rect x="2" y="18" width="18" height="2" fill="${tokens.logo.hull}"/>
  </svg>`;
}

/* ============================== running chrome ============================== */

function runningChrome(input: MemoInput): string {
  const title = sanitizeProse(input.meta.title);
  const date = input.meta.generated_at ? formatDate(input.meta.generated_at) : "";
  return `
<div class="running-header"><span><strong>Vela</strong> · ${esc(title)}</span><span class="right">Private &amp; Confidential</span></div>
<div class="running-footer"><span>This document is for informational purposes only and is not investment advice.</span><span>${esc(date)}</span><span class="right"></span></div>`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ============================== portfolio body ============================== */

function portfolioBody(input: MemoInput): string {
  return [
    investmentCommitteeSummary(input),
    holdingsAndAttribution(input),
    riskSection(input),
    constructionSection(input),
  ]
    .filter(Boolean)
    .join("\n");
}

function investmentCommitteeSummary(input: MemoInput): string {
  const s = input.summary;
  if (!s) return "";
  const stripCells = [
    s.stance && { label: "Stance", value: s.stance },
    s.conviction && { label: "Conviction", value: s.conviction },
    s.risk_budget && { label: "Risk budget", value: s.risk_budget },
    s.horizon && { label: "Horizon", value: s.horizon },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const strip = stripCells.length
    ? `<div class="strip" style="grid-template-columns: repeat(${stripCells.length}, 1fr);">${stripCells
        .map((c) => `<div class="cell"><div class="label">${esc(c.label)}</div><div class="value">${esc(c.value)}</div></div>`)
        .join("")}</div>`
    : "";

  const paras = (s.assessment_paragraphs ?? [])
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");

  const km = s.key_metrics?.length
    ? `<table class="data"><thead><tr><th>Metric</th><th class="num">Value</th></tr></thead><tbody>${s.key_metrics
        .map(
          (m) =>
            `<tr><td>${esc(m.label)}</td><td class="num ${m.sign === "positive" ? "pos" : m.sign === "negative" ? "neg" : ""}">${esc(m.value)}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";

  const actions = s.actions?.length
    ? `<h2 class="sub">Prioritized actions</h2><table class="data"><thead><tr><th>#</th><th>Action</th><th>Rationale</th><th>Impact</th><th>Priority</th></tr></thead><tbody>${s.actions
        .map(
          (a, i) =>
            `<tr><td class="num">${a.n ?? i + 1}</td><td>${esc(a.action)}</td><td>${esc(a.rationale ?? "")}</td><td>${esc(a.impact ?? "")}</td><td>${esc(a.priority ?? "")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";

  if (!strip && !paras && !km && !actions) return "";

  return `<section><h1 class="section">Investment committee summary</h1>${strip}${paras}${km}${actions}</section>`;
}

function holdingsAndAttribution(input: MemoInput): string {
  const holdings = input.holdings ?? [];
  const geo = input.geography_lookthrough ?? [];
  const sectors = input.sectors_gics ?? [];
  if (!holdings.length && !geo.length && !sectors.length) return "";

  const ccy = input.meta.base_currency ?? "EUR";

  const hRows = holdings
    .map((h: Holding) => {
      const pl = h.pl ?? null;
      const plCls = pl == null ? "" : pl >= 0 ? "pos" : "neg";
      const plPctCls = h.pl_pct == null ? "" : h.pl_pct >= 0 ? "pos" : "neg";
      const contribCls = h.contribution == null ? "" : h.contribution >= 0 ? "pos" : "neg";
      return `<tr>
        <td><strong>${esc(h.symbol)}</strong>${h.name ? ` · ${esc(h.name)}` : ""}</td>
        <td class="num">${pctPlain(h.weight) ?? ""}</td>
        <td class="num">${money(h.value ?? null, ccy) ?? ""}</td>
        <td class="num">${money(h.cost ?? null, ccy) ?? ""}</td>
        <td class="num ${plCls}">${money(pl, ccy) ?? ""}</td>
        <td class="num ${plPctCls}">${pct(h.pl_pct ?? null) ?? ""}</td>
        <td class="num ${contribCls}">${pct(h.contribution ?? null) ?? ""}</td>
      </tr>`;
    })
    .join("");

  const hTable = hRows
    ? `<table class="data"><thead><tr>
        <th>Holding</th><th class="num">Weight</th><th class="num">Value</th><th class="num">Cost</th>
        <th class="num">P/L</th><th class="num">P/L %</th><th class="num">Contribution</th>
      </tr></thead><tbody>${hRows}</tbody></table>`
    : "";

  const geoTable = geo.length
    ? `<h2 class="sub">Look-through geographic exposure</h2><table class="data"><thead><tr><th>Region</th><th class="num">Weight</th></tr></thead><tbody>${geo
        .map((g) => `<tr><td>${esc(g.region)}</td><td class="num">${pctPlain(g.weight) ?? ""}</td></tr>`)
        .join("")}</tbody></table>`
    : "";

  const sectorCovered = sectors.reduce((acc, s) => acc + (s.weight || 0), 0);
  const sectorTable = sectors.length && sectorCovered >= 30
    ? `<h2 class="sub">GICS sector exposure</h2><table class="data"><thead><tr><th>Sector</th><th class="num">Weight</th></tr></thead><tbody>${sectors
        .map((s) => `<tr><td>${esc(s.sector)}</td><td class="num">${pctPlain(s.weight) ?? ""}</td></tr>`)
        .join("")}</tbody><tfoot><tr><td colspan="2" style="color:${tokens.color.muted};font-size:${tokens.size.small}pt;">Covered: ${pctPlain(sectorCovered) ?? ""} of NAV.</td></tr></tfoot></table>`
    : sectors.length
      ? `<p style="color:${tokens.color.muted};font-size:${tokens.size.small}pt;">Sector breakdown unavailable for the majority of holdings, chart omitted.</p>`
      : "";

  return `<section><h1 class="section">Holdings and attribution</h1>${hTable}${geoTable}${sectorTable}</section>`;
}

function riskSection(input: MemoInput): string {
  const div = input.diversification;
  const stress = input.macro_stress ?? [];
  if (!div && !stress.length) return "";

  const divBlock = div
    ? `<p><strong>${esc(sentenceCase(div.verdict))}.</strong></p><table class="data"><thead><tr><th>Lens</th><th class="num">HHI</th><th class="num">Effective N</th><th>Reading</th></tr></thead><tbody>${div.axes
        .map(
          (a) =>
            `<tr><td>${esc(a.lens)}</td><td class="num">${a.hhi.toFixed(2)}</td><td class="num">${a.effective_n != null ? a.effective_n.toFixed(1) : ""}</td><td>${esc(a.reading ?? "")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";

  const maxAbs = Math.max(1, ...stress.map((s) => Math.abs(s.pl_pct)));
  const stressBlock = stress.length
    ? `<h2 class="sub">Macro stress scenarios</h2><table class="data"><thead><tr><th>Scenario</th><th class="num">P/L %</th><th class="num">P/L</th><th>Severity</th></tr></thead><tbody>${stress
        .map((s) => {
          const w = Math.round((Math.abs(s.pl_pct) / maxAbs) * 100);
          const cls = Math.abs(s.pl_pct) > maxAbs * 0.66 ? "" : "amber";
          return `<tr>
            <td>${esc(s.scenario)}</td>
            <td class="num ${s.pl_pct >= 0 ? "pos" : "neg"}">${pct(s.pl_pct) ?? ""}</td>
            <td class="num">${money(s.pl_eur ?? null, input.meta.base_currency ?? "EUR") ?? ""}</td>
            <td><div class="bar ${cls}"><span style="width:${w}%"></span></div></td>
          </tr>`;
        })
        .join("")}</tbody></table>`
    : "";

  return `<section><h1 class="section">Risk</h1>${divBlock}${stressBlock}</section>`;
}

function constructionSection(input: MemoInput): string {
  const corr = input.correlation;
  const impl = input.implementation ?? [];
  const triggers = input.rebalance_triggers ?? [];
  if (!corr && !impl.length && !triggers.length) return "";

  const corrBlock = corr ? correlationMatrix(corr) : "";

  const implBlock = impl.length
    ? `<h2 class="sub">Implementation: target vs current</h2><table class="data"><thead><tr><th>Sleeve</th><th class="num">Current</th><th class="num">Target</th><th class="num">Change</th><th>Instrument</th></tr></thead><tbody>${impl
        .map(
          (r) =>
            `<tr><td>${esc(r.sleeve)}</td><td class="num">${pctPlain(r.current) ?? ""}</td><td class="num">${pctPlain(r.target) ?? ""}</td><td class="num ${r.change >= 0 ? "pos" : "neg"}">${pct(r.change) ?? ""}</td><td>${esc(r.instrument ?? "")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";

  const trigBlock = triggers.length
    ? `<h2 class="sub">Rebalance triggers</h2><ul>${triggers.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
    : "";

  return `<section><h1 class="section">Construction</h1>${corrBlock}${implBlock}${trigBlock}</section>`;
}

function correlationMatrix(c: Correlation): string {
  const ramp = tokens.color.corr;
  const cell = (v: number) => {
    const idx = Math.min(ramp.length - 1, Math.max(0, Math.floor(Math.abs(v) * ramp.length)));
    return `<td style="background:${ramp[idx]};">${v.toFixed(2)}</td>`;
  };
  return `<h2 class="sub">Return-based correlation (${esc(c.method)})</h2>
<table class="corr"><thead><tr><th></th>${c.labels.map((l) => `<th>${esc(l)}</th>`).join("")}</tr></thead>
<tbody>${c.matrix
    .map((row, i) => `<tr><th>${esc(c.labels[i])}</th>${row.map(cell).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

/* ============================== strategy body ============================== */

function strategyBody(input: MemoInput): string {
  return [strategySummary(input), instrumentDeepDives(input), implementationSteps(input)]
    .filter(Boolean)
    .join("\n");
}

function strategySummary(input: MemoInput): string {
  const s = input.summary;
  if (!s) return "";
  const stripCells = [
    s.mandate && { label: "Mandate", value: s.mandate },
    s.stance && { label: "Stance", value: s.stance },
    s.conviction && { label: "Conviction", value: s.conviction },
    s.horizon && { label: "Horizon", value: s.horizon },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const strip = stripCells.length
    ? `<div class="strip" style="grid-template-columns: repeat(${stripCells.length}, 1fr);">${stripCells
        .map((c) => `<div class="cell"><div class="label">${esc(c.label)}</div><div class="value">${esc(c.value)}</div></div>`)
        .join("")}</div>`
    : "";

  const paras = (s.philosophy_paragraphs ?? s.assessment_paragraphs ?? [])
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");

  const alloc = s.allocation_summary?.length
    ? `<h2 class="sub">Allocation</h2><table class="data"><thead><tr><th>Sleeve</th><th class="num">Weight</th><th>Instruments</th></tr></thead><tbody>${s.allocation_summary
        .map((a) => `<tr><td>${esc(a.sleeve)}</td><td class="num">${pctPlain(a.weight) ?? ""}</td><td>${esc(a.instruments ?? "")}</td></tr>`)
        .join("")}</tbody></table>`
    : "";

  const deploy = s.capital_deployment?.length
    ? `<h2 class="sub">Capital deployment</h2><table class="data"><tbody>${s.capital_deployment
        .map((d) => `<tr><td>${esc(d.label)}</td><td><div class="bar"><span style="width:${Math.min(100, Math.max(0, d.weight))}%"></span></div></td><td class="num">${pctPlain(d.weight) ?? ""}</td></tr>`)
        .join("")}</tbody></table>`
    : "";

  if (!strip && !paras && !alloc && !deploy) return "";
  return `<section><h1 class="section">Strategy summary</h1>${strip}${paras}${alloc}${deploy}</section>`;
}

function instrumentDeepDives(input: MemoInput): string {
  const list = input.instruments ?? [];
  if (!list.length) return "";
  return list
    .map((i, idx) => {
      const block = instrumentBlock(i);
      const brk = (idx + 1) % 3 === 0 && idx + 1 < list.length ? `<div class="page-break"></div>` : "";
      return block + brk;
    })
    .join("");
}

function instrumentBlock(i: Instrument): string {
  const metric = pickInstrumentMetric(i);
  const metricLine = metric ? `<div class="metric">${esc(metric.label)}: ${esc(metric.value)}</div>` : "";
  const tag = i.tag ? `<span class="kicker">${esc(i.tag)}</span> ` : "";

  const sections: string[] = [];
  if (i.overview) sections.push(`<h3>Overview</h3><p>${escWithCitations(i.overview)}</p>`);
  if (i.rationale) sections.push(`<h3>Investment rationale</h3><p>${escWithCitations(i.rationale)}</p>`);
  if (i.suitability) sections.push(`<h3>Suitability fit</h3><p>${escWithCitations(i.suitability)}</p>`);

  const riskRows = (i.risks ?? []).map(
    (r) => `<tr><td><strong>${esc(r.name)}</strong></td><td>${escWithCitations(r.desc)}</td></tr>`,
  );
  if (i.diversification) {
    riskRows.push(`<tr><td><strong>Diversification</strong></td><td>${escWithCitations(i.diversification)}</td></tr>`);
  }
  const riskTable = riskRows.length
    ? `<table class="data" style="margin-top:${tokens.space.sm}pt;"><thead><tr><th>Key risks</th><th>Notes</th></tr></thead><tbody>${riskRows.join("")}</tbody></table>`
    : "";

  return `<div class="instr">
    <div class="head">
      <span class="ticker">${esc(i.ticker)}</span>
      <span class="name">${tag}${esc(i.name ?? "")}</span>
      <span class="alloc">${esc(i.allocation ?? "")}</span>
    </div>
    ${metricLine}
    ${sections.join("")}
    ${riskTable}
  </div>`;
}

function implementationSteps(input: MemoInput): string {
  const impl = input.implementation ?? [];
  const triggers = input.rebalance_triggers ?? [];
  if (!impl.length && !triggers.length) return "";

  const steps = impl.length
    ? `<ol>${impl
        .map((r) => {
          const verb = r.change >= 0 ? "Add" : "Trim";
          return `<li><strong>${esc(verb)} ${pct(r.change) ?? ""}</strong> to ${esc(r.sleeve)}${r.instrument ? ` via ${esc(r.instrument)}` : ""}. Target ${pctPlain(r.target) ?? ""} (current ${pctPlain(r.current) ?? ""}).</li>`;
        })
        .join("")}</ol>`
    : "";

  const trig = triggers.length
    ? `<h2 class="sub">Portfolio-level risk note</h2><ul>${triggers.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
    : "";

  return `<section><h1 class="section">Implementation</h1>${steps}${trig}</section>`;
}

/* ============================== methodology, sources, disclosures ============================== */

function methodologyAndDisclosures(input: MemoInput): string {
  const m = input.methodology ?? [];
  const s = input.sources ?? [];
  const d = input.disclosures;
  if (!m.length && !s.length && !d) return "";

  const mBlock = m.length
    ? `<h2 class="sub">Methodology</h2><ul>${m.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`
    : "";
  const sBlock = s.length
    ? `<h2 class="sub">Sources</h2><ul>${s.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`
    : "";
  const dBlock = d ? `<div class="disclosure">${esc(d)}</div>` : "";

  return `<section><h1 class="section">Methodology, sources and disclosures</h1>${mBlock}${sBlock}${dBlock}</section>`;
}

/* ============================== new v2 sections ============================== */

function tableOfContents(input: MemoInput): string {
  const rows: string[] = [];
  if (input.summary) rows.push(input.memo_type === "portfolio" ? "Investment committee summary" : "Strategy summary");
  if (input.macro && (input.macro.base || input.macro.bull || input.macro.bear || input.macro.headline)) rows.push("Macro outlook (base, bull, bear)");
  if (input.allocation?.length || input.holdings?.length || input.summary?.allocation_summary?.length) rows.push("Allocation");
  if (input.correlation) rows.push("Cross-asset correlation");
  if (input.correlation_drivers && (input.correlation_drivers.diversifying?.length || input.correlation_drivers.concentrating?.length)) rows.push("Correlation key drivers");
  if (input.portfolio_risk) rows.push("Portfolio risk (VaR / CVaR / scenarios)");
  if (input.instruments?.length) rows.push(`Instrument deep-dives (${input.instruments.length})`);
  if (input.implementation?.length || input.rebalance_triggers?.length) rows.push("Implementation");
  if (input.assumptions && (input.assumptions.bullets?.length || input.assumptions.data_gaps?.length || input.assumptions.models?.length)) rows.push("Assumptions & data sources");
  if (input.methodology?.length || input.sources?.length || input.disclosures) rows.push("Methodology, sources and disclosures");
  if (input.references?.length) rows.push("References");
  if (rows.length < 3) return "";
  return `<section class="toc"><h2>Contents</h2><ol>${rows.map((r) => `<li>${esc(r)}</li>`).join("")}</ol></section>`;
}

function macroSection(input: MemoInput): string {
  const m = input.macro;
  if (!m) return "";
  const cards: string[] = [];
  if (m.base) cards.push(`<div class="card base"><div class="label">Base case</div><p>${escWithCitations(m.base)}</p></div>`);
  if (m.bull) cards.push(`<div class="card bull"><div class="label">Bull case</div><p>${escWithCitations(m.bull)}</p></div>`);
  if (m.bear) cards.push(`<div class="card bear"><div class="label">Bear case</div><p>${escWithCitations(m.bear)}</p></div>`);
  if (!cards.length && !m.headline && !m.regime) return "";
  const headline = m.headline ? `<p>${escWithCitations(m.headline)}</p>` : "";
  const regime = m.regime ? `<p><strong>Regime:</strong> ${escWithCitations(m.regime)}</p>` : "";
  return `<section><h1 class="section">Macro outlook</h1>${headline}${regime}${cards.length ? `<div class="macro">${cards.join("")}</div>` : ""}</section>`;
}

function portfolioRiskSection(input: MemoInput): string {
  const r = input.portfolio_risk;
  if (!r) return "";
  const cur = r.currency ?? input.meta.base_currency ?? "";
  const kpis: Array<{ label: string; value: string }> = [];
  const fmtPct = (v?: number, dp = 2) => (v == null || !Number.isFinite(v) ? null : `${(v * 100).toFixed(dp)}%`);
  if (r.ann_return != null) kpis.push({ label: "Ann. return", value: fmtPct(r.ann_return) ?? "" });
  if (r.ann_vol != null) kpis.push({ label: "Ann. vol", value: fmtPct(r.ann_vol) ?? "" });
  if (r.var95 != null) kpis.push({ label: "VaR 95%", value: fmtPct(r.var95) ?? "" });
  if (r.cvar95 != null) kpis.push({ label: "CVaR 95%", value: fmtPct(r.cvar95) ?? "" });
  if (r.var99 != null) kpis.push({ label: "VaR 99%", value: fmtPct(r.var99) ?? "" });
  if (r.cvar99 != null) kpis.push({ label: "CVaR 99%", value: fmtPct(r.cvar99) ?? "" });
  const kpiBlock = kpis.length
    ? `<div class="kpi" style="grid-template-columns: repeat(${kpis.length}, 1fr);">${kpis
        .map((k) => `<div class="cell"><div class="label">${esc(k.label)}</div><div class="value">${esc(k.value)}</div></div>`)
        .join("")}</div>`
    : "";

  const mc = r.mc_percentiles;
  const mcRows: Array<[string, number | undefined]> = [
    ["P5", mc?.p5], ["P25", mc?.p25], ["P50", mc?.p50], ["P75", mc?.p75], ["P95", mc?.p95],
  ];
  const mcBlock = mc && mcRows.some(([, v]) => v != null)
    ? `<h2 class="sub">Monte Carlo terminal value percentiles</h2><table class="data"><thead><tr>${mcRows.map(([lbl]) => `<th class="num">${esc(lbl)}</th>`).join("")}</tr></thead><tbody><tr>${mcRows
        .map(([, v]) => `<td class="num">${v == null ? "" : money(v, cur)}</td>`)
        .join("")}</tr></tbody></table>`
    : "";

  const sc = r.scenarios ?? [];
  const scBlock = sc.length
    ? `<h2 class="sub">Scenario outcomes</h2><table class="data"><thead><tr><th>Scenario</th><th class="num">P/L %</th><th class="num">P/L (${esc(cur)})</th></tr></thead><tbody>${sc
        .map((s) => `<tr><td>${esc(s.name)}</td><td class="num ${s.pl_pct >= 0 ? "pos" : "neg"}">${pct(s.pl_pct * 100) ?? ""}</td><td class="num">${s.pl_amount == null ? "" : money(s.pl_amount, cur)}</td></tr>`)
        .join("")}</tbody></table>`
    : "";

  return `<section><h1 class="section">Portfolio risk</h1>${kpiBlock}${mcBlock}${scBlock}</section>`;
}

function correlationDriversSection(input: MemoInput): string {
  const d = input.correlation_drivers;
  if (!d || (!d.diversifying?.length && !d.concentrating?.length)) return "";
  const rows = (pairs?: Array<{ a: string; b: string; v: number }>) =>
    (pairs ?? []).map((p) => `<tr><td>${esc(p.a)}</td><td>${esc(p.b)}</td><td class="num">${p.v.toFixed(2)}</td></tr>`).join("");
  const div = d.diversifying?.length
    ? `<h2 class="sub">Top diversifying pairs (lowest correlation)</h2><table class="data"><thead><tr><th>A</th><th>B</th><th class="num">ρ</th></tr></thead><tbody>${rows(d.diversifying)}</tbody></table>`
    : "";
  const con = d.concentrating?.length
    ? `<h2 class="sub">Most concentrating pairs (highest correlation)</h2><table class="data"><thead><tr><th>A</th><th>B</th><th class="num">ρ</th></tr></thead><tbody>${rows(d.concentrating)}</tbody></table>`
    : "";
  return `<section>${div}${con}</section>`;
}

function assumptionsSection(input: MemoInput): string {
  const a = input.assumptions;
  if (!a) return "";
  const bul = a.bullets?.length ? `<h2 class="sub">Assumptions</h2><ul>${a.bullets.map((x) => `<li>${escWithCitations(x)}</li>`).join("")}</ul>` : "";
  const mod = a.models?.length ? `<h2 class="sub">Models</h2><ul>${a.models.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  const gap = a.data_gaps?.length ? `<h2 class="sub">Data gaps</h2><ul>${a.data_gaps.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  if (!bul && !mod && !gap) return "";
  return `<section><h1 class="section">Assumptions &amp; data sources</h1>${bul}${mod}${gap}</section>`;
}

function referencesSection(input: MemoInput): string {
  const refs = input.references ?? [];
  if (!refs.length) return "";
  const sorted = [...refs].sort((a, b) => a.n - b.n);
  return `<section class="refs"><h1 class="section">References</h1><ol>${sorted
    .map((r) => {
      const link = r.url ? `<a href="${esc(r.url)}">${esc(r.url)}</a>` : "";
      const date = r.retrieved_at ? ` · retrieved ${esc(formatDate(r.retrieved_at))}` : "";
      return `<li value="${r.n}"><strong>[${r.n}]</strong> ${esc(r.label)}${link ? ` — ${link}` : ""}${date}</li>`;
    })
    .join("")}</ol></section>`;
}

/* =============================================================== */
/* HTTP entry                                                      */
/* =============================================================== */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return json({ error: "invalid_json" }, 400); }

  const parsed = MemoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "validation_failed", details: parsed.error.flatten() }, 400);
  }

  const { input, omitted } = applyFallbacks(parsed.data);
  const html = renderMemoHtml(input);

  const browserless = Deno.env.get("BROWSERLESS_URL");
  const browserlessKey = Deno.env.get("BROWSERLESS_API_KEY");
  let pdfBase64: string | undefined;
  let pdfBytes = 0;
  if (browserless && browserlessKey) {
    try {
      const r = await fetch(`${browserless}/pdf?token=${browserlessKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, options: { format: "A4", printBackground: true, preferCSSPageSize: true } }),
      });
      if (!r.ok) {
        console.error("[generate-memo-pdf] browserless", r.status, await r.text());
        return json({ html, omitted, warning: "pdf_render_failed_returning_html" }, 200);
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      pdfBytes = buf.length;
      let s = "";
      for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
      pdfBase64 = btoa(s);
    } catch (err) {
      console.error("[generate-memo-pdf] browserless exception", err);
      return json({ html, omitted, warning: "pdf_render_failed_returning_html" }, 200);
    }
  }

  // Persist to the "memos" library when the caller is an authenticated user
  // AND we successfully produced a PDF. Non-fatal on any error — we still
  // return the PDF so the client can download it.
  const persisted = pdfBase64
    ? await tryPersistMemo(req, input, pdfBase64, pdfBytes)
    : null;

  if (pdfBase64) {
    return json({
      pdf_base64: pdfBase64,
      omitted,
      memo_id: persisted?.memo_id,
      storage_path: persisted?.storage_path,
      version: persisted?.version,
      persisted: Boolean(persisted),
      persist_error: persisted === null ? undefined : persisted.error,
    }, 200);
  }
  return json({ html, omitted }, 200);
});

/**
 * Upload the rendered PDF to the private `memos` bucket and insert a manifest
 * row into `public.generated_memos`. Best-effort — any failure returns null
 * and the PDF still ships back to the client.
 */
async function tryPersistMemo(
  req: Request,
  input: MemoInput,
  pdfBase64: string,
  pdfBytes: number,
): Promise<{ memo_id: string; storage_path: string; version: number; error?: string } | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return null;

  try {
    const asUser = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes } = await asUser.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) return null;

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const memoId = crypto.randomUUID();
    // Sniff a parent_id from the incoming meta so incremental regens link to
    // the previous version. Same for the version counter.
    const parentId = (input as { parent_id?: string }).parent_id ?? null;
    const inheritedVersion = Number((input as { version?: number }).version ?? 0);
    const version = Number.isFinite(inheritedVersion) && inheritedVersion > 0
      ? Math.max(1, Math.floor(inheritedVersion))
      : 1;
    const storagePath = `${userId}/${memoId}_v${version}.pdf`;

    const pdfBytesArr = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
    const up = await admin.storage.from("memos").upload(storagePath, pdfBytesArr, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (up.error) {
      console.warn("[generate-memo-pdf] storage upload failed", up.error);
      return { memo_id: memoId, storage_path: storagePath, version, error: up.error.message };
    }

    const tickers = (input.instruments ?? []).map((i) => i.ticker);
    const fingerprints = (input.instruments ?? []).reduce<Record<string, string>>((acc, i) => {
      // Fingerprint the metric+risks payload as a cheap change-detection key.
      const key = JSON.stringify({ m: i.metric, r: i.risks?.map((x) => x.desc) });
      acc[i.ticker] = simpleHash(key);
      return acc;
    }, {});

    const { error: insertError } = await admin.from("generated_memos").insert({
      id: memoId,
      user_id: userId,
      title: input.meta.title,
      base_currency: input.meta.base_currency ?? null,
      storage_path: storagePath,
      pdf_bytes: pdfBytes,
      tickers,
      fingerprints,
      input_snapshot: input as unknown as Record<string, unknown>,
      parent_id: parentId,
      version,
    });
    if (insertError) {
      console.warn("[generate-memo-pdf] manifest insert failed", insertError.message);
      return { memo_id: memoId, storage_path: storagePath, version, error: insertError.message };
    }

    return { memo_id: memoId, storage_path: storagePath, version };
  } catch (err) {
    console.warn("[generate-memo-pdf] persist exception", err);
    return null;
  }
}

/** Fast non-cryptographic fingerprint (djb2). Good enough to detect drift. */
function simpleHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
