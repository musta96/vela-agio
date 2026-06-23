import { sanitizeParagraphs, sanitizeProse } from "./sanitizeProse";
import type { MemoInput, Correlation } from "./schema";

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
  instrument: { metric?: { label: string; value: string; sign?: unknown } },
): { label: string; value: string } | null {
  const m = instrument.metric;
  if (!m || !m.value || m.value === "—" || !m.value.trim()) return null;
  return { label: m.label, value: m.value };
}