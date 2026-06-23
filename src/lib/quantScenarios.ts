/**
 * Macro scenario engine.
 *
 * Goes beyond the simple "portfolio beta × market shock" approach in
 * portfolioRisk.ts by applying per-position sensitivities derived from
 * each instrument's asset class / sector / geography. Useful for
 * sophisticated investors who want to see *which* positions drive the
 * loss in a given macro regime — not just an aggregate P&L number.
 *
 * Pure-frontend, deterministic. No network, no side effects.
 */

import { getInstrumentMeta, type InstrumentMeta } from "./instrumentMeta";

export interface MacroShock {
  /** % change in global equity markets, e.g. -0.20 = −20%. */
  equity?: number;
  /** Parallel rates move in bps (positive = rates up). */
  ratesBps?: number;
  /** % change in credit spreads, mapped to HY/IG impact. */
  creditSpreadBps?: number;
  /** % change in oil / energy complex. */
  oil?: number;
  /** % change in gold. */
  gold?: number;
  /** % change in USD vs basket (positive = USD strength). */
  usd?: number;
  /** Vol regime multiplier (1.0 = base, 2.0 = VIX doubles). */
  volMult?: number;
}

export interface MacroScenario {
  id: string;
  name: string;
  description: string;
  shock: MacroShock;
}

/** Curated macro scenarios spanning the regimes most investors stress for. */
export const MACRO_SCENARIOS: MacroScenario[] = [
  {
    id: "gfc-2008",
    name: "Global Financial Crisis (2008)",
    description: "Equity −38%, credit blowout, flight to Treasuries, USD bid.",
    shock: { equity: -0.38, ratesBps: -150, creditSpreadBps: 450, oil: -0.55, usd: 0.12, gold: 0.05, volMult: 3.5 },
  },
  {
    id: "covid-2020",
    name: "COVID Crash (Q1 2020)",
    description: "Equity −34%, oil collapse, rates to zero, gold rally.",
    shock: { equity: -0.34, ratesBps: -150, creditSpreadBps: 350, oil: -0.65, gold: 0.08, usd: 0.06, volMult: 4.0 },
  },
  {
    id: "stagflation-1970s",
    name: "Stagflation Replay (1970s)",
    description: "Equity −20%, rates +300bps, oil +60%, gold +40%, weak USD.",
    shock: { equity: -0.20, ratesBps: 300, creditSpreadBps: 200, oil: 0.60, gold: 0.40, usd: -0.10, volMult: 2.0 },
  },
  {
    id: "hawkish-cb",
    name: "Hawkish Central Bank Surprise",
    description: "Equity −8%, rates +150bps, USD +5%, credit mildly wider.",
    shock: { equity: -0.08, ratesBps: 150, creditSpreadBps: 80, usd: 0.05, volMult: 1.5 },
  },
  {
    id: "tech-bubble",
    name: "Tech / AI Bubble Burst",
    description: "Tech −45%, broad equity −18%, rates −50bps, defensives flat.",
    shock: { equity: -0.18, ratesBps: -50, creditSpreadBps: 120, volMult: 2.2 },
  },
  {
    id: "china-hard-landing",
    name: "China Hard Landing",
    description: "EM equity −30%, commodities −25%, USD +8%, DM equity −10%.",
    shock: { equity: -0.10, oil: -0.25, usd: 0.08, creditSpreadBps: 150, gold: 0.03, volMult: 1.8 },
  },
  {
    id: "oil-supply-shock",
    name: "Oil Supply Shock",
    description: "Oil +50%, equity −7%, rates +50bps on inflation re-pricing.",
    shock: { equity: -0.07, oil: 0.50, ratesBps: 50, creditSpreadBps: 60, gold: 0.05, volMult: 1.4 },
  },
  {
    id: "deflation",
    name: "Deflationary Spiral",
    description: "Equity −22%, rates −200bps, credit wider, gold flat, USD up.",
    shock: { equity: -0.22, ratesBps: -200, creditSpreadBps: 300, oil: -0.30, usd: 0.07, volMult: 2.5 },
  },
  {
    id: "soft-landing",
    name: "Soft Landing / Goldilocks",
    description: "Equity +12%, rates −75bps, credit tightens, vol drops.",
    shock: { equity: 0.12, ratesBps: -75, creditSpreadBps: -50, volMult: 0.7 },
  },
];

/** Position with current value (in base currency) needed for the engine. */
export interface ScenarioPosition {
  symbol: string;
  name?: string;
  value: number;
}

export interface PositionImpact {
  symbol: string;
  name?: string;
  value: number;
  weight: number;
  shockPct: number; // expected % change in price under scenario
  pnl: number;     // currency P&L contribution
  meta: InstrumentMeta;
}

export interface ScenarioImpact {
  scenario: MacroScenario;
  pnl: number;
  pnlPct: number;
  byPosition: PositionImpact[];
  byBucket: { bucket: string; pnl: number; pnlPct: number }[];
}

/**
 * Estimate the % shock to a single instrument under a macro shock.
 * Uses asset class as the primary driver, then refines with sector/geo.
 * Returns a fraction (e.g. -0.18 for −18%).
 */
export function instrumentShock(meta: InstrumentMeta, s: MacroShock): number {
  const eq = s.equity ?? 0;
  const rates = (s.ratesBps ?? 0) / 10000; // as decimal
  const credit = (s.creditSpreadBps ?? 0) / 10000;
  const oil = s.oil ?? 0;
  const gold = s.gold ?? 0;
  const usd = s.usd ?? 0;

  switch (meta.assetClass) {
    case "Bond": {
      // Treasury duration proxies by sector label
      const duration = meta.sector === "Long Treasury" ? 17
        : meta.sector === "Short Treasury" ? 1.8
        : meta.sector === "Treasury" ? 7
        : meta.sector === "Aggregate" ? 6
        : meta.sector === "Investment Grade Credit" ? 8
        : meta.sector === "High Yield Credit" ? 4
        : 5;
      const rateImpact = -duration * rates;
      const creditImpact = meta.sector === "High Yield Credit" ? -credit * 4
        : meta.sector === "Investment Grade Credit" ? -credit * 1.5
        : 0;
      return rateImpact + creditImpact;
    }
    case "Commodity": {
      if (meta.sector === "Precious Metals") return gold * 1.0 + (-usd * 0.5);
      if (meta.sector === "Energy") return oil * 0.9;
      return oil * 0.4 + gold * 0.2;
    }
    case "Crypto": {
      // Crypto behaves like high-beta tech + flight-from-risk
      return eq * 1.8 + (s.volMult && s.volMult > 2 ? -0.15 : 0);
    }
    case "FX": {
      // FX pairs vs USD — approximation
      return -usd * 0.8;
    }
    case "REIT": {
      // Rate-sensitive equity
      return eq * 0.9 + (-rates * 6);
    }
    case "ETF":
    case "Equity":
    default: {
      // Sector betas
      const sectorBeta = sectorBetaFor(meta.sector);
      // Geography overlay — EM gets hit harder on USD/equity stress
      const geoMult = meta.geography === "Emerging Markets" || meta.geography === "China" ? 1.3
        : meta.geography === "Japan" ? 0.9
        : meta.geography === "US" ? 1.0
        : 1.0;
      const fxDrag = (meta.geography !== "US" && meta.geography !== "Global") ? -usd * 0.4 : 0;
      return eq * sectorBeta * geoMult + fxDrag + oil * energyTilt(meta.sector);
    }
  }
}

function sectorBetaFor(sector: string): number {
  // Empirically rough sector betas vs broad equity in stress regimes
  const map: Record<string, number> = {
    Technology: 1.35,
    Communication: 1.15,
    "Consumer Discretionary": 1.20,
    Financials: 1.30,
    Energy: 1.10,
    Healthcare: 0.75,
    "Consumer Staples": 0.55,
    Utilities: 0.60,
    "Real Estate": 0.95,
    Industrials: 1.10,
    Materials: 1.15,
    "Broad Market": 1.00,
    "Small Cap": 1.25,
  };
  return map[sector] ?? 1.0;
}

function energyTilt(sector: string): number {
  if (sector === "Energy") return 0.6;
  if (sector === "Industrials" || sector === "Materials") return 0.1;
  if (sector === "Consumer Discretionary" || sector === "Consumer Staples") return -0.05;
  return 0;
}

export function applyMacroScenario(
  positions: ScenarioPosition[],
  scenario: MacroScenario,
): ScenarioImpact {
  const total = positions.reduce((s, p) => s + p.value, 0);
  const byPosition: PositionImpact[] = positions.map((p) => {
    const meta = getInstrumentMeta(p.symbol);
    const shockPct = instrumentShock(meta, scenario.shock);
    const pnl = shockPct * p.value;
    return {
      symbol: p.symbol,
      name: p.name,
      value: p.value,
      weight: total > 0 ? p.value / total : 0,
      shockPct,
      pnl,
      meta,
    };
  });
  const pnl = byPosition.reduce((s, p) => s + p.pnl, 0);
  const pnlPct = total > 0 ? pnl / total : 0;

  // Aggregate by asset class bucket for the breakdown chart
  const buckets = new Map<string, { pnl: number; value: number }>();
  for (const p of byPosition) {
    const key = p.meta.assetClass;
    const cur = buckets.get(key) ?? { pnl: 0, value: 0 };
    cur.pnl += p.pnl;
    cur.value += p.value;
    buckets.set(key, cur);
  }
  const byBucket = Array.from(buckets.entries()).map(([bucket, v]) => ({
    bucket,
    pnl: v.pnl,
    pnlPct: v.value > 0 ? v.pnl / v.value : 0,
  })).sort((a, b) => a.pnl - b.pnl);

  return { scenario, pnl, pnlPct, byPosition, byBucket };
}

/** Build a histogram from a sample (used for Monte Carlo final-value charts). */
export function histogram(values: number[], bins = 24): { bin: number; count: number; low: number; high: number }[] {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ bin: min, count: values.length, low: min, high: max }];
  const width = (max - min) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({
    bin: min + (i + 0.5) * width,
    count: 0,
    low: min + i * width,
    high: min + (i + 1) * width,
  }));
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    out[idx].count += 1;
  }
  return out;
}

/** Quantile helper for histogram annotations. */
export function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[idx];
}