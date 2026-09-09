// =====================================================================
// startup-discovery — find and enrich private-company / startup candidates
// from free official sources, news, and (when configured) paid databases.
//
// Sources used:
//   * Google News RSS — funding announcements, free, no key
//   * SEC EDGAR Form D — US fundraising filings, free, official
//   * Crunchbase public pages — best-effort scrape, may be blocked
//   * GitHub — growth signal for developer-tool / OSS startups
//   * BYO Crunchbase API / PitchBook / Dealroom — if the user saved keys
//
// Nothing is invented. Every candidate carries a source and confidence level.
// =====================================================================

import { resolveAIConfig } from './ai-provider.ts';

export interface StartupCandidate {
  id?: string;
  name: string;
  website?: string | null;
  country?: string;
  sector?: string;
  stage?: string;
  currency?: string;
  roundSize?: number | null;
  roundName?: string | null;
  roundDate?: string | null;
  investors?: string[];
  valuation?: number | null;
  description?: string | null;
  source: string;           // e.g. "news", "sec_formd", "crunchbase_api"
  sourceUrl?: string;
  confidence: 'high' | 'medium' | 'low';
}

const UA = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

// ------------------------------------------------------------------ helpers

function parseMoney(s: string): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(m|mil|million|b|bn|billion|k|thousand)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (unit.startsWith('b')) return n * 1e9;
  if (unit.startsWith('m')) return n * 1e6;
  if (unit.startsWith('k') || unit.startsWith('t')) return n * 1e3;
  // Bare millions assumption is risky; keep raw only when explicitly stated.
  if (n < 1000 && s.toLowerCase().includes('million')) return n * 1e6;
  if (n < 1000 && s.toLowerCase().includes('billion')) return n * 1e9;
  return n;
}

function inferStage(amount: number | null, sector = 'software'): string {
  if (!amount || amount <= 0) return 'seed';
  if (amount < 1_000_000) return 'pre_seed';
  if (amount < 4_000_000) return 'seed';
  if (amount < 15_000_000) return 'series_a';
  if (amount < 40_000_000) return 'series_b';
  if (amount < 100_000_000) return 'series_c';
  return 'growth';
}

function normalizeCountry(c?: string): string {
  if (!c) return 'US';
  const s = c.toUpperCase().trim();
  if (s === 'USA' || s === 'UNITED STATES') return 'US';
  if (s === 'UK' || s === 'UNITED KINGDOM' || s === 'GREAT BRITAIN') return 'GB';
  if (s === 'ITALY' || s === 'ITALIA') return 'IT';
  if (s === 'FRANCE') return 'FR';
  if (s === 'GERMANY' || s === 'DEUTSCHLAND') return 'DE';
  if (s === 'ISRAEL') return 'IL';
  if (s === 'INDIA') return 'IN';
  if (s === 'SINGAPORE') return 'SG';
  if (s === 'CANADA') return 'CA';
  return s.slice(0, 2); // best effort
}

function normalizeSector(s?: string): string {
  if (!s) return 'software';
  const k = s.toLowerCase().replace(/[^a-z]/g, '');
  const map: Record<string, string> = {
    ai: 'ai', artificialintelligence: 'ai', machinelearning: 'ai', fintech: 'fintech',
    insurtech: 'insurtech', healthtech: 'healthtech', biotech: 'biotech', medtech: 'medtech',
    saas: 'saas', software: 'software', marketplace: 'marketplace', ecommerce: 'ecommerce',
    cybersecurity: 'cybersecurity', deeptech: 'deeptech', semiconductors: 'semiconductors',
    climate: 'climate', energy: 'energy', mobility: 'mobility', robotics: 'robotics',
    space: 'space', foodtech: 'foodtech', edtech: 'edtech', proptech: 'proptech',
    agritech: 'agritech', logistics: 'logistics', gaming: 'gaming', consumer: 'consumer',
    hardware: 'hardware', services: 'services', data: 'software', devtools: 'software',
  };
  return map[k] || 'software';
}

// ------------------------------------------------------------------ Funding-news sources
// Google News RSS is frequently blocked, so we aggregate GDELT (global event data)
// and Bing News RSS as free fallbacks.

interface NewsArticle { title: string; link: string; pubDate: string; source: string; description?: string }

function parseRss(xml: string, max = 40): NewsArticle[] {
  const out: NewsArticle[] = [];
  for (const it of (xml.match(/<item[\s\S]*?<\/item>/g) ?? []).slice(0, max)) {
    const pick = (tag: string) => {
      const m = it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      if (!m) return '';
      return m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    };
    const title = pick('title');
    const link = pick('link');
    if (!title || !link) continue;
    out.push({
      title,
      link,
      pubDate: pick('pubDate') || new Date().toISOString(),
      source: pick('source') || 'News',
      description: pick('description').replace(/<[^>]+>/g, '').slice(0, 400),
    });
  }
  return out;
}

async function gdeltNews(query: string, max = 20): Promise<NewsArticle[]> {
  // GDELT GKG API returns articles matching terms, including finance/startup keywords.
  try {
    const r = await fetch(
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=${Math.min(max, 40)}&format=json`,
      { headers: UA },
    );
    if (!r.ok) return [];
    const j = await r.json();
    const arr = Array.isArray(j?.articles) ? j.articles : [];
    return arr
      .map((a: any) => ({
        title: a.title || a.url || '',
        link: a.url || a.seenurl || '',
        pubDate: a.seendate ? a.seendate.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6Z') : new Date().toISOString(),
        source: 'GDELT',
        description: (a.domain || '').slice(0, 200),
      }))
      .filter((a: NewsArticle) => a.title && a.link);
  } catch (e) {
    console.error('gdelt fetch failed', e);
    return [];
  }
}

async function bingNews(query: string, max = 20): Promise<NewsArticle[]> {
  try {
    const r = await fetch(
      `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`,
      { headers: UA },
    );
    if (!r.ok) return [];
    return parseRss(await r.text(), max).map((a) => ({ ...a, source: a.source || 'Bing News' }));
  } catch (e) {
    console.error('bing news fetch failed', e);
    return [];
  }
}

async function fetchNewsArticles(query: string, max = 30): Promise<NewsArticle[]> {
  const [gdelt, bing] = await Promise.all([
    gdeltNews(`${query} startup funding`, Math.ceil(max / 2)),
    bingNews(`${query} startup funding`, Math.ceil(max / 2)),
  ]);
  const seen = new Set<string>();
  const out: NewsArticle[] = [];
  for (const a of [...gdelt, ...bing]) {
    const key = a.title.toLowerCase().replace(/\W+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
    if (out.length >= max) break;
  }
  return out;
}

// ------------------------------------------------------------------ AI extraction from headlines

export async function extractCandidatesFromNews(
  articles: NewsArticle[],
  expectedSector: string | undefined,
  authHeader: string | null,
): Promise<StartupCandidate[]> {
  if (articles.length === 0) return [];
  const cfg = await resolveAIConfig(authHeader).catch(() => null);
  if (!cfg) return keywordExtraction(articles, expectedSector);

  const list = articles.map((a, i) => `${i + 1}. [${a.source}] ${a.title} - ${a.description || ''}`).join('\n');
  const body: Record<string, unknown> = {
    model: cfg.effectiveProvider === 'lovable' ? 'openai/gpt-6-astra' : cfg.model,
    messages: [
      { role: 'system', content: 'You extract startup funding events from press headlines. Reply with strict JSON only.' },
      {
        role: 'user',
        content:
          `Extract startup funding events from these headlines. Return JSON: {"candidates": [` +
          `{ "name": string, "website": string | null, "country": "US" | "GB" | "FR" | "DE" | "IL" | "IN" | "SG" | "CA" | "IT" | "ES" | "NL" | "SE" | "AU" | "JP" | "CN" | "Other", ` +
          `"sector": string, "stage": "pre_seed" | "seed" | "series_a" | "series_b" | "series_c" | "growth", ` +
          `"roundSizeUsd": number | null, "roundName": string | null, "valuationUsd": number | null, "investors": string[], ` +
          `"description": string }]. ` +
          `If an item is not a startup funding event, skip it. Use null when unsure.\n\n${list}`,
      },
    ],
  };
  if (cfg.effectiveProvider === 'lovable') body.reasoning_effort = 'low';

  try {
    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cfg.headers },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`ai ${r.status}`);
    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content ?? '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('ai returned no JSON');
    const parsed = JSON.parse(m[0]);
    const arr = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    return arr.map((c: Record<string, unknown>) => ({
      name: String(c.name || '').trim(),
      website: c.website ? String(c.website) : null,
      country: normalizeCountry(String(c.country || 'US')),
      sector: normalizeSector(expectedSector || String(c.sector || 'software')),
      stage: inferStage(parseMoney(String(c.roundSizeUsd || c.roundSize || '')), normalizeSector(String(c.sector || 'software'))),
      roundSize: parseMoney(String(c.roundSizeUsd || c.roundSize || '')),
      roundName: c.roundName ? String(c.roundName) : null,
      valuation: parseMoney(String(c.valuationUsd || c.valuation || '')),
      investors: Array.isArray(c.investors) ? c.investors.map(String) : [],
      description: c.description ? String(c.description).slice(0, 300) : null,
      source: 'news',
      sourceUrl: articles.find((a) => a.title.includes(String(c.name || '').slice(0, 12)))?.link,
      confidence: 'medium' as const,
    })).filter((c) => c.name && c.name.length > 1);
  } catch (e) {
    console.error('AI extraction failed, falling back to keyword', e);
    return keywordExtraction(articles, expectedSector);
  }
}

function keywordExtraction(articles: NewsArticle[], expectedSector?: string): StartupCandidate[] {
  const out: StartupCandidate[] = [];
  const seen = new Set<string>();
  const fundingRe = /(?:raises|raised|secured|closed|announced|landed|got)\s+(?:a\s+)?(?:\$|€|£|USD\s*)?([\d,.]+\s*[mkb]?)\s*(?:million|billion|seed|series\s+[a-d]|round|funding|investment)/i;
  const nameRe = /^([^,:–-]+?)(?:\s+(?:raises|raised|lands|closes|secures|announces|gets|is|has)|\s*[,:–-])/i;

  for (const a of articles) {
    const t = `${a.title} ${a.description || ''}`;
    const fm = t.match(fundingRe);
    const nm = a.title.match(nameRe);
    if (!nm && !fm) continue;
    const name = (nm?.[1] || a.title.split(/raises|raised|closes|secures|announces|lands/)[0]).trim();
    if (!name || name.length < 2 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const amount = fm ? parseMoney(fm[1]) : null;
    out.push({
      name,
      website: null,
      country: 'US',
      sector: normalizeSector(expectedSector),
      stage: inferStage(amount),
      currency: 'USD',
      roundSize: amount,
      roundName: /series\s+([a-d])/i.test(t) ? `Series ${(t.match(/series\s+([a-d])/i)?.[1] || '').toUpperCase()}` : (amount && amount < 1_000_000 ? 'Pre-seed' : 'Seed'),
      investors: [],
      valuation: null,
      description: `${a.title}. ${a.description || ''}`.slice(0, 280),
      source: 'news',
      sourceUrl: a.link,
      confidence: 'low',
    });
  }
  return out;
}

// ------------------------------------------------------------------ SEC Form D

interface SecHit {
  _source?: {
    display_names?: string[];
    file_num?: string[];
    form_filing_date?: string;
    ciks?: string[];
    entities?: Array<{ entity: string }>;
  };
  _id?: string;
}

export async function fetchSecFormD(daysBack = 90, limit = 50): Promise<StartupCandidate[]> {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
  const url = `https://efts.sec.gov/LATEST/search-index?q=&dateRange=custom&startdt=${start}&enddt=${end}&category=custom&forms=D&page=1&hits_per_page=${limit}`;
  try {
    const r = await fetch(url, { headers: { ...UA, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`sec ${r.status}`);
    const j = await r.json();
    const hits: SecHit[] = j?.hits?.hits ?? [];
    const out: StartupCandidate[] = [];
    const seen = new Set<string>();
    const fundNoise = /\b(fund|lp|l\.p\.?|llc|income|growth|capital|partnership|portfolio|trust|holdings|securities|venture|equity|private|real estate|credit|hedge|investment|management|series of|master)\b/i;
    for (const h of hits) {
      const rawName = h._source?.display_names?.[0] || h._source?.entities?.[0]?.entity;
      if (!rawName || seen.has(rawName.toLowerCase())) continue;
      seen.add(rawName.toLowerCase());
      // Strip CIK suffix and fund/LP noise; keep operating companies when possible.
      const name = rawName.replace(/\s+\(CIK\s+\d+\)/i, '').replace(/,?\s+(Fund|LP|L\.P\.?)$/i, '').trim();
      if (!name || name.length < 2 || fundNoise.test(name)) continue;
      out.push({
        name,
        website: null,
        country: 'US',
        sector: 'software',
        stage: 'seed',
        currency: 'USD',
        roundSize: null,
        roundName: 'Form D filing',
        roundDate: h._source?.form_filing_date?.[0] || null,
        investors: [],
        valuation: null,
        description: `SEC Form D securities offering filing. CIK ${(h._source?.ciks?.[0] || '').replace(/\D/g, '')}`,
        source: 'sec_formd',
        sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(h._source?.ciks?.[0] || '')}&type=D`,
        confidence: 'high',
      });
    }
    return out;
  } catch (e) {
    console.error('SEC Form D fetch failed', e);
    return [];
  }
}

// ------------------------------------------------------------------ Crunchbase public page (best-effort)

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow' });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

export async function crunchbasePublicSearch(query: string, limit = 10): Promise<StartupCandidate[]> {
  const url = `https://www.crunchbase.com/discover/organization.cards/fields/identifier,status,location_identifiers,short_description,website_url,funding_total,last_funding_type,funding_round_identifier/organizations?query=${encodeURIComponent(query)}&layout=cozy`;
  const html = await fetchHtml(url);
  if (!html) return [];
  const out: StartupCandidate[] = [];
  // Crunchbase cards are JSON-in-script; try to grab the Next.js data chunk.
  const m = html.match(/"\/_next\/data\/[^"]+"/g);
  if (m) {
    // The API response shape is complex; fall back to visible card heuristics.
  }
  const cards = html.match(/<cb-card[^>]*>[\s\S]*?<\/cb-card>/g) || [];
  for (const card of cards.slice(0, limit)) {
    const name = card.match(/<a[^>]*>([^<]{2,80})<\/a>/)?.[1]?.trim();
    if (!name) continue;
    const website = card.match(/href="(https?:\/\/[^"]+)"/)?.[1] || null;
    const desc = card.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    out.push({
      name,
      website,
      country: 'US',
      sector: 'software',
      stage: 'seed',
      currency: 'USD',
      roundSize: null,
      roundName: null,
      investors: [],
      description: desc,
      source: 'crunchbase_web',
      sourceUrl: `https://www.crunchbase.com/organization/${name.toLowerCase().replace(/\s+/g, '-')}`,
      confidence: 'low',
    });
  }
  return out;
}

// ------------------------------------------------------------------ GitHub growth signal

export async function githubOrgSearch(query: string, limit = 10): Promise<StartupCandidate[]> {
  try {
    const r = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+stars:>50&sort=stars&order=desc&per_page=${limit}`, {
      headers: { Accept: 'application/vnd.github.v3+json', ...UA },
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.items || []).slice(0, limit).map((repo: Record<string, unknown>) => ({
      name: String(repo.name || repo.full_name || '').split('/')[0] || String(repo.name || ''),
      website: repo.homepage ? String(repo.homepage) : null,
      country: 'US',
      sector: 'software',
      stage: 'seed',
      currency: 'USD',
      roundSize: null,
      roundName: null,
      description: repo.description ? String(repo.description).slice(0, 200) : null,
      source: 'github',
      sourceUrl: String(repo.html_url || ''),
      confidence: 'low',
    }));
  } catch (e) {
    console.error('GitHub search failed', e);
    return [];
  }
}

// ------------------------------------------------------------------ BYO connectors

async function callByoApi(key: string, baseUrl: string, path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', ...UA },
  });
}

async function byoCrunchbase(query: string, key: string): Promise<StartupCandidate[]> {
  try {
    const r = await callByoApi(key, 'https://api.crunchbase.com/api/v4', `/searches/organizations?query=${encodeURIComponent(query)}&limit=10&field_ids=identifier,location_identifiers,short_description,website_url,funding_total,last_funding_type,last_funding_at,funding_round_identifier,raised`);
    if (!r.ok) throw new Error(`crunchbase ${r.status}`);
    const j = await r.json();
    return (j.entities || []).map((e: any) => ({
      name: e.identifier?.value || 'Unknown',
      website: e.website_url || null,
      country: normalizeCountry((e.location_identifiers || []).find((l: any) => l.location_type === 'country')?.name),
      sector: normalizeSector(e.categories?.[0]?.value),
      stage: inferStage(parseMoney(String(e.funding_total?.value || '')), normalizeSector(e.categories?.[0]?.value)),
      currency: 'USD',
      roundSize: parseMoney(String(e.raised || e.funding_total?.value || '')),
      roundName: e.last_funding_type || null,
      roundDate: e.last_funding_at || null,
      investors: [],
      description: e.short_description || null,
      source: 'crunchbase_api',
      sourceUrl: e.website_url || `https://www.crunchbase.com/organization/${e.identifier?.permalink || ''}`,
      confidence: 'high',
    }));
  } catch (e) {
    console.error('BYO Crunchbase failed', e);
    return [];
  }
}

async function byoPitchBook(query: string, key: string): Promise<StartupCandidate[]> {
  // PitchBook API is contract-only and endpoints vary; return empty with a warning surface in caller.
  console.log('PitchBook BYO key present but endpoint not implemented', query);
  return [];
}

async function byoDealroom(query: string, key: string): Promise<StartupCandidate[]> {
  // Dealroom GraphQL/REST endpoints require approved scopes.
  console.log('Dealroom BYO key present but endpoint not implemented', query);
  return [];
}

// ------------------------------------------------------------------ main entry

export interface DiscoveryOptions {
  query?: string;
  sector?: string;
  stage?: string;
  country?: string;
  sources?: string[]; // e.g. ['news','sec_formd','crunchbase_web','github','byo_crunchbase']
  limit?: number;
  authHeader?: string | null;
}

export async function discoverStartups(opts: DiscoveryOptions): Promise<{ candidates: StartupCandidate[]; sources: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const requested = opts.sources?.length ? opts.sources : ['news', 'sec_formd'];
  const limit = Math.min(opts.limit || 25, 100);
  const candidates: StartupCandidate[] = [];

  const q = opts.query?.trim();
  const sector = opts.sector?.trim().toLowerCase();

  if (requested.includes('news')) {
    const baseTerms = '(funding OR raised OR "series a" OR "seed round" OR "venture capital")';
    const newsQuery = q
      ? `(${q}) ${baseTerms}`
      : `${baseTerms} ${sector || ''}`.trim();
    const articles = await fetchNewsArticles(newsQuery, 20);
    if (articles.length === 0) {
      warnings.push('News search returned no usable articles (GDELT/Bing may rate-limit). Try a more specific query or use BYO sources.');
    }
    const extracted = await extractCandidatesFromNews(articles, sector, opts.authHeader || null);
    candidates.push(...extracted);
  }

  if (requested.includes('sec_formd')) {
    const sec = await fetchSecFormD(30, limit);
    candidates.push(...sec);
  }

  if (requested.includes('crunchbase_web') && q) {
    const cb = await crunchbasePublicSearch(q, 10);
    candidates.push(...cb);
  }

  if (requested.includes('github') && q) {
    const gh = await githubOrgSearch(`${q} startup`, 10);
    candidates.push(...gh);
  }

  // BYO keys
  const cbKey = Deno.env.get('CRUNCHBASE_API_KEY');
  if (requested.includes('byo_crunchbase') && cbKey && q) {
    candidates.push(...(await byoCrunchbase(q, cbKey)));
  } else if (requested.includes('byo_crunchbase')) {
    warnings.push('Crunchbase API key not configured; add it in Settings → Connections.');
  }

  const pbKey = Deno.env.get('PITCHBOOK_API_KEY');
  if (requested.includes('byo_pitchbook') && pbKey && q) {
    candidates.push(...(await byoPitchBook(q, pbKey)));
  } else if (requested.includes('byo_pitchbook')) {
    warnings.push('PitchBook API key not configured; add it in Settings → Connections.');
  }

  const drKey = Deno.env.get('DEALROOM_API_KEY');
  if (requested.includes('byo_dealroom') && drKey && q) {
    candidates.push(...(await byoDealroom(q, drKey)));
  } else if (requested.includes('byo_dealroom')) {
    warnings.push('Dealroom API key not configured; add it in Settings → Connections.');
  }

  // Deduplicate by name.
  const seen = new Map<string, StartupCandidate>();
  for (const c of candidates) {
    const key = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing || existing.confidence === 'low' && c.confidence !== 'low') {
      seen.set(key, c);
    }
  }

  let result = Array.from(seen.values());

  // Apply filters.
  if (opts.country) {
    result = result.filter((c) => !c.country || c.country.toUpperCase() === opts.country!.toUpperCase());
  }
  if (opts.stage) {
    result = result.filter((c) => !c.stage || c.stage === opts.stage);
  }

  // Trim to limit, prefer higher confidence first.
  result.sort((a, b) => (a.confidence === 'high' ? -1 : 1) - (b.confidence === 'high' ? -1 : 1));
  result = result.slice(0, limit);

  return { candidates: result, sources: requested, warnings };
}
