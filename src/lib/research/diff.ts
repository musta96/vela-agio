import { classifyRisks, type ClassifiedRisk, type RiskSeverity, SEVERITY_RANK } from "./riskChecklist";

export type DiffOp = "same" | "added" | "removed";
export interface DiffToken { op: DiffOp; text: string }

function tokenize(s: string): string[] {
  return (s ?? "").trim().split(/(\s+)/).filter((t) => t.length > 0);
}

/**
 * Word-level diff (LCS). Deterministic and bounded: for very long inputs we fall
 * back to a paragraph-level comparison to keep the O(n*m) table small.
 */
export function diffWords(before: string, after: string): DiffToken[] {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length * b.length > 400_000) {
    if (before.trim() === after.trim()) return [{ op: "same", text: before }];
    return [
      ...(before.trim() ? [{ op: "removed" as const, text: before.trim() }] : []),
      ...(after.trim() ? [{ op: "added" as const, text: after.trim() }] : []),
    ];
  }
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffToken[] = [];
  const push = (op: DiffOp, text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push("same", a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("removed", a[i]); i++; }
    else { push("added", b[j]); j++; }
  }
  while (i < n) { push("removed", a[i]); i++; }
  while (j < m) { push("added", b[j]); j++; }
  return out;
}

export interface RiskDelta {
  added: ClassifiedRisk[];
  removed: ClassifiedRisk[];
  escalated: { risk: ClassifiedRisk; from: RiskSeverity; to: RiskSeverity }[];
  deescalated: { risk: ClassifiedRisk; from: RiskSeverity; to: RiskSeverity }[];
  unchanged: number;
}

const riskKey = (r: ClassifiedRisk) => r.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function diffRisks(beforeReport: any, afterReport: any): RiskDelta {
  const before = classifyRisks(beforeReport?.risks);
  const after = classifyRisks(afterReport?.risks);
  const beforeMap = new Map(before.map((r) => [riskKey(r), r]));
  const afterMap = new Map(after.map((r) => [riskKey(r), r]));
  const delta: RiskDelta = { added: [], removed: [], escalated: [], deescalated: [], unchanged: 0 };
  for (const [k, r] of afterMap) {
    const prev = beforeMap.get(k);
    if (!prev) { delta.added.push(r); continue; }
    const d = SEVERITY_RANK[r.severity] - SEVERITY_RANK[prev.severity];
    if (d > 0) delta.escalated.push({ risk: r, from: prev.severity, to: r.severity });
    else if (d < 0) delta.deescalated.push({ risk: r, from: prev.severity, to: r.severity });
    else delta.unchanged++;
  }
  for (const [k, r] of beforeMap) if (!afterMap.has(k)) delta.removed.push(r);
  return delta;
}

export interface NarrativeDiff { field: string; label: string; before: string; after: string; changed: boolean }

const NARRATIVE_FIELDS: { field: string; label: string; get: (r: any) => string }[] = [
  { field: "executiveSummary", label: "Executive summary", get: (r) => r?.executiveSummary ?? "" },
  { field: "guidance", label: "Guidance", get: (r) => [r?.guidance?.direction, r?.guidance?.summary].filter(Boolean).join(" — ") },
  { field: "managementTone", label: "Management tone", get: (r) => [r?.managementTone?.sentiment, r?.managementTone?.commentary].filter(Boolean).join(" — ") },
  { field: "capitalAllocation", label: "Capital allocation", get: (r) => r?.capitalAllocation ?? "" },
  { field: "researchNote", label: "Research note", get: (r) => r?.researchNote ?? "" },
  { field: "recommendation", label: "Recommendation", get: (r) => [r?.recommendation?.stance, r?.recommendation?.rationale].filter(Boolean).join(" — ") },
];

export function narrativeDiffs(beforeReport: any, afterReport: any): NarrativeDiff[] {
  return NARRATIVE_FIELDS.map(({ field, label, get }) => {
    const before = get(beforeReport).trim();
    const after = get(afterReport).trim();
    return { field, label, before, after, changed: before !== after };
  }).filter((d) => d.before || d.after);
}
