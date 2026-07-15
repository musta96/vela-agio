/**
 * Dividend income projection engine — shared between the on-page
 * Dividend Planner UI and the `project_dividends` MCP tool so both
 * surfaces produce identical numbers.
 *
 * Portfolio is modeled as shares of a hypothetical index whose per-share
 * price grows at `priceGrowth` and per-share dividend grows at
 * `dividendGrowth` from the starting yield `dividendYield`. Compounding
 * is monthly; payouts fire on `payoutFrequency` (1/2/4/12 per year).
 */

export type DividendPositionSeed = {
  symbol: string;
  shares: number;
  price: number;       // per-share price in the projection's currency
  yieldPct: number;    // annual dividend yield (0-100), e.g. 3.5
  nextPayoutMonth?: number; // 1-12; if omitted, quarterly cycle starting month 3
};

export type ProjectionInputs = {
  startingValue: number;
  monthlyContribution: number;
  contributionGrowthPct: number;
  dividendYieldPct: number;
  dividendGrowthPct: number;
  priceGrowthPct: number;
  taxPct: number;
  years: number;
  reinvest: boolean;
  payoutFrequency: 1 | 2 | 4 | 12;
  /** Optional real positions — when provided, they drive the starting
   *  portfolio value AND the blended starting yield instead of the
   *  scalar dividendYield. Contributions still use `dividendYieldPct`
   *  as the assumed yield for new capital. */
  positions?: DividendPositionSeed[];
};

export type ProjectionRow = {
  year: number;
  contributions: number;
  reinvested: number;
  portfolio: number;
  grossDividends: number;
  netDividends: number;
  yieldOnCost: number;
};

export type ProjectionResult = {
  rows: ProjectionRow[];
  finalPortfolio: number;
  finalNetIncome: number;
  totalContrib: number;
  totalReinvested: number;
  totalGross: number;
  totalNet: number;
  yieldOnCost: number;
  blendedStartYieldPct: number;
  seededFromPositions: boolean;
};

export function projectDividends(input: ProjectionInputs): ProjectionResult {
  const y0Scalar = input.dividendYieldPct / 100;
  const dgr = input.dividendGrowthPct / 100;
  const pgr = input.priceGrowthPct / 100;
  const tax = Math.min(1, Math.max(0, input.taxPct / 100));
  const contribGrowth = input.contributionGrowthPct / 100;
  const freq = input.payoutFrequency;
  const monthsPerPayout = 12 / freq;

  // Compute the blended starting yield from real positions when provided.
  const positions = input.positions ?? [];
  const seedValue = positions.reduce((a, p) => a + (p.shares * p.price || 0), 0);
  const seedIncome = positions.reduce((a, p) => a + (p.shares * p.price * (p.yieldPct / 100) || 0), 0);
  const seededFromPositions = positions.length > 0 && seedValue > 0;
  const blendedYield = seededFromPositions ? seedIncome / seedValue : y0Scalar;

  const startingValue = seededFromPositions ? seedValue : input.startingValue;

  let price = 1;
  let shares = startingValue / price;
  // Per-payout dividend-per-share, so annual DPS = dpsPerPayout * freq = y0 * price at t=0.
  let dividendPerShare = (blendedYield * price) / freq;
  let cumulativeNetContrib = startingValue;
  let cumulativeReinvested = 0;
  let monthlyContrib = input.monthlyContribution;
  let totalGross = 0;
  let totalNet = 0;

  const rows: ProjectionRow[] = [];
  for (let year = 1; year <= input.years; year++) {
    let grossThisYear = 0;
    let netThisYear = 0;
    for (let month = 1; month <= 12; month++) {
      if (monthlyContrib > 0) {
        shares += monthlyContrib / price;
        cumulativeNetContrib += monthlyContrib;
      }
      if (month % monthsPerPayout === 0) {
        const gross = dividendPerShare * shares;
        const net = gross * (1 - tax);
        grossThisYear += gross;
        netThisYear += net;
        if (input.reinvest) {
          shares += net / price;
          cumulativeReinvested += net;
        }
        dividendPerShare *= Math.pow(1 + dgr, 1 / freq);
      }
      price *= Math.pow(1 + pgr, 1 / 12);
    }
    totalGross += grossThisYear;
    totalNet += netThisYear;
    rows.push({
      year,
      contributions: cumulativeNetContrib,
      reinvested: cumulativeReinvested,
      portfolio: shares * price,
      grossDividends: grossThisYear,
      netDividends: netThisYear,
      yieldOnCost: cumulativeNetContrib > 0 ? netThisYear / cumulativeNetContrib : 0,
    });
    monthlyContrib *= 1 + contribGrowth;
  }

  const last = rows[rows.length - 1];
  return {
    rows,
    finalPortfolio: last?.portfolio ?? startingValue,
    finalNetIncome: last?.netDividends ?? 0,
    totalContrib: last?.contributions ?? startingValue,
    totalReinvested: last?.reinvested ?? 0,
    totalGross,
    totalNet,
    yieldOnCost: last?.yieldOnCost ?? 0,
    blendedStartYieldPct: blendedYield * 100,
    seededFromPositions,
  };
}

/**
 * Build a monthly payout calendar for the first 12 months given real
 * positions with `nextPayoutMonth` hints. Used by the UI to show when
 * upcoming dividends actually land.
 */
export function buildPayoutCalendar(
  positions: DividendPositionSeed[],
  currentMonth: number,
): { month: number; monthLabel: string; income: number; contributors: string[] }[] {
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = ((currentMonth - 1 + i) % 12) + 1;
    return { month: m, monthLabel: new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "short" }), income: 0, contributors: [] as string[] };
  });
  for (const p of positions) {
    const yr = p.shares * p.price * (p.yieldPct / 100);
    if (yr <= 0) continue;
    // Default cadence: quarterly starting at nextPayoutMonth (or 3).
    const start = ((p.nextPayoutMonth ?? 3) - 1) % 12;
    for (let k = 0; k < 4; k++) {
      const m = ((start + k * 3) % 12) + 1;
      const slot = months.find((s) => s.month === m);
      if (slot) {
        slot.income += yr / 4;
        if (!slot.contributors.includes(p.symbol)) slot.contributors.push(p.symbol);
      }
    }
  }
  return months.map((s) => ({ ...s, income: Math.round(s.income) }));
}