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

function parseCookies(setCookie: string): string {
  const pairs: string[] = [];
  for (const p of setCookie.split(/,(?=\s*[A-Za-z0-9_-]+=)/)) {
    const kv = p.split(";")[0].trim();
    if (kv && kv.includes("=")) pairs.push(kv);
  }
  return pairs.join("; ");
}

/**
 * Yahoo requires a consent cookie + crumb pair. `finance.yahoo.com` intermittently
 * fails from server runtimes (HTTP/2 protocol errors), so we try the lightweight
 * `fc.yahoo.com` cookie endpoint first and fall back to the main site.
 */
export async function getCrumb(force = false): Promise<{ crumb: string; cookie: string }> {
  if (!force && cachedCrumb && Date.now() - cachedCrumb.at < 30 * 60 * 1000) return cachedCrumb;
  const sources = ["https://fc.yahoo.com/", "https://finance.yahoo.com/"];
  const errors: string[] = [];
  for (const src of sources) {
    try {
      const r = await fetch(src, { headers: { "User-Agent": UA }, redirect: "manual" });
      const cookie = parseCookies(r.headers.get("set-cookie") ?? "");
      if (!cookie) { errors.push(`${src}: no cookie`); continue; }
      const r3 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
        headers: { "User-Agent": UA, Cookie: cookie },
      });
      const crumb = (await r3.text()).trim();
      if (!r3.ok || !crumb || crumb.startsWith("{")) { errors.push(`${src}: crumb ${r3.status}`); continue; }
      cachedCrumb = { crumb, cookie, at: Date.now() };
      return cachedCrumb;
    } catch (e) {
      errors.push(`${src}: ${(e as Error).message}`);
    }
  }
  throw new Error(`yahoo crumb unavailable (${errors.join(" | ")})`);
}

export async function fetchFundamentals(symbol: string): Promise<Fundamentals | null> {
  const modules = ["summaryDetail", "defaultKeyStatistics", "financialData", "price", "assetProfile"].join(",");
  let { crumb, cookie } = await getCrumb();
  const call = () =>
    fetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`,
      { headers: { "User-Agent": UA, Cookie: cookie } },
    );
  let r = await call();
  if (r.status === 401 || r.status === 403) {
    // Stale crumb/cookie — refresh once and retry.
    ({ crumb, cookie } = await getCrumb(true));
    r = await call();
  }
  if (!r.ok) throw new Error(`quoteSummary ${symbol}: ${r.status}`);

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
/**
 * Raw quoteSummary fetch for arbitrary modules (statements, calendar events,
 * earnings history, dividends…). Uses the same cached cookie+crumb session and
 * retries once on an expired crumb. Falls back to query1 when query2 answers
 * with a transport error.
 */
export async function fetchQuoteSummary(
  symbol: string,
  modules: string[],
): Promise<Record<string, any> | null> {
  const mods = modules.join(",");
  let { crumb, cookie } = await getCrumb();
  const call = (host: string) =>
    fetch(
      `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${mods}&crumb=${encodeURIComponent(crumb)}`,
      { headers: { "User-Agent": UA, Cookie: cookie } },
    );
  let r = await call("query2").catch(() => null);
  if (!r || r.status === 401 || r.status === 403) {
    ({ crumb, cookie } = await getCrumb(true));
    r = await call("query1").catch(() => null);
  }
  if (!r || !r.ok) return null;
  const j = await r.json().catch(() => null);
  return j?.quoteSummary?.result?.[0] ?? null;
}

/** Dividend + split history from the free chart endpoint (no crumb needed). */
export async function fetchCorporateEvents(symbol: string, range = "10y") {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=${range}&events=div%2Csplit`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!r.ok) return { dividends: [], splits: [] };
    const j = await r.json();
    const ev = j?.chart?.result?.[0]?.events ?? {};
    const dividends = Object.values(ev.dividends ?? {}).map((d: any) => ({
      date: new Date(d.date * 1000).toISOString().slice(0, 10),
      amount: d.amount as number,
    })).sort((a, b) => b.date.localeCompare(a.date));
    const splits = Object.values(ev.splits ?? {}).map((s: any) => ({
      date: new Date(s.date * 1000).toISOString().slice(0, 10),
      ratio: s.splitRatio as string,
    })).sort((a, b) => b.date.localeCompare(a.date));
    return { dividends, splits };
  } catch {
    return { dividends: [], splits: [] };
  }
}
