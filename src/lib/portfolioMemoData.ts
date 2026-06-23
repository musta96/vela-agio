import type { PortfolioMemoData } from "@/lib/generatePortfolioMemo";

/**
 * Versioned strategy thesis storage + memo data exports.
 *
 * Thesis versions are kept in localStorage so the same memo can be re-generated
 * later with the exact strategy_thesis (plus goals / risk profile / custom
 * sections) that produced the original PDF.
 */

const STORAGE_KEY = "vela.portfolio_memo.thesis_versions";

export interface ThesisVersion {
  id: string;
  name: string;
  savedAt: number;
  portfolioName?: string;
  strategyThesis: string;
  goals: string[];
  riskProfile: string;
  allocation: Record<string, number>;
  customSections?: {
    executiveSummary?: string;
    riskAssessment?: string;
    catalystsAndRisks?: string;
  };
}

export function listThesisVersions(): ThesisVersion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ThesisVersion[]) : [];
  } catch {
    return [];
  }
}

export function saveThesisVersion(v: Omit<ThesisVersion, "id" | "savedAt"> & { id?: string }): ThesisVersion {
  const now = Date.now();
  const version: ThesisVersion = {
    ...v,
    id: v.id ?? `thesis_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    savedAt: now,
  };
  const all = listThesisVersions().filter((x) => x.id !== version.id);
  const next = [version, ...all].slice(0, 50);
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  return version;
}

export function deleteThesisVersion(id: string): void {
  const next = listThesisVersions().filter((v) => v.id !== id);
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
}

// ---------- CSV export of memo data ----------

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

export interface MemoCsvFile {
  name: string;
  content: string;
}

export function memoDataToCsvFiles(data: PortfolioMemoData): MemoCsvFile[] {
  const stamp = new Date(data.meta.asOf).toISOString().slice(0, 10);
  const slug = (data.meta.portfolioName || "portfolio").replace(/[^a-zA-Z0-9_-]/g, "_");

  const allocationCsv = toCsv([
    ["symbol", "asset_class", "sector", "geography", "raw_weight", "normalised_weight"],
    ...data.allocation.map((r) => [
      r.symbol, r.assetClass, r.sector, r.geography,
      r.rawWeight.toFixed(6), r.normalisedWeight.toFixed(6),
    ]),
  ]);

  const corrCsv = toCsv([
    ["", ...data.correlation.symbols],
    ...data.correlation.symbols.map((s, i) => [
      s, ...data.correlation.matrix[i].map((v) => v.toFixed(4)),
    ]),
  ]);

  const pctCsv = toCsv([
    ["percentile", "terminal_value", "delta_vs_notional_pct"],
    ...(data.percentiles ?? []).map((p) => [
      `P${(p.p * 100).toFixed(0)}`, p.terminal.toFixed(2), (p.deltaPct * 100).toFixed(4),
    ]),
  ]);

  const scenariosCsv = toCsv([
    ["scenario", "pnl_pct", "pnl_currency"],
    ...data.scenarios.map((s) => [s.scenario, (s.pnlPct * 100).toFixed(4), s.pnl.toFixed(2)]),
  ]);

  const out: MemoCsvFile[] = [
    { name: `vela-memo-${slug}-${stamp}-allocation.csv`, content: allocationCsv },
    { name: `vela-memo-${slug}-${stamp}-correlation.csv`, content: corrCsv },
    { name: `vela-memo-${slug}-${stamp}-scenarios.csv`, content: scenariosCsv },
  ];
  if (data.percentiles?.length) {
    out.splice(2, 0, { name: `vela-memo-${slug}-${stamp}-percentiles.csv`, content: pctCsv });
  }
  return out;
}

export function downloadMemoCsvBundle(data: PortfolioMemoData): MemoCsvFile[] {
  const files = memoDataToCsvFiles(data);
  if (typeof document === "undefined") return files;
  for (const f of files) {
    const blob = new Blob([f.content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return files;
}