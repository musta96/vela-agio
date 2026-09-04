// Fineco-style company data sheet for any listed instrument, worldwide.
//
// Returns in one call:
//   • profile          — sector, industry, employees, website, description
//   • indicators       — valuation, profitability, health, dividend, analyst
//   • events           — next earnings, ex-dividend, dividend pay date, history
//   • statements       — income / balance / cash flow, annual AND quarterly
//   • dividends/splits — 10y history from the chart events endpoint
//
// Yahoo quoteSummary is the primary source (global coverage: .MI .L .DE .PA
// .AS .SW .T .HK .KS .NS .AX .SA .JO .SR .AE …). Missing modules degrade
// gracefully: each block is independent and returns `null` when unavailable,
// so partial coverage never blanks the whole page.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { fetchQuoteSummary, fetchCorporateEvents } from "../_shared/fundamentals.ts";
import { getCached, setCached } from "../_shared/profile-cache.ts";

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "object" && v && typeof (v as { raw?: number }).raw === "number") {
    const r = (v as { raw: number }).raw;
    return isFinite(r) ? r : null;
  }
  return null;
}

function dateOf(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "object" && v && (v as any).fmt) return String((v as any).fmt);
  const n = num(v);
  if (n == null) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const INCOME_KEYS = [
  "totalRevenue", "costOfRevenue", "grossProfit", "researchDevelopment",
  "sellingGeneralAdministrative", "operatingIncome", "ebit", "interestExpense",
  "incomeBeforeTax", "incomeTaxExpense", "netIncome",
];
const BALANCE_KEYS = [
  "cash", "shortTermInvestments", "netReceivables", "inventory", "totalCurrentAssets",
  "propertyPlantEquipment", "goodWill", "totalAssets", "totalCurrentLiabilities",
  "longTermDebt", "totalLiab", "retainedEarnings", "totalStockholderEquity",
];
const CASH_KEYS = [
  "totalCashFromOperatingActivities", "capitalExpenditures", "totalCashflowsFromInvestingActivities",
  "totalCashFromFinancingActivities", "dividendsPaid", "repurchaseOfStock",
  "netBorrowings", "changeInCash", "freeCashFlow",
];

function rows(history: unknown, keys: string[], limit = 5) {
  if (!Array.isArray(history)) return [];
  return history
    .map((h: any) => {
      const values: Record<string, number | null> = {};
      for (const k of keys) {
        let v = num(h?.[k]);
        if (k === "freeCashFlow" && v == null) {
          const ops = num(h?.totalCashFromOperatingActivities);
          const cap = num(h?.capitalExpenditures);
          if (ops != null && cap != null) v = ops + cap; // capex is negative
        }
        values[k] = v;
      }
      return { period: dateOf(h?.endDate) ?? "-", values };
    })
    .slice(0, limit)
    .reverse();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const symbol = String(body.symbol ?? url.searchParams.get("symbol") ?? "").trim();
    if (!symbol) return json({ error: "symbol required" }, 400);

    // Shared 30-minute cache: fundamentals move at most once a quarter, so
    // repeat page views should never wait on Yahoo again.
    const cacheKey = `profile:${symbol.toUpperCase()}`;
    const cached = await getCached<Record<string, unknown>>(cacheKey);
    if (cached) return json({ ...cached, cached: true });

    const modules = [
      "assetProfile", "price", "summaryDetail", "defaultKeyStatistics", "financialData",
      "calendarEvents", "earnings", "earningsHistory", "earningsTrend",
      "incomeStatementHistory", "incomeStatementHistoryQuarterly",
      "balanceSheetHistory", "balanceSheetHistoryQuarterly",
      "cashflowStatementHistory", "cashflowStatementHistoryQuarterly",
      "recommendationTrend",
    ];

    const [q, corporate] = await Promise.all([
      fetchQuoteSummary(symbol, modules).catch(() => null),
      fetchCorporateEvents(symbol).catch(() => ({ dividends: [], splits: [] })),
    ]);

    if (!q) {
      return json({
        symbol,
        error: "NO_FUNDAMENTALS_SOURCE",
        message: "No fundamentals provider currently covers this listing.",
        dividends: corporate.dividends,
        splits: corporate.splits,
      }, 200);
    }

    const ap = q.assetProfile ?? {};
    const p = q.price ?? {};
    const sd = q.summaryDetail ?? {};
    const ks = q.defaultKeyStatistics ?? {};
    const fd = q.financialData ?? {};
    const ce = q.calendarEvents ?? {};

    const earningsDates: string[] = Array.isArray(ce?.earnings?.earningsDate)
      ? ce.earnings.earningsDate.map((d: unknown) => dateOf(d)).filter(Boolean) as string[]
      : [];

    const currency: string | null = p.currency ?? sd.currency ?? null;
    const financialCurrency: string | null = p.financialCurrency ?? fd.financialCurrency ?? null;

    const payload = {
      symbol,
      asOf: new Date().toISOString(),
      currency,
      financialCurrency,
      profile: {
        name: p.longName || p.shortName || symbol,
        exchange: p.fullExchangeName || p.exchangeName || null,
        sector: ap.sector ?? null,
        industry: ap.industry ?? null,
        country: ap.country ?? null,
        website: ap.website ?? null,
        employees: num(ap.fullTimeEmployees),
        description: ap.longBusinessSummary ?? null,
      },
      indicators: {
        price: num(p.regularMarketPrice),
        previousClose: num(sd.previousClose),
        open: num(sd.open),
        dayLow: num(sd.dayLow),
        dayHigh: num(sd.dayHigh),
        week52Low: num(sd.fiftyTwoWeekLow),
        week52High: num(sd.fiftyTwoWeekHigh),
        fiftyDayAverage: num(sd.fiftyDayAverage) ?? num(ks.fiftyDayAverage),
        twoHundredDayAverage: num(sd.twoHundredDayAverage) ?? num(ks.twoHundredDayAverage),
        volume: num(sd.volume),
        averageVolume: num(sd.averageVolume),
        averageVolume10d: num(sd.averageDailyVolume10Day),
        marketCap: num(p.marketCap) ?? num(sd.marketCap),
        enterpriseValue: num(ks.enterpriseValue),
        sharesOutstanding: num(ks.sharesOutstanding),
        floatShares: num(ks.floatShares),
        shortPercentOfFloat: num(ks.shortPercentOfFloat),
        beta: num(sd.beta) ?? num(ks.beta),
        // valuation
        pe: num(sd.trailingPE),
        forwardPe: num(sd.forwardPE) ?? num(ks.forwardPE),
        peg: num(ks.pegRatio),
        pb: num(ks.priceToBook),
        ps: num(sd.priceToSalesTrailing12Months),
        evEbitda: num(ks.enterpriseToEbitda),
        evRevenue: num(ks.enterpriseToRevenue),
        eps: num(ks.trailingEps) ?? num(sd.trailingEps),
        forwardEps: num(ks.forwardEps),
        bookValue: num(ks.bookValue),
        // profitability
        grossMargin: num(fd.grossMargins),
        operatingMargin: num(fd.operatingMargins),
        profitMargin: num(fd.profitMargins),
        ebitdaMargin: num(fd.ebitdaMargins),
        roe: num(fd.returnOnEquity),
        roa: num(fd.returnOnAssets),
        revenueGrowth: num(fd.revenueGrowth),
        earningsGrowth: num(fd.earningsGrowth),
        revenue: num(fd.totalRevenue),
        ebitda: num(fd.ebitda),
        freeCashflow: num(fd.freeCashflow),
        operatingCashflow: num(fd.operatingCashflow),
        // health
        totalCash: num(fd.totalCash),
        totalDebt: num(fd.totalDebt),
        debtToEquity: num(fd.debtToEquity),
        currentRatio: num(fd.currentRatio),
        quickRatio: num(fd.quickRatio),
        // dividend
        dividendRate: num(sd.dividendRate),
        dividendYield: num(sd.dividendYield),
        trailingAnnualDividendRate: num(sd.trailingAnnualDividendRate),
        trailingAnnualDividendYield: num(sd.trailingAnnualDividendYield),
        fiveYearAvgDividendYield: num(sd.fiveYearAvgDividendYield),
        payoutRatio: num(sd.payoutRatio),
        lastDividendValue: num(ks.lastDividendValue),
        lastDividendDate: dateOf(ks.lastDividendDate),
        // analyst
        targetLow: num(fd.targetLowPrice),
        targetMean: num(fd.targetMeanPrice),
        targetHigh: num(fd.targetHighPrice),
        numberOfAnalysts: num(fd.numberOfAnalystOpinions),
        recommendation: fd.recommendationKey ?? null,
      },
      events: {
        nextEarnings: earningsDates[0] ?? null,
        earningsWindow: earningsDates.length > 1 ? earningsDates : null,
        exDividendDate: dateOf(ce.exDividendDate) ?? dateOf(sd.exDividendDate),
        dividendDate: dateOf(ce.dividendDate) ?? dateOf(sd.dividendDate),
        earningsHistory: Array.isArray(q.earningsHistory?.history)
          ? q.earningsHistory.history.map((h: any) => ({
              quarter: dateOf(h.quarter),
              epsActual: num(h.epsActual),
              epsEstimate: num(h.epsEstimate),
              surprisePercent: num(h.surprisePercent),
            }))
          : [],
        estimates: Array.isArray(q.earningsTrend?.trend)
          ? q.earningsTrend.trend.map((t: any) => ({
              period: t.period,
              endDate: t.endDate ?? null,
              epsAvg: num(t.earningsEstimate?.avg),
              revenueAvg: num(t.revenueEstimate?.avg),
              growth: num(t.growth),
            }))
          : [],
      },
      statements: {
        annual: {
          income: rows(q.incomeStatementHistory?.incomeStatementHistory, INCOME_KEYS),
          balance: rows(q.balanceSheetHistory?.balanceSheetStatements, BALANCE_KEYS),
          cash: rows(q.cashflowStatementHistory?.cashflowStatements, CASH_KEYS),
        },
        quarterly: {
          income: rows(q.incomeStatementHistoryQuarterly?.incomeStatementHistory, INCOME_KEYS),
          balance: rows(q.balanceSheetHistoryQuarterly?.balanceSheetStatements, BALANCE_KEYS),
          cash: rows(q.cashflowStatementHistoryQuarterly?.cashflowStatements, CASH_KEYS),
        },
      },
      dividends: corporate.dividends,
      splits: corporate.splits,
    };
    await setCached(cacheKey, "company-profile", symbol, payload, 30 * 60);
    return json(payload);
  } catch (e) {
    console.error("company-profile error", e);
    return json({ error: (e as Error)?.message ?? "Internal error" }, 500);
  }
});
