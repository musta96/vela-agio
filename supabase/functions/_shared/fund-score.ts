// =====================================================================
// Vela proprietary fund / ETF scoring.
//
// Produces, from whatever data a provider actually published:
//   • riskScore  0-100  (higher = riskier)
//   • pillar scores for cost, performance, robustness and diversification
//   • finalScore 0-100 + letter grade
//
// Every pillar is optional: missing inputs are dropped and the remaining
// weights are renormalised, so a thin mutual-fund record still scores.
// =====================================================================

export type Pillar = {
  key: string;
  label: string;
  score: number; // 0-100, higher = better
  weight: number;
  detail: string;
};

export type FundScore = {
  finalScore: number | null;
  grade: string | null;
  riskScore: number | null;
  riskLabel: string | null;
  pillars: Pillar[];
  coverage: number; // 0-1 share of weights we could evaluate
  methodology: string;
};

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const isN = (v: unknown): v is number => typeof v === "number" && isFinite(v);

/** Maps a value linearly onto 0-100 between `worst` and `best` (either direction). */
function band(value: number, worst: number, best: number): number {
  if (worst === best) return 50;
  return clamp(((value - worst) / (best - worst)) * 100);
}

/** Yahoo mixes fractions (0.0022) and percents (0.22) — normalise to percent. */
function asPercent(v: number | null | undefined): number | null {
  if (!isN(v)) return null;
  return Math.abs(v) <= 1.5 ? v * 100 : v;
}

export type ScoreInputs = {
  quoteType?: string | null;
  ter?: number | null;
  categoryTer?: number | null;
  stdDev3y?: number | null;
  beta3y?: number | null;
  sharpe3y?: number | null;
  worstAnnualReturn?: number | null;
  return3y?: number | null;
  return5y?: number | null;
  category3y?: number | null;
  category5y?: number | null;
  totalAssets?: number | null;
  inceptionDate?: string | null;
  morningstarOverall?: number | null;
  topHoldingsWeight?: number | null; // sum of top-10 weights, percent
  holdingsCount?: number | null;
  sectorCount?: number | null;
};

export function computeFundScore(i: ScoreInputs): FundScore {
  const pillars: Pillar[] = [];

  // ---------- Risk (0 = placid, 100 = very risky) ----------
  const riskParts: { v: number; w: number }[] = [];
  const sd = asPercent(i.stdDev3y);
  if (isN(sd)) riskParts.push({ v: band(sd, 2, 35), w: 0.45 });
  if (isN(i.beta3y)) riskParts.push({ v: band(i.beta3y, 0.1, 1.8), w: 0.25 });
  const worst = asPercent(i.worstAnnualReturn);
  if (isN(worst)) riskParts.push({ v: band(Math.abs(Math.min(0, worst)), 0, 45), w: 0.3 });
  const riskW = riskParts.reduce((s, p) => s + p.w, 0);
  const riskScore = riskW > 0
    ? Math.round(riskParts.reduce((s, p) => s + p.v * p.w, 0) / riskW)
    : null;
  const riskLabel = riskScore == null ? null
    : riskScore < 20 ? "Very low"
    : riskScore < 40 ? "Low"
    : riskScore < 60 ? "Moderate"
    : riskScore < 80 ? "High"
    : "Very high";

  // ---------- Cost ----------
  const ter = asPercent(i.ter);
  const catTer = asPercent(i.categoryTer);
  if (isN(ter) && ter > 0) {
    const absolute = band(ter, 2.2, 0.05); // cheap = high score
    const relative = isN(catTer) && catTer > 0 ? band(ter - catTer, 0.8, -0.8) : null;
    const score = relative == null ? absolute : absolute * 0.6 + relative * 0.4;
    pillars.push({
      key: "cost", label: "Cost efficiency", weight: 0.3, score: Math.round(score),
      detail: isN(catTer) && catTer > 0
        ? `Ongoing charge ${ter.toFixed(2)}% vs category average ${catTer.toFixed(2)}%.`
        : `Ongoing charge ${ter.toFixed(2)}% per year.`,
    });
  }

  // ---------- Risk-adjusted performance ----------
  const perfParts: { v: number; w: number }[] = [];
  const excess3 = isN(asPercent(i.return3y)) && isN(asPercent(i.category3y))
    ? (asPercent(i.return3y) as number) - (asPercent(i.category3y) as number) : null;
  const excess5 = isN(asPercent(i.return5y)) && isN(asPercent(i.category5y))
    ? (asPercent(i.return5y) as number) - (asPercent(i.category5y) as number) : null;
  if (isN(excess3)) perfParts.push({ v: band(excess3, -8, 8), w: 0.35 });
  if (isN(excess5)) perfParts.push({ v: band(excess5, -8, 8), w: 0.3 });
  if (isN(i.sharpe3y)) perfParts.push({ v: band(i.sharpe3y, -0.4, 1.6), w: 0.35 });
  else if (isN(asPercent(i.return3y))) perfParts.push({ v: band(asPercent(i.return3y) as number, -10, 20), w: 0.2 });
  if (perfParts.length) {
    const w = perfParts.reduce((s, p) => s + p.w, 0);
    const score = perfParts.reduce((s, p) => s + p.v * p.w, 0) / w;
    const bits: string[] = [];
    if (isN(excess3)) bits.push(`${excess3 >= 0 ? "+" : ""}${excess3.toFixed(1)}pp vs category over 3y`);
    if (isN(i.sharpe3y)) bits.push(`Sharpe ${i.sharpe3y.toFixed(2)}`);
    pillars.push({
      key: "performance", label: "Risk-adjusted performance", weight: 0.3,
      score: Math.round(score),
      detail: bits.length ? bits.join(" · ") : "Based on published trailing returns.",
    });
  }

  // ---------- Robustness (size, track record, external rating) ----------
  const robParts: { v: number; w: number }[] = [];
  if (isN(i.totalAssets) && i.totalAssets > 0) {
    robParts.push({ v: band(Math.log10(i.totalAssets), 6.7, 10), w: 0.4 }); // 5M → 10B
  }
  let years: number | null = null;
  if (i.inceptionDate) {
    const t = Date.parse(i.inceptionDate);
    if (!isNaN(t)) {
      years = (Date.now() - t) / (365.25 * 24 * 3600 * 1000);
      robParts.push({ v: band(years, 0.5, 12), w: 0.3 });
    }
  }
  if (isN(i.morningstarOverall) && i.morningstarOverall > 0) {
    robParts.push({ v: band(i.morningstarOverall, 1, 5), w: 0.3 });
  }
  if (robParts.length) {
    const w = robParts.reduce((s, p) => s + p.w, 0);
    const bits: string[] = [];
    if (isN(i.totalAssets)) bits.push(`Fund size ${(i.totalAssets / 1e6).toFixed(0)}M`);
    if (years != null) bits.push(`${years.toFixed(0)}y track record`);
    if (isN(i.morningstarOverall) && i.morningstarOverall > 0) bits.push(`${i.morningstarOverall}★ Morningstar`);
    pillars.push({
      key: "robustness", label: "Robustness", weight: 0.2,
      score: Math.round(robParts.reduce((s, p) => s + p.v * p.w, 0) / w),
      detail: bits.join(" · "),
    });
  }

  // ---------- Diversification ----------
  const divParts: { v: number; w: number }[] = [];
  const top = asPercent(i.topHoldingsWeight);
  if (isN(top) && top > 0) divParts.push({ v: band(top, 90, 15), w: 0.6 });
  if (isN(i.holdingsCount) && i.holdingsCount > 0) divParts.push({ v: band(i.holdingsCount, 5, 200), w: 0.2 });
  if (isN(i.sectorCount) && i.sectorCount > 0) divParts.push({ v: band(i.sectorCount, 1, 11), w: 0.2 });
  if (divParts.length) {
    const w = divParts.reduce((s, p) => s + p.w, 0);
    pillars.push({
      key: "diversification", label: "Diversification", weight: 0.2,
      score: Math.round(divParts.reduce((s, p) => s + p.v * p.w, 0) / w),
      detail: isN(top) && top > 0
        ? `Top holdings represent ${top.toFixed(1)}% of the portfolio.`
        : "Based on disclosed holdings and sector spread.",
    });
  }

  const totalW = pillars.reduce((s, p) => s + p.weight, 0);
  const finalScore = totalW > 0
    ? Math.round(pillars.reduce((s, p) => s + p.score * p.weight, 0) / totalW)
    : null;
  const grade = finalScore == null ? null
    : finalScore >= 85 ? "A+"
    : finalScore >= 75 ? "A"
    : finalScore >= 65 ? "B"
    : finalScore >= 55 ? "C"
    : finalScore >= 40 ? "D"
    : "E";

  return {
    finalScore,
    grade,
    riskScore,
    riskLabel,
    pillars,
    coverage: Math.round((totalW / 1.0) * 100) / 100,
    methodology:
      "Vela score = cost efficiency 30%, risk-adjusted performance vs category 30%, robustness (size, track record, external rating) 20%, diversification 20%. " +
      "Pillars without published data are excluded and the remaining weights renormalised. Risk score blends 3-year volatility (45%), beta (25%) and worst calendar year (30%).",
  };
}
