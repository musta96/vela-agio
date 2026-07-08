/**
 * ROIC and WACC calculators.
 * Descriptive, educational metrics — inputs are point-in-time filings so the
 * caller must treat outputs as estimates, not audited numbers.
 */

export interface RoicInputs {
  ebit: number | null;              // operating income (TTM or latest FY)
  taxRate?: number | null;          // effective tax rate 0..1; falls back to 0.21
  totalEquity: number | null;
  longTermDebt?: number | null;
  shortLongTermDebt?: number | null; // current portion of LT debt
  cash?: number | null;             // cash & equivalents (subtracted from IC)
}

export interface RoicResult {
  nopat: number | null;
  investedCapital: number | null;
  taxRate: number;
  roic: number | null;              // fraction, e.g. 0.185 = 18.5%
}

export function computeRoic(i: RoicInputs): RoicResult {
  const taxRate = clamp(i.taxRate ?? 0.21, 0, 0.5);
  const debt = (i.longTermDebt ?? 0) + (i.shortLongTermDebt ?? 0);
  const equity = i.totalEquity ?? 0;
  const cash = i.cash ?? 0;
  const ic = equity + debt - cash;
  const nopat = i.ebit != null ? i.ebit * (1 - taxRate) : null;
  const roic = nopat != null && ic > 0 ? nopat / ic : null;
  return { nopat, investedCapital: ic > 0 ? ic : null, taxRate, roic };
}

export interface WaccInputs {
  marketCap: number | null;         // equity market value
  totalDebt: number | null;
  beta?: number | null;
  riskFreeRate?: number;            // decimal, default 4.2%
  equityRiskPremium?: number;       // decimal, default 5%
  preTaxCostOfDebt?: number | null; // decimal, default 5%
  taxRate?: number | null;          // decimal, default 21%
}

export interface WaccResult {
  costOfEquity: number | null;
  afterTaxCostOfDebt: number | null;
  weightEquity: number | null;
  weightDebt: number | null;
  wacc: number | null;
  assumptions: {
    riskFreeRate: number;
    equityRiskPremium: number;
    beta: number;
    preTaxCostOfDebt: number;
    taxRate: number;
  };
}

export function computeWacc(i: WaccInputs): WaccResult {
  const rf = i.riskFreeRate ?? 0.042;
  const erp = i.equityRiskPremium ?? 0.05;
  const beta = i.beta ?? 1;
  const kdPre = i.preTaxCostOfDebt ?? 0.05;
  const tax = clamp(i.taxRate ?? 0.21, 0, 0.5);
  const ke = rf + beta * erp;
  const kdAfter = kdPre * (1 - tax);
  const e = Math.max(i.marketCap ?? 0, 0);
  const d = Math.max(i.totalDebt ?? 0, 0);
  const v = e + d;
  if (v <= 0) return { costOfEquity: ke, afterTaxCostOfDebt: kdAfter, weightEquity: null, weightDebt: null, wacc: null, assumptions: { riskFreeRate: rf, equityRiskPremium: erp, beta, preTaxCostOfDebt: kdPre, taxRate: tax } };
  const we = e / v, wd = d / v;
  const wacc = we * ke + wd * kdAfter;
  return { costOfEquity: ke, afterTaxCostOfDebt: kdAfter, weightEquity: we, weightDebt: wd, wacc, assumptions: { riskFreeRate: rf, equityRiskPremium: erp, beta, preTaxCostOfDebt: kdPre, taxRate: tax } };
}

/** ROIC – WACC spread. Positive = value-creating; negative = destroying capital. */
export function roicWaccSpread(roic: number | null, wacc: number | null): number | null {
  if (roic == null || wacc == null) return null;
  return roic - wacc;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

export function pct(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return "-";
  return `${(x * 100).toFixed(digits)}%`;
}