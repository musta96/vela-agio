/**
 * VaR / CVaR breakdowns grouped by asset class, plus a scenario × asset-class
 * pivot that powers the new breakdown tables on /risk and /goals and the
 * matching PDF sections.
 *
 * Pure functions with no React or network dependencies so they can be reused
 * from the PDF generator and unit-tested with deterministic fixtures.
 */

import { valueAtRisk, expectedShortfall, returns as toReturns } from "@/lib/riskMetrics";
import { getInstrumentMeta, type InstrumentMeta } from "@/lib/instrumentMeta";
import { applyMacroScenario, type MacroScenario } from "@/lib/quantScenarios";

/** Minimal position shape consumed by the breakdown helpers. */
export interface BreakdownPosition {
  symbol: string;
  name?: string;
  value: number;
  /** Daily close prices, oldest → newest. Optional: when absent the asset
   *  contributes to scenario rows but is skipped in the historical VaR row. */
  closes?: number[];
  meta?: InstrumentMeta;
}

export interface ClassVarCvar {
  assetClass: string;
  value: number;
  weight: number;
  /** Map of `confidence` (e.g. 0.95) → loss fraction (positive number). */
  varByConf: Record<number, number>;
  cvarByConf: Record<number, number>;
  observations: number;
}

/**
 * Aggregates positions into class-level synthetic series (value-weighted
 * daily returns), then runs historical VaR/CVaR at every requested
 * confidence level. Returns the per-class breakdown plus a portfolio total.
 */
export function varCvarByAssetClass(
  positions: BreakdownPosition[],
  confidences: number[] = [0.95, 0.99],
): { byClass: ClassVarCvar[]; portfolio: ClassVarCvar } {
  const total = positions.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  const enriched = positions.map((p) => ({
    ...p,
    meta: p.meta ?? getInstrumentMeta(p.symbol),
    rets: p.closes && p.closes.length > 1 ? toReturns(p.closes) : [],
  }));

  // Group by asset class.
  const groups = new Map<string, typeof enriched>();
  for (const p of enriched) {
    const cls = p.meta.assetClass;
    const arr = groups.get(cls) ?? [];
    arr.push(p);
    groups.set(cls, arr);
  }

  const byClass: ClassVarCvar[] = [];
  for (const [assetClass, items] of groups.entries()) {
    const classValue = items.reduce((s, p) => s + Math.max(0, p.value), 0);
    if (classValue <= 0) continue;
    // Build a value-weighted return series aligned to the shortest sample.
    const eligible = items.filter((p) => p.rets.length > 0);
    const T = eligible.length ? Math.min(...eligible.map((p) => p.rets.length)) : 0;
    const combined: number[] = [];
    for (let t = 0; t < T; t++) {
      let r = 0;
      for (const p of eligible) {
        const w = Math.max(0, p.value) / classValue;
        r += w * p.rets[p.rets.length - T + t];
      }
      combined.push(r);
    }
    const varByConf: Record<number, number> = {};
    const cvarByConf: Record<number, number> = {};
    for (const c of confidences) {
      varByConf[c] = combined.length ? valueAtRisk(combined, c) : 0;
      cvarByConf[c] = combined.length ? expectedShortfall(combined, c) : 0;
    }
    byClass.push({
      assetClass,
      value: classValue,
      weight: classValue / total,
      varByConf,
      cvarByConf,
      observations: combined.length,
    });
  }

  // Portfolio aggregate = value-weighted across every position with bars.
  const port = enriched.filter((p) => p.rets.length > 0);
  const Tport = port.length ? Math.min(...port.map((p) => p.rets.length)) : 0;
  const combined: number[] = [];
  for (let t = 0; t < Tport; t++) {
    let r = 0;
    for (const p of port) {
      const w = Math.max(0, p.value) / total;
      r += w * p.rets[p.rets.length - Tport + t];
    }
    combined.push(r);
  }
  const pVar: Record<number, number> = {};
  const pCvar: Record<number, number> = {};
  for (const c of confidences) {
    pVar[c] = combined.length ? valueAtRisk(combined, c) : 0;
    pCvar[c] = combined.length ? expectedShortfall(combined, c) : 0;
  }
  const portfolio: ClassVarCvar = {
    assetClass: "Portfolio",
    value: total,
    weight: 1,
    varByConf: pVar,
    cvarByConf: pCvar,
    observations: combined.length,
  };

  byClass.sort((a, b) => b.value - a.value);
  return { byClass, portfolio };
}

export interface ScenarioByClassCell {
  scenarioId: string;
  scenarioName: string;
  pnl: number;
  pnlPct: number;
}

export interface ScenarioByClassRow {
  assetClass: string;
  value: number;
  cells: ScenarioByClassCell[];
  /** Worst-case scenario P/L % across the row. */
  worst: ScenarioByClassCell | null;
}

/**
 * Pivot table: rows = asset class, columns = scenarios. Each cell holds the
 * % and absolute P&L the asset-class bucket would experience under that
 * scenario. The final row, "Portfolio", aggregates across all classes.
 */
export function scenarioByAssetClassMatrix(
  positions: BreakdownPosition[],
  scenarios: MacroScenario[],
): { rows: ScenarioByClassRow[]; scenarios: MacroScenario[] } {
  if (!positions.length || !scenarios.length) return { rows: [], scenarios };
  const scenarioPositions = positions.map((p) => ({ symbol: p.symbol, name: p.name, value: p.value }));
  const impacts = scenarios.map((s) => ({ scenario: s, impact: applyMacroScenario(scenarioPositions, s) }));

  // Discover every asset class touched across all scenarios (byBucket lists
  // them once per scenario but the set is stable).
  const classSet = new Set<string>();
  for (const { impact } of impacts) for (const b of impact.byBucket) classSet.add(b.bucket);

  const totalValue = positions.reduce((s, p) => s + p.value, 0) || 1;

  const rows: ScenarioByClassRow[] = Array.from(classSet).map((assetClass) => {
    let value = 0;
    const cells: ScenarioByClassCell[] = impacts.map(({ scenario, impact }) => {
      const bucket = impact.byBucket.find((b) => b.bucket === assetClass);
      const pnl = bucket?.pnl ?? 0;
      const pnlPct = bucket?.pnlPct ?? 0;
      // Take value from the first scenario (constant across scenarios).
      if (value === 0 && bucket) {
        value = Math.max(0, bucket.pnl) / Math.max(1e-9, Math.abs(bucket.pnlPct || 1e-9));
      }
      return { scenarioId: scenario.id, scenarioName: scenario.name, pnl, pnlPct };
    });
    const worst = [...cells].sort((a, b) => a.pnlPct - b.pnlPct)[0] ?? null;
    return { assetClass, value, cells, worst };
  });

  // Portfolio aggregate row.
  const portfolioCells: ScenarioByClassCell[] = impacts.map(({ scenario, impact }) => ({
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    pnl: impact.pnl,
    pnlPct: impact.pnlPct,
  }));
  rows.push({
    assetClass: "Portfolio",
    value: totalValue,
    cells: portfolioCells,
    worst: [...portfolioCells].sort((a, b) => a.pnlPct - b.pnlPct)[0] ?? null,
  });

  return { rows, scenarios };
}