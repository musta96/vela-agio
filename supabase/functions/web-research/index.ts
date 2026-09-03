import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const query = String(body.query ?? '').trim().slice(0, 300);
    const lane = String(body.lane ?? 'any') as keyof typeof OFFICIAL_DOMAINS;
    const maxResults = Math.min(Math.max(Number(body.max_results ?? 5), 1), 8);
    const fetchPages = body.fetch_pages !== false;
    const extraUrls: string[] = Array.isArray(body.urls) ? body.urls.slice(0, 5).map(String) : [];

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

async function ddg(q: string): Promise<Hit[]> {
  try {
    const r = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ q }),
    });
    if (!r.ok) return [];
    const html = await r.text();
    const out: Hit[] = [];
    const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && out.length < 12) {
      let url = decodeEntities(m[1]);
      const uddg = url.match(/uddg=([^&]+)/);
      if (uddg) url = decodeURIComponent(uddg[1]);
      if (!/^https?:\/\//.test(url)) continue;
      let domain = '';
      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { continue; }
      out.push({ title: stripTags(m[2]).trim().slice(0, 200), url, domain, official: false });
    }
    return out;
  } catch { return []; }
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
