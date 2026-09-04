// Fineco-style ETF / mutual-fund data sheet for any listing, worldwide.
//
// Returns in one call:
//   • profile       — name, category, family, legal type, inception, benchmark
//   • keyFacts      — price/NAV, AUM, TER, yield, 52w range, volume, beta
//   • holdings      — top holdings, sector weights, asset & bond allocation
//   • performance   — trailing + annual returns vs category
//   • risk          — alpha, beta, r², std dev, Sharpe, Treynor (3/5/10y)
//   • fees          — expense ratios and loads vs category averages
//   • distributions — dividend / capital-gain history from chart events
//
// Source: Yahoo quoteSummary fund modules (global coverage: .MI .L .DE .PA
// .AS .SW .TO .AX and 0P00… mutual-fund NAV lines resolved from ISIN).
// Missing modules degrade gracefully — each block is independent.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { fetchQuoteSummary, fetchCorporateEvents } from "../_shared/fundamentals.ts";
import { getCached, setCached } from "../_shared/profile-cache.ts";
import { isIsin, resolveIsin } from "../_shared/isin-resolver.ts";

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

const FUND_TYPES = new Set(["ETF", "MUTUALFUND", "FUND", "MONEYMARKET"]);

function weights(list: unknown): { name: string; weight: number | null }[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((row: any) => {
      const key = Object.keys(row ?? {})[0];
      if (!key) return null;
      return { name: key, weight: num(row[key]) };
    })
    .filter(Boolean) as { name: string; weight: number | null }[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const raw = String(body.symbol ?? url.searchParams.get("symbol") ?? "").trim();
    if (!raw) return json({ error: "symbol required" }, 400);

    // Mutual funds are addressable by ISIN only — resolve to a Yahoo symbol.
    let symbol = raw.toUpperCase();
    let isin: string | null = null;
    if (isIsin(symbol)) {
      isin = symbol;
      const resolved = await resolveIsin(symbol).catch(() => null);
      if (!resolved) {
        return json({
          symbol: raw,
          isin,
          error: "NO_FUND_SOURCE",
          message: "No data provider currently covers this ISIN.",
        });
      }
      symbol = resolved.symbol;
    }

    const cacheKey = `fund:v2:${symbol}`;
    const cached = await getCached<Record<string, unknown>>(cacheKey);
    if (cached) return json({ ...cached, cached: true });

    const modules = [
      "quoteType", "price", "summaryDetail", "defaultKeyStatistics", "assetProfile",
      "fundProfile", "topHoldings", "fundPerformance",
    ];

    const [q, corporate] = await Promise.all([
      fetchQuoteSummary(symbol, modules).catch(() => null),
      fetchCorporateEvents(symbol).catch(() => ({ dividends: [], splits: [] })),
    ]);

    if (!q) {
      return json({
        symbol, isin,
        error: "NO_FUND_SOURCE",
        message: "No data provider currently covers this listing.",
        distributions: corporate.dividends,
      });
    }

    const qt = q.quoteType ?? {};
    const p = q.price ?? {};
    const sd = q.summaryDetail ?? {};
    const ks = q.defaultKeyStatistics ?? {};
    const ap = q.assetProfile ?? {};
    const fp = q.fundProfile ?? {};
    const th = q.topHoldings ?? {};
    const perf = q.fundPerformance ?? {};

    const quoteType: string = (qt.quoteType || p.quoteType || "").toUpperCase();
    if (quoteType && !FUND_TYPES.has(quoteType)) {
      return json({ symbol, isin, quoteType, error: "NOT_A_FUND", message: "This listing is not a fund or ETF." });
    }

    const feesData = fp.feesExpensesInvestment ?? {};
    const feesCat = fp.feesExpensesInvestmentCat ?? {};
    const trailing = perf.trailingReturns ?? {};
    const trailingCat = perf.trailingReturnsCat ?? {};

    const riskStats = Array.isArray(perf.riskOverviewStatistics?.riskStatistics)
      ? perf.riskOverviewStatistics.riskStatistics.map((r: any) => ({
          period: r.year ?? null,
          alpha: num(r.alpha),
          beta: num(r.beta),
          meanAnnualReturn: num(r.meanAnnualReturn),
          rSquared: num(r.rSquared),
          stdDev: num(r.stdDev),
          sharpeRatio: num(r.sharpeRatio),
          treynorRatio: num(r.treynorRatio),
        }))
      : [];

    const annualReturns = Array.isArray(perf.annualTotalReturns?.returns)
      ? perf.annualTotalReturns.returns.map((r: any) => ({
          year: r.year ?? null,
          fund: num(r.annualValue),
          category: num(r.categoryAnnualValue ?? r.annualValueCat),
        }))
      : [];

    const payload = {
      symbol,
      isin,
      quoteType: quoteType || "FUND",
      asOf: new Date().toISOString(),
      currency: p.currency ?? sd.currency ?? null,
      profile: {
        name: p.longName || p.shortName || qt.longName || symbol,
        exchange: p.fullExchangeName || qt.fullExchangeName || p.exchangeName || null,
        family: fp.family ?? ap.family ?? null,
        category: fp.categoryName ?? ap.categoryName ?? null,
        legalType: fp.legalType ?? qt.legalType ?? null,
        inceptionDate: dateOf(ks.fundInceptionDate),
        benchmark: fp.brandingScheme ?? null,
        description: ap.longBusinessSummary ?? fp.longBusinessSummary ?? null,
        website: ap.website ?? null,
        phone: ap.phone ?? null,
        managers: Array.isArray(ap.companyOfficers)
          ? ap.companyOfficers.map((o: any) => o?.name).filter(Boolean)
          : [],
      },
      keyFacts: {
        price: num(p.regularMarketPrice),
        previousClose: num(sd.previousClose) ?? num(p.regularMarketPreviousClose),
        change: num(p.regularMarketChange),
        changePercent: num(p.regularMarketChangePercent),
        nav: num(sd.navPrice) ?? num(ks.navPrice),
        week52Low: num(sd.fiftyTwoWeekLow),
        week52High: num(sd.fiftyTwoWeekHigh),
        fiftyDayAverage: num(sd.fiftyDayAverage),
        twoHundredDayAverage: num(sd.twoHundredDayAverage),
        volume: num(sd.volume),
        averageVolume: num(sd.averageVolume),
        totalAssets: num(sd.totalAssets) ?? num(ks.totalAssets),
        ter: [num(feesData.annualReportExpenseRatio), num(feesData.netExpRatio), num(feesData.grossExpRatio), num(ks.annualReportExpenseRatio)]
          .find((v) => v != null && v > 0) ?? num(feesData.annualReportExpenseRatio) ?? null,
        yield: num(sd.yield) ?? num(ks.yield),
        trailingAnnualDividendYield: num(sd.trailingAnnualDividendYield),
        ytdReturn: num(sd.ytdReturn) ?? num(ks.ytdReturn) ?? num(trailing.ytd),
        beta3Year: num(ks.beta3Year) ?? num(sd.beta3Year),
        threeYearAverageReturn: num(ks.threeYearAverageReturn),
        fiveYearAverageReturn: num(ks.fiveYearAverageReturn),
        morningstarOverallRating: num(ks.morningStarOverallRating),
        morningstarRiskRating: num(ks.morningStarRiskRating),
      },
      holdings: {
        count: Array.isArray(th.holdings) ? th.holdings.length : 0,
        top: Array.isArray(th.holdings)
          ? th.holdings.map((h: any) => ({
              symbol: h.symbol ?? null,
              name: h.holdingName ?? null,
              weight: num(h.holdingPercent),
            }))
          : [],
        sectorWeights: weights(th.sectorWeightings),
        bondRatings: weights(th.bondRatings),
        assetAllocation: {
          cash: num(th.cashPosition),
          stocks: num(th.stockPosition),
          bonds: num(th.bondPosition),
          preferred: num(th.preferredPosition),
          convertible: num(th.convertiblePosition),
          other: num(th.otherPosition),
        },
        equityStats: {
          priceToEarnings: num(th.equityHoldings?.priceToEarnings),
          priceToBook: num(th.equityHoldings?.priceToBook),
          priceToSales: num(th.equityHoldings?.priceToSales),
          priceToCashflow: num(th.equityHoldings?.priceToCashflow),
          medianMarketCap: num(th.equityHoldings?.medianMarketCap),
          threeYearEarningsGrowth: num(th.equityHoldings?.threeYearEarningsGrowth),
        },
        bondStats: {
          duration: num(th.bondHoldings?.duration),
          maturity: num(th.bondHoldings?.maturity),
          creditQuality: th.bondHoldings?.creditQuality ?? null,
        },
      },
      performance: {
        trailing: {
          ytd: num(trailing.ytd), oneMonth: num(trailing.oneMonth), threeMonth: num(trailing.threeMonth),
          oneYear: num(trailing.oneYear), threeYear: num(trailing.threeYear),
          fiveYear: num(trailing.fiveYear), tenYear: num(trailing.tenYear),
          lastBullMkt: num(trailing.lastBullMkt), lastBearMkt: num(trailing.lastBearMkt),
        },
        trailingCategory: {
          ytd: num(trailingCat.ytd), oneMonth: num(trailingCat.oneMonth), threeMonth: num(trailingCat.threeMonth),
          oneYear: num(trailingCat.oneYear), threeYear: num(trailingCat.threeYear),
          fiveYear: num(trailingCat.fiveYear), tenYear: num(trailingCat.tenYear),
        },
        annual: annualReturns,
      },
      risk: riskStats,
      fees: {
        annualReportExpenseRatio: num(feesData.annualReportExpenseRatio),
        netExpRatio: num(feesData.netExpRatio),
        grossExpRatio: num(feesData.grossExpRatio),
        frontEndSalesLoad: num(feesData.frontEndSalesLoad),
        deferredSalesLoad: num(feesData.deferredSalesLoad),
        twelveBOne: num(feesData.twelveBOne),
        totalNetAssets: num(feesData.totalNetAssets),
        projectionValues: feesData.projectionValues ?? null,
        category: {
          annualReportExpenseRatio: num(feesCat.annualReportExpenseRatio),
          frontEndSalesLoad: num(feesCat.frontEndSalesLoad),
          deferredSalesLoad: num(feesCat.deferredSalesLoad),
          twelveBOne: num(feesCat.twelveBOne),
        },
      },
      distributions: corporate.dividends,
      splits: corporate.splits,
    };

    await setCached(cacheKey, "fund-profile", symbol, payload, 30 * 60);
    return json(payload);
  } catch (e) {
    console.error("fund-profile error", e);
    return json({ error: (e as Error)?.message ?? "Internal error" }, 500);
  }
});
