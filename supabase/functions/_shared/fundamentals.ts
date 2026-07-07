/**
 * Shared Yahoo Finance quoteSummary fundamentals fetcher used by
 * `nl-screener` and `thematic-deepdive`. The Yahoo endpoints require a
 * cookie + crumb pair, which we cache for 30 minutes.
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface Fundamentals {
  symbol: string;
  name: string;
  sector?: string;
  industry?: string;
  exchange?: string;
  currency?: string;
  price: number | null;
  marketCap: number | null;
  pe: number | null;
  forwardPe: number | null;
  peg: number | null;
  pb: number | null;
  ps: number | null;
  evEbitda: number | null;
  divYield: number | null;
  payout: number | null;
  roe: number | null;
  roa: number | null;
  grossMargin: number | null;
  opMargin: number | null;
  netMargin: number | null;
  revGrowth: number | null;
  earningsGrowth: number | null;
  debtEquity: number | null;
  currentRatio: number | null;
  beta: number | null;
  fcf: number | null;
  targetMean: number | null;
  recommendation?: string;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "object" && v && typeof (v as { raw?: number }).raw === "number") {
    return (v as { raw: number }).raw;
  }
  return null;
}

let cachedCrumb: { crumb: string; cookie: string; at: number } | null = null;
export async function getCrumb(): Promise<{ crumb: string; cookie: string }> {
  if (cachedCrumb && Date.now() - cachedCrumb.at < 30 * 60 * 1000) return cachedCrumb;
  const r2 = await fetch("https://finance.yahoo.com/", {
    headers: { "User-Agent": UA },
    redirect: "manual",
  });
  const sc = r2.headers.get("set-cookie") ?? "";
  const cookiePairs: string[] = [];
  for (const p of sc.split(/,(?=\s*[A-Za-z0-9_-]+=)/)) {
    const kv = p.split(";")[0].trim();
    if (kv && kv.includes("=")) cookiePairs.push(kv);
  }
  const cookie = cookiePairs.join("; ");
  const r3 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie },
  });
  if (!r3.ok) throw new Error(`crumb ${r3.status}`);
  const crumb = (await r3.text()).trim();
  cachedCrumb = { crumb, cookie, at: Date.now() };
  return cachedCrumb;
}

export async function fetchFundamentals(symbol: string): Promise<Fundamentals | null> {
  const modules = ["summaryDetail", "defaultKeyStatistics", "financialData", "price", "assetProfile"].join(",");
  const { crumb, cookie } = await getCrumb();
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } });
  if (!r.ok) return null;
  const j = await r.json();
  const q = j?.quoteSummary?.result?.[0];
  if (!q) return null;
  const sd = q.summaryDetail ?? {};
  const ks = q.defaultKeyStatistics ?? {};
  const fd = q.financialData ?? {};
  const p = q.price ?? {};
  const ap = q.assetProfile ?? {};
  return {
    symbol,
    name: p.longName || p.shortName || symbol,
    sector: ap.sector,
    industry: ap.industry,
    exchange: p.exchangeName || p.fullExchangeName,
    currency: p.currency,
    price: num(p.regularMarketPrice),
    marketCap: num(p.marketCap),
    pe: num(sd.trailingPE),
    forwardPe: num(sd.forwardPE) ?? num(ks.forwardPE),
    peg: num(ks.pegRatio),
    pb: num(ks.priceToBook),
    ps: num(sd.priceToSalesTrailing12Months),
    evEbitda: num(ks.enterpriseToEbitda),
    divYield: num(sd.dividendYield),
    payout: num(sd.payoutRatio),
    roe: num(fd.returnOnEquity),
    roa: num(fd.returnOnAssets),
    grossMargin: num(fd.grossMargins),
    opMargin: num(fd.operatingMargins),
    netMargin: num(fd.profitMargins),
    revGrowth: num(fd.revenueGrowth),
    earningsGrowth: num(fd.earningsGrowth),
    debtEquity: num(fd.debtToEquity),
    currentRatio: num(fd.currentRatio),
    beta: num(sd.beta),
    fcf: num(fd.freeCashflow),
    targetMean: num(fd.targetMeanPrice),
    recommendation: fd.recommendationKey,
  };
}