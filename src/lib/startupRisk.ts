// ============================================================================
// Startup portfolio risk model.
//
// Deterministic and explainable: every number below comes from three things we
// actually know about a holding — how it was valued, what the press is saying,
// and how early the company is — plus how big the position is.
// No AI, no hidden magic: the same inputs always give the same answer.
// ============================================================================

export interface RiskInputs {
  id: string;
  name: string;
  stage: string;
  /** Human label of the valuation method that produced the current mark. */
  method: string;
  /** Press sentiment, -100..100, or null when we have no coverage. */
  sentiment: number | null;
  /** Position value in base currency. */
  value: number;
  invested: number;
}

export interface HoldingRisk extends RiskInputs {
  weight: number;
  stageRisk: number;
  methodRisk: number;
  sentimentRisk: number;
  concentrationRisk: number;
  risk: number;              // 0 (calm) .. 100 (fragile)
  survival: number;          // 0..1 rough odds the position returns capital
  expectedMultiple: number;  // probability-weighted multiple on today's mark
  driver: string;            // the single biggest reason this holding is risky
}

export interface PortfolioRisk {
  holdings: HoldingRisk[];
  risk: number;
  survival: number;
  expectedMultiple: number;
  expectedValue: number;
  lossValue: number;          // value sitting in holdings with survival < 40%
  unpricedShare: number;      // share of value with no real valuation behind it
  sentimentCoverage: number;  // share of holdings with press coverage
  band: "Low" | "Moderate" | "High" | "Very high";
  notes: string[];
}

/** Earlier stage, more ways to die — and a bigger prize if it works. */
const STAGE: Record<string, { risk: number; upside: number }> = {
  idea: { risk: 96, upside: 20 },
  pre_seed: { risk: 92, upside: 15 },
  seed: { risk: 85, upside: 10 },
  series_a: { risk: 70, upside: 6 },
  series_b: { risk: 58, upside: 4 },
  series_c: { risk: 48, upside: 3 },
  growth: { risk: 40, upside: 2.4 },
  pre_ipo: { risk: 32, upside: 1.9 },
};

/** How much we trust the number the position is carried at. */
function methodRisk(method: string): number {
  const m = (method || "").toLowerCase();
  if (!m || m.includes("not valued")) return 95;
  if (m.includes("berkus") || m.includes("scorecard") || m.includes("matrix") || m.includes("risk factor")) return 78;
  if (m.includes("last round") || m.includes("previous round") || m.includes("post-money")) return 62;
  if (m.includes("vc method") || m.includes("required irr")) return 55;
  if (m.includes("comparable") || m.includes("revenue") || m.includes("arr") || m.includes("peer")) return 45;
  if (m.includes("dcf") || m.includes("discounted")) return 38;
  return 60;
}

function sentimentRisk(score: number | null): number {
  if (score == null) return 60; // silence is its own risk
  return Math.max(5, Math.min(95, 50 - score / 2.2));
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function assessStartupPortfolio(rows: RiskInputs[]): PortfolioRisk {
  const total = rows.reduce((a, r) => a + (Number.isFinite(r.value) ? r.value : 0), 0);

  const holdings: HoldingRisk[] = rows.map((r) => {
    const weight = total > 0 ? r.value / total : rows.length ? 1 / rows.length : 0;
    const stage = STAGE[r.stage] ?? { risk: 80, upside: 8 };
    const mRisk = methodRisk(r.method);
    const sRisk = sentimentRisk(r.sentiment);
    // A position only starts adding risk once it passes a quarter of the book.
    const cRisk = clamp(((weight - 0.25) / 0.75) * 100);

    const risk = clamp(0.38 * stage.risk + 0.27 * mRisk + 0.20 * sRisk + 0.15 * cRisk);
    const survival = clamp(1 - risk / 118, 0.05, 0.95);
    const expectedMultiple = Number((survival * stage.upside * (r.sentiment == null ? 0.92 : 1 + r.sentiment / 400)).toFixed(2));

    const parts: Array<[string, number]> = [
      [`${r.stage.replace(/_/g, " ")} stage`, stage.risk * 0.38],
      ["how it is valued", mRisk * 0.27],
      ["press sentiment", sRisk * 0.2],
      ["position size", cRisk * 0.15],
    ];
    const driver = parts.sort((a, b) => b[1] - a[1])[0][0];

    return { ...r, weight, stageRisk: stage.risk, methodRisk: mRisk, sentimentRisk: sRisk, concentrationRisk: cRisk, risk, survival, expectedMultiple, driver };
  });

  const w = (pick: (h: HoldingRisk) => number) =>
    holdings.length === 0 ? 0 : total > 0
      ? holdings.reduce((a, h) => a + pick(h) * h.weight, 0)
      : holdings.reduce((a, h) => a + pick(h), 0) / holdings.length;

  const risk = Math.round(w((h) => h.risk));
  const survival = w((h) => h.survival);
  const expectedValue = holdings.reduce((a, h) => a + h.value * h.expectedMultiple, 0);
  const expectedMultiple = total > 0 ? expectedValue / total : 0;
  const lossValue = holdings.filter((h) => h.survival < 0.4).reduce((a, h) => a + h.value, 0);
  const unpricedShare = holdings.filter((h) => h.methodRisk >= 90).reduce((a, h) => a + h.weight, 0);
  const sentimentCoverage = holdings.length ? holdings.filter((h) => h.sentiment != null).length / holdings.length : 0;

  const band = risk >= 82 ? "Very high" : risk >= 68 ? "High" : risk >= 52 ? "Moderate" : "Low";

  const notes: string[] = [];
  const biggest = [...holdings].sort((a, b) => b.weight - a.weight)[0];
  if (biggest && biggest.weight > 0.35) notes.push(`${biggest.name} is ${(biggest.weight * 100).toFixed(0)}% of the book — one outcome decides the portfolio.`);
  if (unpricedShare > 0.2) notes.push(`${Math.round(unpricedShare * 100)}% of value has no real valuation behind it; run a valuation to firm up the mark.`);
  if (sentimentCoverage < 0.5) notes.push(`Only ${Math.round(sentimentCoverage * 100)}% of holdings have press coverage, so sentiment is doing little work here.`);
  const early = holdings.filter((h) => h.stageRisk >= 85).reduce((a, h) => a + h.weight, 0);
  if (early > 0.5) notes.push(`${Math.round(early * 100)}% sits in pre-seed/seed names: expect most of the return from one or two winners.`);
  if (notes.length === 0) notes.push("Spread, marks and coverage all look reasonable for a private book of this size.");

  return { holdings, risk, survival, expectedMultiple, expectedValue, lossValue, unpricedShare, sentimentCoverage, band, notes };
}
