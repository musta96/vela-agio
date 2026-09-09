import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// =====================================================================
// web-research — live source retrieval for the Copilot.
// Searches the open web (DuckDuckGo HTML endpoint, no key required),
// prioritises official / primary sources, fetches the pages and returns
// cleaned excerpts with URLs so the assistant can cite real evidence.
// =====================================================================

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

/** Primary/official domains, grouped so the model can request a lane. */
const OFFICIAL_DOMAINS: Record<string, string[]> = {
  macro: ['imf.org', 'worldbank.org', 'federalreserve.gov', 'ecb.europa.eu', 'bis.org', 'oecd.org',
    'iea.org', 'eurostat.ec.europa.eu', 'istat.it', 'bancaditalia.it', 'bea.gov', 'bls.gov'],
  regulatory: ['eur-lex.europa.eu', 'ec.europa.eu', 'esma.europa.eu', 'consob.it', 'sec.gov',
    'finra.org', 'cftc.gov', 'federalregister.gov', 'gazzettaufficiale.it', 'bankingsupervision.europa.eu'],
  company: ['sec.gov', 'investor.gov', 'annualreports.com', 'londonstockexchange.com', 'borsaitaliana.it'],
  fund: ['vanguard.com', 'ishares.com', 'invesco.com', 'xtrackers.com', 'amundi.com', 'ssga.com',
    'justetf.com', 'morningstar.com'],
  derivatives: ['cmegroup.com', 'eurex.com', 'theocc.com', 'cboe.com', 'finra.org', 'sec.gov', 'cftc.gov'],
  tax: ['irs.gov', 'agenziaentrate.gov.it', 'oecd.org', 'ec.europa.eu'],
  any: [],
};

interface Hit { title: string; url: string; domain: string; official: boolean; excerpt?: string }

/** Reject non-public targets so this function cannot be used as an SSRF proxy. */
function isSafePublicUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host === '0.0.0.0' || host === '::1' || host === '::') return false;
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return false; // IPv6 ULA / link-local
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false; // cloud metadata service
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a >= 224) return false; // multicast / reserved
  }
  return true;
}

/** Require a signed-in caller (user JWT) or a trusted service-role invocation. */
async function isAuthorized(req: Request): Promise<boolean> {
  const header = req.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) return false;
  const token = header.slice(7).trim();
  if (!token) return false;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey && token === serviceKey) return true;
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb.auth.getClaims(token);
    return !error && !!data?.claims?.sub;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!(await isAuthorized(req))) return json({ error: 'Unauthorized' }, 401);
  try {
    const body = await req.json();
    const query = String(body.query ?? '').trim().slice(0, 300);
    const lane = String(body.lane ?? 'any') as keyof typeof OFFICIAL_DOMAINS;
    const maxResults = Math.min(Math.max(Number(body.max_results ?? 5), 1), 8);
    const fetchPages = body.fetch_pages !== false;
    const extraUrls: string[] = Array.isArray(body.urls)
      ? body.urls.slice(0, 5).map(String).filter(isSafePublicUrl)
      : [];

    if (!query && !extraUrls.length) return json({ error: 'Provide a query or urls[].' }, 400);

    const official = OFFICIAL_DOMAINS[lane] ?? [];
    let hits: Hit[] = [];

    if (query) {
      // 1) restricted pass over official domains for the lane, 2) open pass.
      const queries: string[] = [];
      if (official.length) {
        const siteExpr = official.slice(0, 6).map((d) => `site:${d}`).join(' OR ');
        queries.push(`${query} (${siteExpr})`);
      }
      queries.push(query);
      for (const q of queries) {
        const found = await ddg(q);
        hits.push(...found);
        if (hits.length >= maxResults * 2) break;
      }
    }
    for (const u of extraUrls) {
      try { hits.unshift({ title: u, url: u, domain: new URL(u).hostname, official: true }); } catch { /* skip */ }
    }

    // dedupe + rank (official first)
    const seen = new Set<string>();
    hits = hits.filter((h) => {
      if (seen.has(h.url)) return false;
      seen.add(h.url);
      return true;
    }).map((h) => ({ ...h, official: h.official || official.some((d) => h.domain.endsWith(d)) }))
      .sort((a, b) => Number(b.official) - Number(a.official))
      .slice(0, maxResults);

    if (fetchPages) {
      await Promise.all(hits.map(async (h) => { h.excerpt = await readable(h.url); }));
    }

    return json({
      query, lane,
      retrieved_at: new Date().toISOString(),
      sources: hits.map((h) => ({
        title: h.title, url: h.url, domain: h.domain,
        primary_source: h.official,
        excerpt: h.excerpt?.slice(0, 4000) ?? null,
      })),
      note: hits.length
        ? 'Cite these URLs verbatim. Excerpts are raw page text — verify figures before restating them.'
        : 'No sources retrieved. Say so explicitly rather than inventing citations.',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'research failed';
    console.error('web-research error:', msg);
    return json({ error: msg }, 500);
  }
});

/** Multi-engine search: DuckDuckGo HTML, DDG Lite, then Mojeek. */
async function ddg(q: string): Promise<Hit[]> {
  const engines = [
    async () => {
      const r = await fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
        body: new URLSearchParams({ q }),
      });
      return r.ok ? await r.text() : '';
    },
    async () => {
      const r = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
      });
      return r.ok ? await r.text() : '';
    },
    async () => {
      const r = await fetch(`https://www.mojeek.com/search?q=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
      });
      return r.ok ? await r.text() : '';
    },
    // Proxied fallbacks — datacentre egress is often blocked by the engines.
    async () => proxied(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`),
    async () => proxied(`https://www.mojeek.com/search?q=${encodeURIComponent(q)}`),
  ];
  for (const run of engines) {
    try {
      const html = await run();
      const hits = parseResults(html);
      if (hits.length) return hits;
    } catch { /* next engine */ }
  }
  return [];
}

async function proxied(target: string): Promise<string> {
  for (const p of [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://r.jina.ai/${target}`,
  ]) {
    try {
      const r = await fetch(p, { headers: { 'User-Agent': UA } });
      if (r.ok) {
        const t = await r.text();
        if (t.length > 500) return t;
      }
    } catch { /* next */ }
  }
  return '';
}

/** Generic anchor harvest that works across the HTML search endpoints. */
function parseResults(html: string): Hit[] {
  if (!html) return [];
  const out: Hit[] = [];
  const seen = new Set<string>();
  const re = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]{0,300}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 15) {
    let url = decodeEntities(m[1]);
    const uddg = url.match(/uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (!isSafePublicUrl(url)) continue;
    let domain = '';
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { continue; }
    // Drop engine chrome / social links.
    if (/duckduckgo\.com|mojeek\.com|google\.|bing\.com|facebook\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|reddit\.com|pinterest\./i.test(domain)) continue;
    const title = decodeEntities(stripTags(m[2])).replace(/\s+/g, ' ').trim();
    if (title.length < 12) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ title: title.slice(0, 200), url, domain, official: false });
  }
  return out;
}

async function readable(url: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/pdf,*/*' }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return `[fetch failed: HTTP ${r.status}]`;
    const type = r.headers.get('content-type') ?? '';
    if (type.includes('pdf')) return '[PDF document — open the URL directly; text extraction not available here]';
    const html = await r.text();
    const main = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
    return decodeEntities(stripTags(main)).replace(/\s+/g, ' ').trim().slice(0, 6000);
  } catch (e) {
    return `[fetch failed: ${e instanceof Error ? e.message : 'error'}]`;
  }
}

function stripTags(s: string) { return s.replace(/<[^>]*>/g, ' '); }
function decodeEntities(s: string) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/');
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
