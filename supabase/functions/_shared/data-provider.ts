// Server-side helper: read user-stored data-provider API keys via keys-vault.
// Lets analyses (sentiment, technical, fundamental, deep, briefing) prefer the
// user's BYO key when available and fall back to free / public sources.

const CACHE = new Map<string, { value: string | null; at: number }>();
const TTL_MS = 60_000;

export async function getUserDataKey(authHeader: string | null, provider: string): Promise<string | null> {
  if (!authHeader) return null;
  const cacheKey = `${authHeader.slice(-20)}:${provider}`;
  const hit = CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const url = Deno.env.get('SUPABASE_URL');
  if (!url) return null;
  try {
    const r = await fetch(`${url}/functions/v1/keys-vault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ action: 'reveal', provider }),
    });
    if (!r.ok) { CACHE.set(cacheKey, { value: null, at: Date.now() }); return null; }
    const j = await r.json();
    const value: string | null = j?.value ?? null;
    CACHE.set(cacheKey, { value, at: Date.now() });
    return value;
  } catch {
    return null;
  }
}

/** Fetch multiple keys at once. Returns a map keyed by provider id. */
export async function getUserDataKeys(authHeader: string | null, providers: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  await Promise.all(providers.map(async p => { out[p] = await getUserDataKey(authHeader, p); }));
  return out;
}

// =============================================================
//  Concrete provider fetchers (Phase 2 — BYO data generalization)
//  Each helper:
//    - returns []/null silently if no user key is configured
//    - never throws (network failures are logged + swallowed)
//    - returns a normalized shape the analyses can merge with free sources
// =============================================================

export interface ProviderArticle {
  title: string;
  link: string;
  source: string;        // human label (e.g. "NewsAPI: Reuters")
  pubDate: string;       // RFC date string
  description?: string;
  sentiment?: number;    // -1..1 if the provider tags it
}

const baseTicker = (s: string) => s.split('.')[0];

/** NewsAPI.org — top headlines mentioning the ticker/name. */
export async function fetchNewsApiArticles(authHeader: string | null, symbol: string, name?: string): Promise<ProviderArticle[]> {
  const key = await getUserDataKey(authHeader, 'NEWSAPI_KEY');
  if (!key) return [];
  const q = encodeURIComponent(`${baseTicker(symbol)} ${name ?? ''}`.trim());
  const url = `https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=publishedAt&pageSize=15&apiKey=${key}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = await r.json();
    return (j?.articles ?? []).map((a: any) => ({
      title: a.title ?? '',
      link: a.url ?? '',
      source: `NewsAPI: ${a.source?.name ?? 'Unknown'}`,
      pubDate: a.publishedAt ?? new Date().toISOString(),
      description: a.description ?? '',
    })).filter((x: ProviderArticle) => x.title && x.link);
  } catch (e) { console.warn('NewsAPI failed', e); return []; }
}

/** Marketaux — financial news with entity-level sentiment scoring. */
export async function fetchMarketauxArticles(authHeader: string | null, symbol: string): Promise<ProviderArticle[]> {
  const key = await getUserDataKey(authHeader, 'MARKETAUX_API_KEY');
  if (!key) return [];
  const url = `https://api.marketaux.com/v1/news/all?symbols=${encodeURIComponent(baseTicker(symbol))}&language=en&filter_entities=true&limit=15&api_token=${key}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = await r.json();
    return (j?.data ?? []).map((a: any) => ({
      title: a.title ?? '',
      link: a.url ?? '',
      source: `Marketaux: ${a.source ?? 'Unknown'}`,
      pubDate: a.published_at ?? new Date().toISOString(),
      description: a.description ?? a.snippet ?? '',
      sentiment: typeof a.entities?.[0]?.sentiment_score === 'number' ? a.entities[0].sentiment_score : undefined,
    })).filter((x: ProviderArticle) => x.title && x.link);
  } catch (e) { console.warn('Marketaux failed', e); return []; }
}

/** Finnhub — company news. */
export async function fetchFinnhubArticles(authHeader: string | null, symbol: string): Promise<ProviderArticle[]> {
  const key = await getUserDataKey(authHeader, 'FINNHUB_API_KEY');
  if (!key) return [];
  const to = new Date(); const from = new Date(to.getTime() - 14 * 24 * 3600 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(baseTicker(symbol))}&from=${fmt(from)}&to=${fmt(to)}&token=${key}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const arr = await r.json();
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 20).map((a: any) => ({
      title: a.headline ?? '',
      link: a.url ?? '',
      source: `Finnhub: ${a.source ?? 'News'}`,
      pubDate: new Date((a.datetime ?? Date.now() / 1000) * 1000).toISOString(),
      description: a.summary ?? '',
    })).filter((x: ProviderArticle) => x.title && x.link);
  } catch (e) { console.warn('Finnhub news failed', e); return []; }
}

/** Benzinga — analyst-action and news headlines (RapidAPI-compatible token works too). */
export async function fetchBenzingaArticles(authHeader: string | null, symbol: string): Promise<ProviderArticle[]> {
  const key = await getUserDataKey(authHeader, 'BENZINGA_API_KEY');
  if (!key) return [];
  const url = `https://api.benzinga.com/api/v2/news?tickers=${encodeURIComponent(baseTicker(symbol))}&pageSize=15&token=${key}`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) return [];
    const arr = await r.json();
    if (!Array.isArray(arr)) return [];
    return arr.map((a: any) => ({
      title: a.title ?? '',
      link: a.url ?? '',
      source: 'Benzinga',
      pubDate: a.created ?? new Date().toISOString(),
      description: (a.teaser ?? '').replace(/<[^>]+>/g, '').slice(0, 400),
    })).filter((x: ProviderArticle) => x.title && x.link);
  } catch (e) { console.warn('Benzinga failed', e); return []; }
}

/** Aggregator: pull from every configured BYO news provider in parallel. */
export async function fetchAllByoNews(authHeader: string | null, symbol: string, name?: string): Promise<ProviderArticle[]> {
  const lists = await Promise.all([
    fetchNewsApiArticles(authHeader, symbol, name),
    fetchMarketauxArticles(authHeader, symbol),
    fetchFinnhubArticles(authHeader, symbol),
    fetchBenzingaArticles(authHeader, symbol),
  ]);
  return lists.flat();
}

// ---------- Fundamentals enrichment ----------

export interface ProviderFundamentals {
  source: string;
  data: Record<string, unknown>;
}

/** Financial Modeling Prep — company profile + key metrics. */
export async function fetchFmpFundamentals(authHeader: string | null, symbol: string): Promise<ProviderFundamentals | null> {
  const key = await getUserDataKey(authHeader, 'FMP_API_KEY');
  if (!key) return null;
  const sym = baseTicker(symbol);
  try {
    const [profileR, metricsR, ratiosR] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v3/profile/${sym}?apikey=${key}`),
      fetch(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${sym}?apikey=${key}`),
      fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${sym}?apikey=${key}`),
    ]);
    const profile = profileR.ok ? (await profileR.json())?.[0] : null;
    const metrics = metricsR.ok ? (await metricsR.json())?.[0] : null;
    const ratios = ratiosR.ok ? (await ratiosR.json())?.[0] : null;
    if (!profile && !metrics && !ratios) return null;
    return { source: 'FinancialModelingPrep', data: { profile, metrics, ratios } };
  } catch (e) { console.warn('FMP fundamentals failed', e); return null; }
}

/** Alpha Vantage — company overview (PE, PEG, ROE, margins, etc). */
export async function fetchAlphaVantageOverview(authHeader: string | null, symbol: string): Promise<ProviderFundamentals | null> {
  const key = await getUserDataKey(authHeader, 'ALPHA_VANTAGE_API_KEY');
  if (!key) return null;
  const sym = baseTicker(symbol);
  try {
    const r = await fetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${sym}&apikey=${key}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j.Symbol) return null;
    return { source: 'AlphaVantage', data: j };
  } catch (e) { console.warn('AlphaVantage overview failed', e); return null; }
}

/** Aggregator: pull fundamentals from any configured BYO fundamentals provider. */
export async function fetchAllByoFundamentals(authHeader: string | null, symbol: string): Promise<ProviderFundamentals[]> {
  const lists = await Promise.all([
    fetchFmpFundamentals(authHeader, symbol),
    fetchAlphaVantageOverview(authHeader, symbol),
  ]);
  return lists.filter((x): x is ProviderFundamentals => !!x);
}