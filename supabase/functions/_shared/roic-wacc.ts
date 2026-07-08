// Server-side ROIC + WACC computation for the copilot get_fundamentals tool.
// Uses the shared Yahoo Finance crumb/cookie pair from `_shared/fundamentals.ts`.
import { getCrumb } from "./fundamentals.ts";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "object" && v && typeof (v as { raw?: number }).raw === "number") return (v as { raw: number }).raw;
  return null;
}

function clamp(x: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, x)); }

export interface RoicWaccSnapshot {
  roic: number | null;
  nopat: number | null;
  investedCapital: number | null;
  effectiveTaxRate: number | null;
  wacc: number | null;
  costOfEquity: number | null;
  afterTaxCostOfDebt: number | null;
  weightEquity: number | null;
  weightDebt: number | null;
  assumptions: {
    riskFreeRate: number;
    equityRiskPremium: number;
    beta: number;
    preTaxCostOfDebt: number;
  };
  spread: number | null;
  interpretation: string;
}

export async function computeRoicWacc(symbol: string): Promise<RoicWaccSnapshot | null> {
  try {
    const { crumb, cookie } = await getCrumb();
    const modules = "incomeStatementHistory,balanceSheetHistory,summaryDetail,defaultKeyStatistics,price,financialData";
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
    const r = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } });
    if (!r.ok) return null;
    const j = await r.json();
    const q = j?.quoteSummary?.result?.[0];
    if (!q) return null;
    const inc = q.incomeStatementHistory?.incomeStatementHistory?.[0] ?? {};
    const bs = q.balanceSheetHistory?.balanceSheetStatements?.[0] ?? {};
    const sd = q.summaryDetail ?? {};
    const price = q.price ?? {};

    const ebit = num(inc.operatingIncome);
    const tax = num(inc.incomeTaxExpense);
    const pretax = num(inc.incomeBeforeTax);
    const effTax = tax != null && pretax && pretax !== 0 ? clamp(tax / pretax, 0, 0.5) : 0.21;
    const equity = num(bs.totalStockholderEquity) ?? 0;
    const ltDebt = num(bs.longTermDebt) ?? 0;
    const stDebt = num(bs.shortLongTermDebt) ?? 0;
    const cash = num(bs.cash) ?? 0;
    const ic = equity + ltDebt + stDebt - cash;
    const nopat = ebit != null ? ebit * (1 - effTax) : null;
    const roic = nopat != null && ic > 0 ? nopat / ic : null;

    const rf = 0.042, erp = 0.05;
    const beta = num(sd.beta) ?? 1;
    const kdPre = 0.05;
    const ke = rf + beta * erp;
    const kdAfter = kdPre * (1 - effTax);
    const e = num(price.marketCap) ?? num(sd.marketCap) ?? 0;
    const d = ltDebt + stDebt;
    const v = e + d;
    const we = v > 0 ? e / v : null;
    const wd = v > 0 ? d / v : null;
    const wacc = we != null && wd != null ? we * ke + wd * kdAfter : null;
    const spread = roic != null && wacc != null ? roic - wacc : null;

    let interpretation = "Insufficient data.";
    if (spread != null) {
      const pp = (spread * 100).toFixed(1);
      interpretation = spread >= 0.02
        ? `Value-creating: ROIC exceeds WACC by ${pp} pp.`
        : spread >= 0
          ? `Marginal: ROIC roughly matches WACC (${pp} pp spread).`
          : `Value-destroying: ROIC below WACC by ${pp} pp.`;
    }

    return {
      roic, nopat, investedCapital: ic > 0 ? ic : null,
      effectiveTaxRate: effTax,
      wacc, costOfEquity: ke, afterTaxCostOfDebt: kdAfter,
      weightEquity: we, weightDebt: wd,
      assumptions: { riskFreeRate: rf, equityRiskPremium: erp, beta, preTaxCostOfDebt: kdPre },
      spread, interpretation,
    };
  } catch {
    return null;
  }
}