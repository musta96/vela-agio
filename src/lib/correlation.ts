/**
 * Historical-correlation analytics shared by the Optimizer, Rebalance
 * engine, and investment-memo generator.
 *
 * - `correlationMatrix(returns)` — Pearson correlation derived from the
 *   existing `covMatrix` so we never recompute the covariance twice when
 *   the optimizer already has it.
 * - `correlationStats(symbols, corr)` — pairwise summary + a
 *   "diversification score" (0–100). Higher = lower average correlation.
 * - `correlationBreakdowns(symbols, corr)` — average intra/inter
 *   correlation grouped by sector, geography, and asset class.
 * - `correlationMemoSection(...)` — short, structured prose chunk the
 *   memo generator can drop into a report verbatim.
 */

import { covMatrix, type Matrix } from "@/lib/optimizer";
import { getInstrumentMeta, type InstrumentMeta } from "@/lib/instrumentMeta";

// ---------------------------------------------------------------------------
// Request correlation IDs (shared with edge-function instrumentation).
// Kept in this module so the existing `@/lib/correlation` import path used by
// AIBriefing and other callers continues to resolve.
// ---------------------------------------------------------------------------

export const CORRELATION_HEADER = "x-correlation-id";

export function newCorrelationId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* fall through */ }
  return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export type CorrelationMatrix = Matrix;

/** Pearson correlation matrix derived from a `cov` (or aligned returns). */
export function correlationFromCov(cov: Matrix): CorrelationMatrix {
  const n = cov.length;
  const out: CorrelationMatrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const denom = Math.sqrt(Math.max(1e-12, cov[i][i] * cov[j][j]));
      out[i][j] = cov[i][j] / denom;
    }
  }
  return out;
}

export function correlationMatrix(returns: Matrix): CorrelationMatrix {
  if (!returns.length || !returns[0]?.length) return [];
  return correlationFromCov(covMatrix(returns));
}

export type PairStat = { a: string; b: string; rho: number };

export type CorrelationStats = {
  pairCount: number;
  avgPairwise: number;          // mean off-diagonal correlation
  maxPair: PairStat | null;
  minPair: PairStat | null;
  diversificationScore: number; // 0..100, higher = better diversified
};

export function correlationStats(symbols: string[], corr: CorrelationMatrix): CorrelationStats {
  const n = corr.length;
  const pairs: PairStat[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push({ a: symbols[i], b: symbols[j], rho: corr[i][j] });
    }
  }
  if (!pairs.length) {
    return { pairCount: 0, avgPairwise: 0, maxPair: null, minPair: null, diversificationScore: 0 };
  }
  const avg = pairs.reduce((s, p) => s + p.rho, 0) / pairs.length;
  // Map avg ∈ [-1, 1] to score ∈ [0, 100], higher when less correlated.
  const score = Math.max(0, Math.min(100, Math.round((1 - (avg + 1) / 2) * 100)));
  const sorted = [...pairs].sort((a, b) => a.rho - b.rho);
  return {
    pairCount: pairs.length,
    avgPairwise: avg,
    minPair: sorted[0],
    maxPair: sorted[sorted.length - 1],
    diversificationScore: score,
  };
}

export type GroupCorrelation = {
  group: string;
  members: string[];
  avgIntra: number | null; // mean correlation within the group (null when single member)
  avgInter: number | null; // mean correlation with everything outside the group
};

export type CorrelationBreakdowns = {
  bySector: GroupCorrelation[];
  byGeography: GroupCorrelation[];
  byAssetClass: GroupCorrelation[];
  meta: InstrumentMeta[];
};

function groupBy<K extends string>(
  metas: InstrumentMeta[],
  key: (m: InstrumentMeta) => K,
): Map<K, number[]> {
  const out = new Map<K, number[]>();
  metas.forEach((m, idx) => {
    const k = key(m);
    const arr = out.get(k) ?? [];
    arr.push(idx);
    out.set(k, arr);
  });
  return out;
}

function avgBlock(corr: CorrelationMatrix, rows: number[], cols: number[], excludeDiag: boolean): number | null {
  let sum = 0;
  let count = 0;
  for (const i of rows) {
    for (const j of cols) {
      if (excludeDiag && i === j) continue;
      sum += corr[i][j];
      count += 1;
    }
  }
  return count ? sum / count : null;
}

export function correlationBreakdowns(
  symbols: string[],
  corr: CorrelationMatrix,
): CorrelationBreakdowns {
  const meta = symbols.map(getInstrumentMeta);
  const all = meta.map((_, i) => i);

  const build = (groups: Map<string, number[]>): GroupCorrelation[] =>
    [...groups.entries()]
      .map(([group, idxs]) => {
        const others = all.filter((i) => !idxs.includes(i));
        return {
          group,
          members: idxs.map((i) => symbols[i]),
          avgIntra: idxs.length > 1 ? avgBlock(corr, idxs, idxs, true) : null,
          avgInter: others.length ? avgBlock(corr, idxs, others, false) : null,
        };
      })
      .sort((a, b) => b.members.length - a.members.length);

  return {
    bySector: build(groupBy(meta, (m) => m.sector)),
    byGeography: build(groupBy(meta, (m) => m.geography)),
    byAssetClass: build(groupBy(meta, (m) => m.assetClass)),
    meta,
  };
}

/** Compact prose summary suitable for the investment-memo generator. */
export function correlationMemoSection(
  symbols: string[],
  corr: CorrelationMatrix,
): string {
  if (!corr.length) return "";
  const stats = correlationStats(symbols, corr);
  const bd = correlationBreakdowns(symbols, corr);
  const fmt = (x: number) => x.toFixed(2);
  const lines: string[] = [];
  lines.push(
    `Average pairwise correlation across the ${symbols.length} proposed instruments is ${fmt(stats.avgPairwise)} ` +
      `(diversification score ${stats.diversificationScore}/100, ${stats.pairCount} pairs analysed).`,
  );
  if (stats.maxPair) {
    lines.push(
      `Most correlated pair: ${stats.maxPair.a} ↔ ${stats.maxPair.b} (${fmt(stats.maxPair.rho)}). ` +
        `Least correlated pair: ${stats.minPair!.a} ↔ ${stats.minPair!.b} (${fmt(stats.minPair!.rho)}).`,
    );
  }
  const heavy = bd.byAssetClass.filter((g) => g.members.length >= 2);
  if (heavy.length) {
    lines.push(
      "Asset-class concentration — " +
        heavy
          .map(
            (g) =>
              `${g.group} (${g.members.length}, intra ρ ${g.avgIntra !== null ? fmt(g.avgIntra) : "—"})`,
          )
          .join(", ") +
        ".",
    );
  }
  const geos = bd.byGeography.filter((g) => g.members.length >= 2);
  if (geos.length) {
    lines.push(
      "Geographic clustering — " +
        geos.map((g) => `${g.group} (${g.members.length})`).join(", ") +
        ".",
    );
  }
  return lines.join(" ");
}