/**
 * Portfolio Impact engine.
 *
 * Given a user's existing holdings (symbol + market value) and a proposed
 * allocation (symbol + weight or cash), returns a single integrated impact
 * report: combined weights, sector/geography overlap with duplication flags,
 * Herfindahl-based diversification score, and per-symbol rebalance actions.
 *
 * Pure and deterministic — no network, no state.
 */

import { getInstrumentMeta } from "@/lib/instrumentMeta";

export interface CurrentHolding {
  symbol: string;
  value: number; // current market value in base currency
}

export type ProposedInputMode = "weights" | "cash";

export interface ProposedLeg {
  symbol: string;
  amount: number; // weight fraction (0..1 or 0..100) or cash amount
}

export interface ImpactCombinedRow {
  symbol: string;
  currentPct: number;   // % of current NAV
  proposedPct: number;  // % of proposed capital
  combinedPct: number;  // % of NAV+deployed
  sector: string;
  geography: string;
  currentValue: number;
  proposedValue: number;
  action: "buy" | "sell" | "hold" | "reduce" | "add";
  deltaValue: number;   // + = buy more, − = sell
  duplicate: boolean;   // in both current and proposed
}

export interface OverlapCell {
  key: string;
  currentPct: number;
  proposedPct: number;
  combinedPct: number;
  deltaPct: number;
  duplication: number; // min(current, proposed) — how much overlap exists
}

export interface ImpactReport {
  base: {
    currency: string;
    currentNav: number;
    proposedCapital: number;
    combinedNav: number;
  };
  combined: ImpactCombinedRow[];
  sectorOverlap: OverlapCell[];
  geoOverlap: OverlapCell[];
  diversification: {
    currentHhi: number;
    proposedHhi: number;
    combinedHhi: number;
    currentScore: number;   // 0-100 (higher = more diversified)
    proposedScore: number;
    combinedScore: number;
    delta: number;          // combined - current
    verdict: "improves" | "neutral" | "worsens";
  };
  rebalanceSuggestions: Array<{
    symbol: string;
    action: "trim" | "keep" | "add" | "open" | "close";
    reason: string;
    fromPct: number;
    toPct: number;
  }>;
}

function normaliseWeights(legs: ProposedLeg[]): Record<string, number> {
  const cleaned = legs
    .map((l) => ({ symbol: l.symbol.trim().toUpperCase(), amount: Number(l.amount) }))
    .filter((l) => l.symbol && Number.isFinite(l.amount) && l.amount > 0);
  const total = cleaned.reduce((s, l) => s + l.amount, 0);
  const out: Record<string, number> = {};
  if (total <= 0) return out;
  for (const l of cleaned) out[l.symbol] = (out[l.symbol] ?? 0) + l.amount / total;
  return out;
}

function hhi(weights: number[]): number {
  // Herfindahl-Hirschman Index on weights in [0,1]. 1 = single holding, 1/N = perfectly equal.
  return weights.reduce((s, w) => s + w * w, 0);
}

/** Map HHI to a 0-100 diversification score. HHI=1 → 0, HHI≤0.05 → 100. */
function hhiToScore(h: number): number {
  const clamped = Math.max(0.05, Math.min(1, h));
  return Math.round(((1 - clamped) / (1 - 0.05)) * 100);
}

export interface ComputeImpactParams {
  currency?: string;
  proposedCapital?: number;      // total $ the user plans to deploy; defaults to current NAV
  proposedMode?: ProposedInputMode;
  current: CurrentHolding[];
  proposed: ProposedLeg[];
}

export function computeImpact(params: ComputeImpactParams): ImpactReport {
  const currency = params.currency ?? "USD";
  const currentClean = params.current
    .map((h) => ({ symbol: h.symbol.trim().toUpperCase(), value: Math.max(0, Number(h.value) || 0) }))
    .filter((h) => h.symbol && h.value > 0);
  const currentNav = currentClean.reduce((s, h) => s + h.value, 0);

  // Normalise proposed to weight fractions.
  let proposedWeights: Record<string, number>;
  if (params.proposedMode === "cash") {
    const total = params.proposed.reduce((s, l) => s + Math.max(0, Number(l.amount) || 0), 0);
    proposedWeights = total > 0
      ? Object.fromEntries(params.proposed.map((l) => [l.symbol.trim().toUpperCase(), Math.max(0, Number(l.amount) || 0) / total]))
      : {};
  } else {
    proposedWeights = normaliseWeights(params.proposed);
  }

  const proposedCapital = Math.max(0, Number(params.proposedCapital ?? currentNav) || 0);
  const combinedNav = currentNav + proposedCapital;

  const allSymbols = Array.from(new Set([
    ...currentClean.map((h) => h.symbol),
    ...Object.keys(proposedWeights),
  ]));

  const combined: ImpactCombinedRow[] = allSymbols.map((sym) => {
    const cur = currentClean.find((h) => h.symbol === sym);
    const currentValue = cur?.value ?? 0;
    const proposedValue = (proposedWeights[sym] ?? 0) * proposedCapital;
    const combinedValue = currentValue + proposedValue;
    const meta = getInstrumentMeta(sym);
    const currentPct = currentNav > 0 ? (currentValue / currentNav) * 100 : 0;
    const proposedPct = proposedCapital > 0 ? (proposedValue / proposedCapital) * 100 : 0;
    const combinedPct = combinedNav > 0 ? (combinedValue / combinedNav) * 100 : 0;
    const duplicate = currentValue > 0 && proposedValue > 0;
    let action: ImpactCombinedRow["action"] = "hold";
    if (currentValue === 0 && proposedValue > 0) action = "buy";
    else if (currentValue > 0 && proposedValue > 0) action = "add";
    else if (currentValue > 0 && proposedValue === 0) action = "hold";
    return {
      symbol: sym,
      currentPct, proposedPct, combinedPct,
      sector: meta.sector, geography: meta.geography,
      currentValue, proposedValue,
      action, deltaValue: proposedValue,
      duplicate,
    };
  }).sort((a, b) => b.combinedPct - a.combinedPct);

  // Group aggregations
  function groupOverlap(bucketOf: (row: ImpactCombinedRow) => string): OverlapCell[] {
    const keys = new Map<string, { cur: number; prop: number; comb: number }>();
    for (const row of combined) {
      const k = bucketOf(row);
      const cur = keys.get(k) ?? { cur: 0, prop: 0, comb: 0 };
      cur.cur += row.currentPct;
      cur.prop += row.proposedPct;
      cur.comb += row.combinedPct;
      keys.set(k, cur);
    }
    return Array.from(keys.entries())
      .map(([key, v]) => ({
        key,
        currentPct: +v.cur.toFixed(2),
        proposedPct: +v.prop.toFixed(2),
        combinedPct: +v.comb.toFixed(2),
        deltaPct: +(v.comb - v.cur).toFixed(2),
        duplication: +Math.min(v.cur, v.prop).toFixed(2),
      }))
      .sort((a, b) => b.combinedPct - a.combinedPct);
  }

  const sectorOverlap = groupOverlap((r) => r.sector);
  const geoOverlap = groupOverlap((r) => r.geography);

  const curWeights = currentClean.map((h) => h.value / (currentNav || 1));
  const propWeights = Object.values(proposedWeights);
  const combWeights = combined.map((r) => r.combinedPct / 100);
  const currentHhi = curWeights.length ? hhi(curWeights) : 1;
  const proposedHhi = propWeights.length ? hhi(propWeights) : 1;
  const combinedHhi = combWeights.length ? hhi(combWeights) : 1;
  const currentScore = hhiToScore(currentHhi);
  const proposedScore = hhiToScore(proposedHhi);
  const combinedScore = hhiToScore(combinedHhi);
  const delta = combinedScore - currentScore;
  const verdict: ImpactReport["diversification"]["verdict"] =
    delta >= 3 ? "improves" : delta <= -3 ? "worsens" : "neutral";

  const rebalanceSuggestions: ImpactReport["rebalanceSuggestions"] = [];
  const dupThresh = 4; // %: flag heavy duplication
  for (const row of combined) {
    if (row.currentPct === 0 && row.combinedPct > 0) {
      rebalanceSuggestions.push({
        symbol: row.symbol,
        action: "open",
        reason: `New position (${row.combinedPct.toFixed(1)}% of combined NAV).`,
        fromPct: 0, toPct: row.combinedPct,
      });
    } else if (row.duplicate && row.currentPct >= dupThresh && row.proposedPct >= dupThresh) {
      rebalanceSuggestions.push({
        symbol: row.symbol,
        action: "trim",
        reason: `Already ${row.currentPct.toFixed(1)}% of current NAV; adding ${row.proposedPct.toFixed(1)}% would concentrate to ${row.combinedPct.toFixed(1)}%. Consider trimming the existing position first.`,
        fromPct: row.currentPct, toPct: row.combinedPct,
      });
    } else if (row.currentPct > 0 && row.proposedPct === 0 && row.currentPct >= 10) {
      rebalanceSuggestions.push({
        symbol: row.symbol,
        action: "keep",
        reason: `Existing large position (${row.currentPct.toFixed(1)}%) is unchanged by the proposal — check if it still fits your thesis.`,
        fromPct: row.currentPct, toPct: row.combinedPct,
      });
    }
  }

  // Sector duplication flag
  for (const s of sectorOverlap) {
    if (s.duplication >= 15) {
      rebalanceSuggestions.push({
        symbol: `sector:${s.key}`,
        action: "trim",
        reason: `Heavy sector duplication in ${s.key}: current ${s.currentPct.toFixed(1)}% + proposed ${s.proposedPct.toFixed(1)}% → combined ${s.combinedPct.toFixed(1)}%.`,
        fromPct: s.currentPct, toPct: s.combinedPct,
      });
    }
  }

  return {
    base: { currency, currentNav, proposedCapital, combinedNav },
    combined,
    sectorOverlap,
    geoOverlap,
    diversification: {
      currentHhi: +currentHhi.toFixed(4),
      proposedHhi: +proposedHhi.toFixed(4),
      combinedHhi: +combinedHhi.toFixed(4),
      currentScore, proposedScore, combinedScore, delta, verdict,
    },
    rebalanceSuggestions,
  };
}