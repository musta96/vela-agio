/**
 * Share-buyback analytics helpers.
 * Historical figures come from Yahoo cash flow / income statements; forward
 * projections are simple deterministic scenarios (constant spend, held P/E).
 */

export interface BuybackYear {
  year: string;
  buybackSpend: number | null;   // positive USD outflow
  dividendSpend: number | null;
  netIncome: number | null;
  dilutedShares: number | null;  // avg diluted, if available
  eps: number | null;            // NI / diluted shares
}

export interface BuybackImpact {
  currentShares: number;
  currentEps: number | null;
  buybackSpend: number;
  refPrice: number;
  sharesRetired: number;
  newShares: number;
  newEps: number | null;
  epsDeltaPct: number | null;
  buybackYieldPct: number | null;
}

/**
 * One-shot EPS accretion from a given buyback spend at a given reference
 * price, holding net income constant.
 */
export function computeBuybackImpact(args: {
  netIncome: number | null;
  sharesOutstanding: number | null;
  price: number | null;
  marketCap: number | null;
  buybackSpend: number | null;
}): BuybackImpact | null {
  const { netIncome, sharesOutstanding, price, marketCap, buybackSpend } = args;
  if (!sharesOutstanding || !price || price <= 0 || !buybackSpend || buybackSpend <= 0) return null;
  const eps0 = netIncome != null && sharesOutstanding > 0 ? netIncome / sharesOutstanding : null;
  const retired = buybackSpend / price;
  const newShares = Math.max(1, sharesOutstanding - retired);
  const eps1 = netIncome != null ? netIncome / newShares : null;
  const delta = eps0 != null && eps1 != null && eps0 !== 0 ? (eps1 - eps0) / Math.abs(eps0) : null;
  const yieldPct = marketCap && marketCap > 0 ? buybackSpend / marketCap : null;
  return {
    currentShares: sharesOutstanding,
    currentEps: eps0,
    buybackSpend,
    refPrice: price,
    sharesRetired: retired,
    newShares,
    newEps: eps1,
    epsDeltaPct: delta,
    buybackYieldPct: yieldPct,
  };
}

export interface ProjectionRow {
  year: number;
  shares: number;
  netIncome: number;
  eps: number;
  price: number;
  buybackSpend: number;
  totalReturnPct: number; // vs year 0 price incl reinvested divs proxied by 0
}

/**
 * Simple forward projection: constant annual buyback spend, constant P/E,
 * user-set NI growth and share-price growth assumptions. Educational only.
 */
export function projectBuybacks(args: {
  years: number;
  startShares: number;
  startNetIncome: number;
  startPrice: number;
  annualBuybackSpend: number;
  niGrowthPct: number;         // e.g. 0.05
  priceGrowthPct: number;      // annual price appreciation ex-buyback effect
}): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  let shares = args.startShares;
  let ni = args.startNetIncome;
  let price = args.startPrice;
  const startPrice = args.startPrice;
  rows.push({
    year: 0, shares, netIncome: ni, eps: ni / shares, price,
    buybackSpend: 0, totalReturnPct: 0,
  });
  for (let i = 1; i <= args.years; i++) {
    // Grow fundamentals, then execute buyback at the year-end price.
    ni = ni * (1 + args.niGrowthPct);
    // Price grows organically, then buyback yield boosts price via EPS lift.
    const priceOrg = price * (1 + args.priceGrowthPct);
    const retired = args.annualBuybackSpend > 0 ? args.annualBuybackSpend / priceOrg : 0;
    shares = Math.max(1, shares - retired);
    const eps = ni / shares;
    // Hold P/E constant vs. prior year: new price = prior P/E * new EPS.
    const priorPE = price / (ni / (shares + retired) || eps);
    price = Math.max(0.01, priorPE * eps);
    rows.push({
      year: i, shares, netIncome: ni, eps, price,
      buybackSpend: args.annualBuybackSpend,
      totalReturnPct: (price - startPrice) / startPrice,
    });
  }
  return rows;
}

export function fmtMoney(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "-";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function fmtShares(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "-";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  return v.toLocaleString();
}

export function fmtPct(v: number | null | undefined, digits = 2) {
  if (v == null || !Number.isFinite(v)) return "-";
  return `${(v * 100).toFixed(digits)}%`;
}