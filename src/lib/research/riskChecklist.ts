export type RiskSeverity = "high" | "medium" | "low";
export type RiskCategory =
  | "market" | "operational" | "regulatory" | "financial" | "strategic" | "macro" | "legal" | "other";

export interface RawRisk {
  category?: string;
  title?: string;
  detail?: string;
  severity?: string;
  citation?: { quote?: string; section?: string } | null;
}

export interface ClassifiedRisk {
  id: string;
  title: string;
  detail: string;
  category: RiskCategory;
  severity: RiskSeverity;
  severityInferred: boolean;
  citation: { quote?: string; section?: string } | null;
  cited: boolean;
  section: string;
}

const CATEGORIES: RiskCategory[] = ["market", "operational", "regulatory", "financial", "strategic", "macro", "legal", "other"];

export const SEVERITY_RANK: Record<RiskSeverity, number> = { high: 3, medium: 2, low: 1 };

const HIGH_HINTS = /\b(material weakness|going concern|default|litigation|investigation|breach|impairment|covenant|delist|fraud|recall|sanction)\b/i;
const LOW_HINTS = /\b(may|could|from time to time|generally|routine|immaterial)\b/i;

/** Infer a severity when the model omitted it, using wording of title + detail. */
export function inferSeverity(text: string): RiskSeverity {
  if (HIGH_HINTS.test(text)) return "high";
  if (LOW_HINTS.test(text)) return "low";
  return "medium";
}

function normCategory(raw?: string): RiskCategory {
  const c = (raw ?? "").trim().toLowerCase();
  return (CATEGORIES as string[]).includes(c) ? (c as RiskCategory) : "other";
}

function normSeverity(raw?: string): RiskSeverity | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "high" || s === "alta") return "high";
  if (s === "medium" || s === "media" || s === "moderate") return "medium";
  if (s === "low" || s === "bassa" || s === "minor") return "low";
  return null;
}

/** Normalize, classify and sort risks extracted from a research note. */
export function classifyRisks(risks: RawRisk[] | undefined | null): ClassifiedRisk[] {
  const list = Array.isArray(risks) ? risks : [];
  return list
    .filter((r) => (r?.title ?? "").trim() || (r?.detail ?? "").trim())
    .map((r, i) => {
      const title = (r.title ?? "").trim() || `Risk ${i + 1}`;
      const detail = (r.detail ?? "").trim();
      const explicit = normSeverity(r.severity);
      const quote = r.citation?.quote?.trim() || undefined;
      const section = r.citation?.section?.trim() || "";
      return {
        id: `${i}-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 48)}`,
        title,
        detail,
        category: normCategory(r.category),
        severity: explicit ?? inferSeverity(`${title} ${detail}`),
        severityInferred: !explicit,
        citation: quote || section ? { quote, section: section || undefined } : null,
        cited: Boolean(quote),
        section: section || "Source document",
      };
    })
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.title.localeCompare(b.title));
}

export interface RiskSummary {
  total: number;
  high: number;
  medium: number;
  low: number;
  cited: number;
  citedShare: number;
  byCategory: { category: RiskCategory; count: number }[];
}

export function summarizeRisks(risks: ClassifiedRisk[]): RiskSummary {
  const byCat = new Map<RiskCategory, number>();
  let high = 0, medium = 0, low = 0, cited = 0;
  for (const r of risks) {
    byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
    if (r.severity === "high") high++;
    else if (r.severity === "medium") medium++;
    else low++;
    if (r.cited) cited++;
  }
  return {
    total: risks.length,
    high, medium, low, cited,
    citedShare: risks.length ? cited / risks.length : 0,
    byCategory: Array.from(byCat.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
  };
}

const CHECK_KEY = "vela.risk-checklist";

type CheckStore = Record<string, string[]>;

function readStore(): CheckStore {
  try {
    const raw = localStorage.getItem(CHECK_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readChecked(noteKey: string): Set<string> {
  return new Set(readStore()[noteKey] ?? []);
}

export function writeChecked(noteKey: string, checked: Set<string>) {
  try {
    const store = readStore();
    store[noteKey] = Array.from(checked);
    localStorage.setItem(CHECK_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable — checklist stays in-memory for this session */
  }
}
