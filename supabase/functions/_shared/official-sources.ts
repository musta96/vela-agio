// =====================================================================
// official-sources — direct retrieval from the regulators themselves.
//
// Open-web search engines block datacentre egress, so regulatory
// evidence is pulled from each authority's own machine-readable
// endpoint instead:
//   SEC / CFTC -> federalregister.gov API (title, abstract, document URL)
//   ECB        -> ecb.europa.eu RSS (press releases + publications)
//   IMF        -> imf.org (bot-protected: attempted, else reference links)
// Everything returned here is a primary document from an official
// domain, so callers can cite it verbatim.
// =====================================================================

const UA = 'VelaResearch/1.0 (regulatory analysis; contact: research@vela.ai)';

export type Authority = 'IMF' | 'ECB' | 'FED' | 'SEC' | 'CFTC' | 'Other official';

export interface OfficialDoc {
  authority: Authority;
  title: string;
  url: string;
  domain: string;
  published?: string | null;
  /** Text actually published by the authority (abstract or article body). */
  excerpt: string;
  /** false when only a landing/reference page could be supplied. */
  retrieved: boolean;
}

/** Stable primary-document landing pages, used when live retrieval fails. */
export const REFERENCE_SOURCES: OfficialDoc[] = [
  { authority: 'IMF', title: 'IMF — World Economic Outlook', url: 'https://www.imf.org/en/Publications/WEO', domain: 'imf.org', excerpt: '', retrieved: false },
  { authority: 'IMF', title: 'IMF — Global Financial Stability Report', url: 'https://www.imf.org/en/Publications/GFSR', domain: 'imf.org', excerpt: '', retrieved: false },
  { authority: 'IMF', title: 'IMF — Policy papers', url: 'https://www.imf.org/en/Publications/Policy-Papers', domain: 'imf.org', excerpt: '', retrieved: false },
  { authority: 'ECB', title: 'ECB — Monetary policy decisions', url: 'https://www.ecb.europa.eu/press/govcdec/mopo/html/index.en.html', domain: 'ecb.europa.eu', excerpt: '', retrieved: false },
  { authority: 'SEC', title: 'SEC — Proposed and final rules', url: 'https://www.sec.gov/rules', domain: 'sec.gov', excerpt: '', retrieved: false },
  { authority: 'CFTC', title: 'CFTC — Federal Register rulemakings', url: 'https://www.cftc.gov/LawRegulation/FederalRegister/index.htm', domain: 'cftc.gov', excerpt: '', retrieved: false },
  { authority: 'FED', title: 'Federal Reserve — Monetary policy and FOMC calendar', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', domain: 'federalreserve.gov', excerpt: '', retrieved: false },
];

const clean = (s: string) =>
  s.replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Keyword scoring so a topical query can rank a feed's items. */
export function scoreAgainst(terms: string[], text: string): number {
  const hay = text.toLowerCase();
  return terms.reduce((n, t) => (t.length > 3 && hay.includes(t) ? n + 1 : n), 0);
}

export function keywords(query: string): string[] {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'about', 'their', 'under', 'over', 'analysis', 'impact', 'regulation', 'regulatory']);
  return [...new Set(query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/))]
    .filter((w) => w.length > 3 && !stop.has(w))
    .slice(0, 12);
}

async function get(url: string, timeoutMs = 15_000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctrl.signal });
    if (!r.ok) console.error(`official-sources: ${r.status} for ${url.slice(0, 120)}`);
    return r.ok ? await r.text() : '';
  } catch (e) {
    console.error(`official-sources: fetch failed for ${url.slice(0, 120)}:`, e instanceof Error ? e.message : e);
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/** SEC and CFTC rulemakings via the Federal Register public API. */
export async function federalRegister(
  query: string,
  agency: 'securities-and-exchange-commission' | 'commodity-futures-trading-commission',
  authority: 'SEC' | 'CFTC',
  limit = 3,
): Promise<OfficialDoc[]> {
  const params = new URLSearchParams({
    per_page: String(limit),
    order: 'relevance',
    'fields[]': 'title',
  });
  const url = `https://www.federalregister.gov/api/v1/documents.json?${params.toString()}`
    + `&fields%5B%5D=abstract&fields%5B%5D=html_url&fields%5B%5D=publication_date&fields%5B%5D=type&fields%5B%5D=agencies`
    + `&conditions%5Bterm%5D=${encodeURIComponent(query.slice(0, 120))}`
    + `&conditions%5Bagencies%5D%5B%5D=${agency}`;
  const raw = await get(url);
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    return (j?.results ?? []).slice(0, limit).map((d: Record<string, unknown>) => ({
      authority,
      title: `${String(d.type ?? 'Document')}: ${clean(String(d.title ?? ''))}`.slice(0, 200),
      url: String(d.html_url ?? ''),
      domain: 'federalregister.gov',
      published: (d.publication_date as string) ?? null,
      excerpt: clean(String(d.abstract ?? '')).slice(0, 2000),
      retrieved: true,
    })).filter((d: OfficialDoc) => d.url);
  } catch {
    return [];
  }
}

/** ECB press releases and publications from the ECB's own RSS feeds. */
export async function ecbFeeds(query: string, limit = 3): Promise<OfficialDoc[]> {
  const feeds = ['https://www.ecb.europa.eu/rss/press.html', 'https://www.ecb.europa.eu/rss/pub.html'];
  const terms = keywords(query);
  const items: (OfficialDoc & { score: number })[] = [];
  for (const feed of feeds) {
    const xml = await get(feed);
    if (!xml) continue;
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = m[1];
      const title = clean(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
      const link = clean(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
      const desc = clean(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '');
      const date = clean(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '');
      if (!title || !/^https?:\/\//.test(link)) continue;
      items.push({
        authority: 'ECB', title: title.slice(0, 200), url: link, domain: 'ecb.europa.eu',
        published: date || null, excerpt: desc.slice(0, 2000), retrieved: true,
        score: scoreAgainst(terms, `${title} ${desc}`),
      });
    }
  }
  const ranked = items.sort((a, b) => b.score - a.score);
  // Keep topical hits; if nothing matches, the most recent decisions still
  // carry the current policy stance, so return those rather than nothing.
  const hits = ranked.filter((i) => i.score > 0);
  return (hits.length ? hits : ranked).slice(0, limit).map(({ score: _score, ...doc }) => doc);
}

/**
 * IMF. imf.org sits behind bot protection that rejects datacentre egress,
 * so the live attempt is best-effort and we fall back to the stable
 * publication landing pages rather than fabricating a document URL.
 */
export async function imfDocs(query: string, limit = 2): Promise<OfficialDoc[]> {
  const url = `https://www.imf.org/en/Search#q=${encodeURIComponent(query.slice(0, 80))}&sort=relevancy`;
  const html = await get(url, 10_000);
  const docs: OfficialDoc[] = [];
  if (html && !/Access Denied/i.test(html)) {
    for (const m of html.matchAll(/href="(\/en\/Publications\/[^"#?]+)"[^>]*>([^<]{15,160})</g)) {
      docs.push({
        authority: 'IMF', title: clean(m[2]).slice(0, 200),
        url: `https://www.imf.org${m[1]}`, domain: 'imf.org',
        published: null, excerpt: '', retrieved: true,
      });
      if (docs.length >= limit) break;
    }
  }
  if (docs.length) return docs;
  return REFERENCE_SOURCES.filter((s) => s.authority === 'IMF').slice(0, limit);
}


/** Federal Reserve press releases (monetary policy, supervision, all) from the Fed's own RSS. */
export async function fedFeeds(query: string, limit = 3): Promise<OfficialDoc[]> {
  const feeds = [
    'https://www.federalreserve.gov/feeds/press_monetary.xml',
    'https://www.federalreserve.gov/feeds/press_bcreg.xml',
    'https://www.federalreserve.gov/feeds/press_all.xml',
  ];
  const terms = keywords(query);
  const items: (OfficialDoc & { score: number })[] = [];
  for (const feed of feeds) {
    const xml = await get(feed);
    if (!xml) continue;
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = m[1];
      const title = clean(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
      const link = clean(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
      const desc = clean(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '');
      const date = clean(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '');
      if (!title || !/^https?:\/\//.test(link)) continue;
      items.push({
        authority: 'FED', title: title.slice(0, 200), url: link, domain: 'federalreserve.gov',
        published: date || null, excerpt: desc.slice(0, 2000), retrieved: true,
        score: scoreAgainst(terms, `${title} ${desc}`),
      });
    }
  }
  const seen = new Set<string>();
  const ranked = items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)))
    .sort((a, b) => b.score - a.score);
  const hits = ranked.filter((i) => i.score > 0);
  return (hits.length ? hits : ranked).slice(0, limit).map(({ score: _s, ...doc }) => doc);
}

/**
 * IMF World Economic Outlook figures via the public DataMapper API. imf.org's
 * document pages block datacentre traffic, but the DataMapper endpoint serves
 * the actual WEO projections, so a macro caller gets real IMF numbers rather
 * than a landing-page link.
 */
export async function imfWeo(
  indicators: Array<{ code: string; label: string }> = [
    { code: 'NGDP_RPCH', label: 'Real GDP growth (% y/y)' },
    { code: 'PCPIPCH', label: 'Inflation, average consumer prices (% y/y)' },
  ],
  areas = ['WEOWORLD', 'USA', 'EA', 'ITA'],
): Promise<OfficialDoc[]> {
  const year = new Date().getUTCFullYear();
  const docs: OfficialDoc[] = [];
  for (const ind of indicators) {
    const raw = await get(`https://www.imf.org/external/datamapper/api/v1/${ind.code}?periods=${year},${year + 1}`, 12_000);
    if (!raw) continue;
    try {
      const j = JSON.parse(raw);
      const series = j?.values?.[ind.code] ?? {};
      const parts: string[] = [];
      for (const area of areas) {
        const row = series[area];
        if (!row) continue;
        const vals = [year, year + 1].map((y) => (typeof row[String(y)] === 'number' ? `${y}: ${Number(row[String(y)]).toFixed(1)}%` : null)).filter(Boolean);
        if (vals.length) parts.push(`${area} — ${vals.join(', ')}`);
      }
      if (!parts.length) continue;
      docs.push({
        authority: 'IMF',
        title: `IMF World Economic Outlook — ${ind.label}`,
        url: `https://www.imf.org/external/datamapper/${ind.code}@WEO/WEOWORLD`,
        domain: 'imf.org',
        published: null,
        excerpt: `IMF WEO projections, ${ind.label}: ${parts.join(' | ')}.`,
        retrieved: true,
      });
    } catch { /* keep going */ }
  }
  return docs.length ? docs : REFERENCE_SOURCES.filter((s) => s.authority === 'IMF').slice(0, 2);
}

/**
 * SEC EDGAR full-text search — company filings AND fund documents
 * (N-CSR, N-PORT, 497K prospectuses...). Covers foreign private issuers
 * that file 20-F/6-K, which the ticker-to-CIK map alone often misses.
 */
export async function secFullText(
  query: string,
  opts: { forms?: string[]; limit?: number } = {},
): Promise<OfficialDoc[]> {
  const limit = opts.limit ?? 8;
  const params = new URLSearchParams({ q: `"${query.slice(0, 100)}"` });
  if (opts.forms?.length) params.set('forms', opts.forms.join(','));
  const raw = await get(`https://efts.sec.gov/LATEST/search-index?${params.toString()}`);
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    const hits = j?.hits?.hits ?? [];
    return hits.slice(0, limit).map((h: Record<string, any>) => {
      const src = h._source ?? {};
      const [adsh, doc] = String(h._id ?? '').split(':');
      const cik = String((src.ciks ?? [])[0] ?? '').replace(/^0+/, '');
      const acc = adsh?.replace(/-/g, '') ?? '';
      const url = cik && acc && doc
        ? `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${doc}`
        : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}`;
      return {
        authority: 'SEC' as const,
        title: `${String(src.file_type ?? src.root_form ?? 'Filing')} — ${String((src.display_names ?? [])[0] ?? '').slice(0, 120)}`,
        url,
        domain: 'sec.gov',
        published: (src.file_date as string) ?? (src.period_ending as string) ?? null,
        excerpt: '',
        retrieved: true,
      };
    }).filter((d: OfficialDoc) => d.url);
  } catch {
    return [];
  }
}

/** Retrieve primary documents from the requested authorities for one query. */
export async function gatherOfficialDocs(
  query: string,
  opts: { authorities?: Authority[]; perSource?: number } = {},
): Promise<OfficialDoc[]> {
  const want = new Set<Authority>(opts.authorities ?? ['IMF', 'ECB', 'SEC', 'CFTC']);
  const n = opts.perSource ?? 3;
  const jobs: Array<Promise<OfficialDoc[]>> = [];
  if (want.has('SEC')) jobs.push(federalRegister(query, 'securities-and-exchange-commission', 'SEC', n));
  if (want.has('CFTC')) jobs.push(federalRegister(query, 'commodity-futures-trading-commission', 'CFTC', n));
  if (want.has('ECB')) jobs.push(ecbFeeds(query, n));
  if (want.has('FED')) jobs.push(fedFeeds(query, n));
  if (want.has('IMF')) jobs.push(imfDocs(query, 2).then(async (d) => {
    const weo = await imfWeo();
    const live = weo.filter((w) => w.retrieved);
    return live.length ? [...live, ...d.filter((x) => x.retrieved)] : d;
  }));
  const results = await Promise.all(jobs);
  const seen = new Set<string>();
  return results.flat().filter((d) => {
    if (!d.url || seen.has(d.url)) return false;
    seen.add(d.url);
    return true;
  });
}
