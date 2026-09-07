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
import { lookupIsin } from "../_shared/isin-lookup.ts";
import { computeFundScore } from "../_shared/fund-score.ts";
import { CURATED as INSTRUMENTS } from "../_shared/instrument-master.ts";
import { fetchFtFund, type FTFundData } from "../_shared/ft-funds.ts";

/** Minimal profile for unlisted share classes that only FT covers. */
function ftOnlyPayload(isin: string, ft: FTFundData) {
  const velaScore = computeFundScore({
    quoteType: "MUTUALFUND",
    ter: ft.ter ?? null,
    totalAssets: ft.fundSize ?? null,
    morningstarOverall: ft.morningstarOverall ?? null,
  } as Parameters<typeof computeFundScore>[0]);
  return {
    symbol: isin,
    isin,
    quoteType: "MUTUALFUND",
    asOf: new Date().toISOString(),
    currency: ft.currency,
    source: "ft",
    profile: {
      name: ft.name || isin,
      exchange: null,
      family: null,
      category: ft.morningstarCategory ?? null,
      legalType: ft.fundType ?? null,
      inceptionDate: ft.launchDate ?? null,
      benchmark: null,
      description: null,
      website: null,
      phone: null,
      managers: [],
    },
    keyFacts: {
      price: ft.nav,
      nav: ft.nav,
      changePercent: ft.changePct ?? null,
      totalAssets: ft.fundSize ?? null,
      ter: ft.ter ?? null,
      morningstarOverallRating: ft.morningstarOverall ?? null,
    },
    holdings: { count: 0, top: [], sectorWeights: [], bondRatings: [] },
    performance: { trailing: {}, trailingCategory: {}, annual: [] },
    risk: [],
    fees: { annualReportExpenseRatio: ft.ter ?? null, category: {} },
    ratings: {
      morningstarOverall: ft.morningstarOverall ?? null,
      morningstarCategory: ft.morningstarCategory ?? null,
      morningstarAsOf: ft.morningstarAsOf ?? null,
    },
    velaScore,
    identifiers: {
      isin,
      domicile: ft.domicile ?? null,
      ucits: /ireland|luxembourg/i.test(ft.domicile ?? "") ? true : null,
      replication: null,
      distribution: ft.incomeTreatment ?? null,
    },
    distributions: [],
    splits: [],
  };
}

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
        // Unlisted share class: FT publishes NAV, charges and the
        // Morningstar rating for most European funds Yahoo never sees.
        const ftKey = `fund:v8:${isin}`;
        const ftCached = await getCached<Record<string, unknown>>(ftKey);
        if (ftCached) return json({ ...ftCached, cached: true });
        const ft = await fetchFtFund(isin).catch(() => null);
        if (ft && (ft.nav != null || ft.morningstarOverall != null)) {
          const p = ftOnlyPayload(isin, ft);
          await setCached(ftKey, "fund-profile", isin, p, 30 * 60);
          return json(p);
        }
        return json({
          symbol: raw,
          isin,
          error: "NO_FUND_SOURCE",
          message: "No data provider currently covers this ISIN.",
        });
      }
      symbol = resolved.symbol;
    }

    const cacheKey = `fund:v8:${symbol}`;

    const cached = await getCached<Record<string, unknown>>(cacheKey);
    if (cached) return json({ ...cached, cached: true });

    const modules = [
      "quoteType", "price", "summaryDetail", "defaultKeyStatistics", "assetProfile",
      "fundProfile", "topHoldings", "fundPerformance", "esgScores",
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
    const esg = q.esgScores ?? {};

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

    // ISIN backfill: when the caller passed a ticker we still want the
    // identifier every European investor recognises.
    if (!isin) isin = await lookupIsin(symbol).catch(() => null);

    // Yahoo carries no Morningstar rating for most European listings and
    // often no ongoing charge — FT fills both in when we know the ISIN.
    const ftData = isin ? await fetchFtFund(isin).catch(() => null) : null;

    const perfOverview = perf.performanceOverview ?? {};
    const ratings = {
      morningstarOverall: num(ks.morningStarOverallRating) ?? num(perfOverview.morningStarOverallRating)
        ?? ftData?.morningstarOverall ?? null,
      morningstarRisk: num(ks.morningStarRiskRating) ?? num(perfOverview.morningStarRiskRating),
      morningstarReturn: num(perfOverview.morningStarReturnRating),
      morningstarCategory: fp.categoryName ?? ftData?.morningstarCategory ?? null,
      morningstarAsOf: ftData?.morningstarAsOf ?? null,
      esgTotal: num(esg.totalEsg),
      esgEnvironment: num(esg.environmentScore),
      esgSocial: num(esg.socialScore),
      esgGovernance: num(esg.governanceScore),
      esgPeerGroup: esg.peerGroup ?? null,
      esgPercentile: num(esg.percentile),
      sustainability: num(esg.sustainabilityScore),
    };


    const topWeightSum = Array.isArray(th.holdings)
      ? th.holdings.slice(0, 10).reduce((s: number, h: any) => s + ((num(h.holdingPercent) ?? 0)), 0)
      : null;
    const risk3y = riskStats.find((r) => String(r.period ?? "").startsWith("3")) ?? riskStats[0] ?? null;
    const worstAnnual = annualReturns.length
      ? Math.min(...annualReturns.map((r) => (r.fund ?? 0)))
      : null;
    // Reference data is curated per listing, but the same fund trades on
    // several venues (VWCE.DE / VWCE.MI / VWCE.AS share ISIN IE00BK5BQT80),
    // so fall back to an ISIN match before giving up on TER/domicile/UCITS.
    const master = INSTRUMENTS[symbol]
      ?? (isin ? Object.values(INSTRUMENTS).find((r) => r.isin && r.isin === isin) ?? null : null);
    const terValue = [num(feesData.annualReportExpenseRatio), num(feesData.netExpRatio), num(feesData.grossExpRatio), num(ks.annualReportExpenseRatio)]
      .find((v) => v != null && v > 0) ?? master?.ter ?? null;

    const velaScore = computeFundScore({
      quoteType,
      ter: terValue,
      categoryTer: num(feesCat.annualReportExpenseRatio),
      stdDev3y: risk3y?.stdDev ?? null,
      beta3y: risk3y?.beta ?? num(ks.beta3Year),
      sharpe3y: risk3y?.sharpeRatio ?? null,
      worstAnnualReturn: worstAnnual,
      return3y: num(trailing.threeYear) ?? num(ks.threeYearAverageReturn),
      return5y: num(trailing.fiveYear) ?? num(ks.fiveYearAverageReturn),
      category3y: num(trailingCat.threeYear),
      category5y: num(trailingCat.fiveYear),
      totalAssets: num(sd.totalAssets) ?? num(ks.totalAssets)
        ?? (num(feesData.totalNetAssets) != null ? (num(feesData.totalNetAssets) as number) * 1e6 : null),
      inceptionDate: dateOf(ks.fundInceptionDate),
      morningstarOverall: ratings.morningstarOverall,
      topHoldingsWeight: topWeightSum,
      holdingsCount: Array.isArray(th.holdings) ? th.holdings.length : null,
      sectorCount: weights(th.sectorWeightings).filter((s) => (s.weight ?? 0) > 0).length || null,
    });

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
        // Yahoo reports fund net assets either directly or, for many UCITS
        // ETFs, only inside the fee module in millions of the fund currency.
        totalAssets: num(sd.totalAssets) ?? num(ks.totalAssets)
          ?? (num(feesData.totalNetAssets) != null ? (num(feesData.totalNetAssets) as number) * 1e6 : null),
        // Reuse the resolved TER (Yahoo modules first, curated instrument
        // master as fallback). A literal 0 means "Yahoo has no figure" for a
        // fund, never a free fund — surface it as unknown instead of 0.00%.
        ter: terValue,
        yield: num(sd.yield) ?? num(ks.yield),
        trailingAnnualDividendYield: num(sd.trailingAnnualDividendYield),
        ytdReturn: [num(sd.ytdReturn), num(ks.ytdReturn), num(trailing.ytd)].find((v) => v != null && v !== 0) ?? null,
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
      ratings,
      velaScore,
      identifiers: {
        isin,
        domicile: master?.domicile ?? null,
        ucits: master?.ucits ?? null,
        replication: master?.replication ?? null,
        distribution: master?.distribution ?? null,
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
