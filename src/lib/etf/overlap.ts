import type { ETFDef, Holding, SectorWeight } from "./holdings";

export type NormalizedHoldings = Record<string, number>; // ticker -> weight fraction (0..1)

// Convert an ETF's top holdings into a normalized fraction map. Any residual
// weight (100% - sum of top) is bucketed as "__OTHER__" so calculations still
// sum to 1.0 even when disclosures are truncated.
export function normalizeHoldings(etf: ETFDef): NormalizedHoldings {
  const out: NormalizedHoldings = {};
  let sum = 0;
  for (const h of etf.topHoldings) {
    const w = h.weight / 100;
    out[h.ticker] = (out[h.ticker] || 0) + w;
    sum += w;
  }
  const rest = Math.max(0, 1 - sum);
  if (rest > 1e-6) out["__OTHER__"] = rest;
  return out;
}

export type PairwiseOverlap = {
  a: string;
  b: string;
  // Sum over shared tickers of min(w_a, w_b). Range 0..1.
  weightOverlap: number;
  // |A ∩ B| / |A ∪ B| on the disclosed top-holdings tickers only.
  jaccardTop: number;
  // Count of shared tickers among disclosed top holdings.
  sharedCount: number;
  // Cosine similarity of weight vectors over the union of tickers.
  cosine: number;
};

export function pairwiseOverlap(a: ETFDef, b: ETFDef): PairwiseOverlap {
  const wa = normalizeHoldings(a);
  const wb = normalizeHoldings(b);
  const keys = new Set([...Object.keys(wa), ...Object.keys(wb)]);

  let weightOverlap = 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of keys) {
    const x = wa[k] || 0;
    const y = wb[k] || 0;
    if (k !== "__OTHER__") weightOverlap += Math.min(x, y);
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const cosine = na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;

  const topA = new Set(a.topHoldings.map((h) => h.ticker));
  const topB = new Set(b.topHoldings.map((h) => h.ticker));
  const inter = [...topA].filter((t) => topB.has(t));
  const union = new Set([...topA, ...topB]);
  const jaccardTop = union.size ? inter.length / union.size : 0;

  return {
    a: a.symbol,
    b: b.symbol,
    weightOverlap,
    jaccardTop,
    sharedCount: inter.length,
    cosine,
  };
}

export type SharedHolding = {
  ticker: string;
  name: string;
  weights: Record<string, number>; // symbol -> percent
  minWeight: number; // percent of NAV — pairwise-min across selected ETFs
  count: number; // number of ETFs it appears in
};

// Enumerate holdings shared across two or more of the selected ETFs.
export function sharedHoldings(etfs: ETFDef[]): SharedHolding[] {
  const map = new Map<string, SharedHolding>();
  for (const etf of etfs) {
    for (const h of etf.topHoldings) {
      const key = h.ticker;
      const existing = map.get(key);
      if (existing) {
        existing.weights[etf.symbol] = h.weight;
        existing.count += 1;
      } else {
        map.set(key, {
          ticker: h.ticker,
          name: h.name,
          weights: { [etf.symbol]: h.weight },
          minWeight: 0,
          count: 1,
        });
      }
    }
  }
  const shared = [...map.values()].filter((h) => h.count >= 2);
  for (const h of shared) {
    const vals = Object.values(h.weights);
    h.minWeight = Math.min(...vals);
  }
  return shared.sort((a, b) => b.minWeight - a.minWeight);
}

export type SectorAggregate = {
  sector: string;
  weights: Record<string, number>; // per ETF
  blended: number; // equally-weighted blend across selected ETFs
};

export function sectorMatrix(etfs: ETFDef[]): SectorAggregate[] {
  const map = new Map<string, SectorAggregate>();
  const n = etfs.length || 1;
  for (const etf of etfs) {
    for (const s of etf.sectors) {
      const key = s.sector;
      const rec = map.get(key) || { sector: key, weights: {}, blended: 0 };
      rec.weights[etf.symbol] = s.weight;
      map.set(key, rec);
    }
  }
  for (const rec of map.values()) {
    let sum = 0;
    for (const etf of etfs) sum += rec.weights[etf.symbol] || 0;
    rec.blended = sum / n;
  }
  return [...map.values()].sort((a, b) => b.blended - a.blended);
}

// Herfindahl-Hirschman Index on holding weights (0..1). Values near 0 indicate
// broad diversification; values near 1 indicate extreme concentration.
export function hhi(weightsPct: number[]): number {
  const sum = weightsPct.reduce((a, b) => a + b, 0) || 1;
  return weightsPct.reduce((acc, w) => acc + (w / sum) ** 2, 0);
}

// Effective number of holdings implied by HHI (1/HHI). Only informative for
// disclosed portion — small caps of a fund with 3000 names will look
// artificially concentrated because we only see the top 10-15.
export function effectiveN(weightsPct: number[]): number {
  const h = hhi(weightsPct);
  return h > 0 ? 1 / h : 0;
}

export type BlendedPortfolio = {
  holdings: Array<{ ticker: string; name: string; weight: number }>;
  sectors: SectorWeight[];
  hhi: number;
  effectiveN: number;
  disclosedCoverage: number; // fraction of blend that maps to disclosed names
};

// Build an equally-weighted blend of the selected ETFs. Weights are the
// arithmetic mean of each ETF's disclosed holding weight (0 if missing).
export function blendedPortfolio(etfs: ETFDef[], allocations?: number[]): BlendedPortfolio {
  const n = etfs.length;
  const alloc = (allocations && allocations.length === n)
    ? normalizeAlloc(allocations)
    : Array(n).fill(1 / Math.max(1, n));

  const holdingsMap = new Map<string, { name: string; weight: number }>();
  const sectorMap = new Map<string, number>();
  let disclosed = 0;

  etfs.forEach((etf, i) => {
    const share = alloc[i];
    let etfDisclosed = 0;
    for (const h of etf.topHoldings) {
      const contrib = share * h.weight; // percent of blended NAV
      const rec = holdingsMap.get(h.ticker) || { name: h.name, weight: 0 };
      rec.weight += contrib;
      holdingsMap.set(h.ticker, rec);
      etfDisclosed += h.weight;
    }
    disclosed += share * (etfDisclosed / 100);

    for (const s of etf.sectors) {
      sectorMap.set(s.sector, (sectorMap.get(s.sector) || 0) + share * s.weight);
    }
  });

  const holdings = [...holdingsMap.entries()]
    .map(([ticker, v]) => ({ ticker, name: v.name, weight: v.weight }))
    .sort((a, b) => b.weight - a.weight);

  const sectors = [...sectorMap.entries()]
    .map(([sector, weight]) => ({ sector, weight }))
    .sort((a, b) => b.weight - a.weight);

  const wPct = holdings.map((h) => h.weight);
  return {
    holdings,
    sectors,
    hhi: hhi(wPct),
    effectiveN: effectiveN(wPct),
    disclosedCoverage: disclosed,
  };
}

function normalizeAlloc(a: number[]): number[] {
  const s = a.reduce((x, y) => x + Math.max(0, y), 0);
  if (s <= 0) return a.map(() => 1 / a.length);
  return a.map((x) => Math.max(0, x) / s);
}

// 0..100 heuristic. Penalizes: pairwise overlap, concentration in top-10,
// single-sector dominance. Higher = more diversified.
export function diversificationScore(etfs: ETFDef[], allocations?: number[]): {
  score: number;
  breakdown: { avgOverlap: number; top10: number; topSector: number };
} {
  if (etfs.length === 0) return { score: 0, breakdown: { avgOverlap: 0, top10: 0, topSector: 0 } };

  // Allocation-weighted average pairwise overlap. Each pair contributes in
  // proportion to how much the user has actually allocated to both funds.
  const alloc = (allocations && allocations.length === etfs.length)
    ? normalizeAlloc(allocations)
    : Array(etfs.length).fill(1 / Math.max(1, etfs.length));
  let overlapSum = 0;
  let wSum = 0;
  for (let i = 0; i < etfs.length; i++) {
    for (let j = i + 1; j < etfs.length; j++) {
      const w = alloc[i] * alloc[j];
      overlapSum += w * pairwiseOverlap(etfs[i], etfs[j]).weightOverlap;
      wSum += w;
    }
  }
  const avgOverlap = wSum > 0 ? overlapSum / wSum : 0;

  const blend = blendedPortfolio(etfs, allocations);
  const top10 = blend.holdings.slice(0, 10).reduce((s, h) => s + h.weight, 0); // percent
  const topSector = blend.sectors[0]?.weight || 0; // percent

  // Component sub-scores (each 0..1, higher = better).
  const overlapScore = 1 - Math.min(1, avgOverlap / 0.7); // >70% overlap ≈ 0
  const top10Score = 1 - Math.min(1, Math.max(0, top10 - 15) / 60); // 15% → 1.0, 75% → 0
  const sectorScore = 1 - Math.min(1, Math.max(0, topSector - 20) / 60); // 20% → 1.0, 80% → 0

  const score = 100 * (0.45 * overlapScore + 0.30 * top10Score + 0.25 * sectorScore);
  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: { avgOverlap, top10, topSector },
  };
}

export function scoreBand(score: number): { label: string; tone: "good" | "warn" | "bad" } {
  if (score >= 70) return { label: "Well diversified", tone: "good" };
  if (score >= 45) return { label: "Moderate overlap", tone: "warn" };
  return { label: "Heavy overlap", tone: "bad" };
}