import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getUserDataKey } from '../_shared/data-provider.ts';
import { resolveAIConfig } from '../_shared/ai-provider.ts';
import { resolveAiAccess, aiDeniedResponse } from '../_shared/ai-access.ts';
import { isAiOptedOut } from '../_shared/ai-opt-out.ts';

// =====================================================================
// DEAL-FLOW — aggregates M&A, IPO and LBO deals.
//   - IPOs: Finnhub IPO calendar (BYO key) → fallback to Nasdaq RSS.
//   - M&A:  NewsAPI / Marketaux keyword filter (BYO key) → fallback to
//           Google News RSS for "merger OR acquisition".
//   - LBOs: same as M&A but tagged by AI heuristics.
// Optional AI summary via Lovable Gateway. Results cached in
// `deal_flow_cache` for 30 minutes (admin/service-side write).
// =====================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function cached<T>(kind: 'ma' | 'ipo' | 'lbo', key: string, ttlMin: number, fetcher: () => Promise<T>): Promise<T> {
  const sb = admin();
  const { data } = await sb.from('deal_flow_cache').select('payload, expires_at').eq('cache_key', `${kind}:${key}`).maybeSingle();
  if (data && new Date(data.expires_at).getTime() > Date.now()) return data.payload as T;
  const payload = await fetcher();
  await sb.from('deal_flow_cache').upsert({
    kind, cache_key: `${kind}:${key}`, payload,
    expires_at: new Date(Date.now() + ttlMin * 60_000).toISOString(),
  }, { onConflict: 'cache_key' });
  return payload;
}

// Well-known issuers with active/rumored IPO filings that the Nasdaq +
// Finnhub calendars sometimes miss (e.g. confidential DRS filings or
// non-US-listed prospects). If any of these names are absent from the
// primary pull we escalate to SEC EDGAR full-text search below.
const KNOWN_UPCOMING_ISSUERS = [
  'Bending Spoons',
  'Klarna',
  'Stripe',
  'Databricks',
  'Discord',
  'Shein',
  'Canva',
  'Revolut',
  'Ramp',
  'Cerebras',
];

async function fetchIpos(authHeader: string | null, from: string, to: string) {
  const out: any[] = [];

  // Primary #1: Finnhub calendar (BYO key)
  const fh = await getUserDataKey(authHeader, 'FINNHUB_API_KEY');
  if (fh) {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/calendar/ipo?from=${from}&to=${to}&token=${fh}`);
      if (r.ok) {
        const j = await r.json();
        for (const d of j?.ipoCalendar ?? []) {
          out.push({
            symbol: d.symbol, name: d.name, date: d.date, exchange: d.exchange,
            priceRange: d.price, shares: d.numberOfShares, value: d.totalSharesValue,
            source: 'Finnhub',
            status: d.date && new Date(d.date) >= new Date() ? 'upcoming' : 'priced',
          });
        }
      }
    } catch (e) { console.warn('finnhub ipo failed', e); }
  }

  // Primary #2: Nasdaq IPO calendar (no key). Current month + next 2, all
  // buckets (upcoming/filed/priced) so future deals surface.
  const months = nextNMonths(3);
  await Promise.all(months.map(async (ym) => {
    try {
      const r = await fetch(`https://api.nasdaq.com/api/ipo/calendar?date=${ym}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) return;
      const j = await r.json();
      const buckets: Array<[any[], string, string]> = [
        [j?.data?.upcoming?.upcomingTable?.rows ?? [], 'upcoming', 'expectedPriceDate'],
        [j?.data?.filed?.rows ?? [], 'filed', 'filedDate'],
        [j?.data?.priced?.rows ?? [], 'priced', 'pricedDate'],
      ];
      for (const [rows, status, dateKey] of buckets) {
        for (const d of rows) {
          out.push({
            symbol: d.proposedTickerSymbol || d.symbol || null,
            name: d.companyName || d.name,
            date: d[dateKey] || d.expectedPriceDate || d.pricedDate || d.filedDate,
            exchange: d.proposedExchange,
            priceRange: d.proposedSharePrice,
            shares: d.sharesOffered,
            value: d.dollarValueOfSharesOffered,
            source: 'Nasdaq',
            status,
          });
        }
      }
    } catch (e) { console.warn('nasdaq ipo failed', ym, e); }
  }));

  // Escalation: for any well-known upcoming issuer missing from the primary
  // pull, hit SEC EDGAR full-text search for their most recent S-1 / F-1 /
  // DRS filing so we still surface a "Filed" entry.
  const names = new Set(out.map((d) => normalizeIssuer(d.name)));
  const missing = KNOWN_UPCOMING_ISSUERS.filter((n) => !names.has(normalizeIssuer(n)));
  if (missing.length) {
    const edgar = await Promise.all(missing.map(fetchEdgarIpoFiling));
    for (const hit of edgar) if (hit) out.push(hit);
  }

  // Dedup by (issuer, date). Prefer richer sources (Nasdaq/Finnhub over EDGAR).
  const rank = (s?: string) => (s === 'Finnhub' ? 3 : s === 'Nasdaq' ? 2 : 1);
  const byKey = new Map<string, any>();
  for (const d of out) {
    const k = `${normalizeIssuer(d.name)}|${d.date ?? ''}`;
    const prev = byKey.get(k);
    if (!prev || rank(d.source) > rank(prev.source)) byKey.set(k, d);
  }
  return [...byKey.values()].sort(sortIposFutureFirst);
}

function normalizeIssuer(name?: string | null): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/\b(inc|incorporated|corp|corporation|ltd|limited|plc|holdings?|group|sa|nv|ag|llc|co)\b\.?/g, '')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// SEC EDGAR full-text search for the issuer's most recent IPO-registration
// filing (S-1 = US domestic, F-1 = foreign private issuer, DRS = confidential
// draft submission). No key required. EDGAR requires a descriptive UA.
async function fetchEdgarIpoFiling(issuer: string): Promise<any | null> {
  try {
    const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${issuer}"`)}&forms=S-1,F-1,DRS,DRS/A,S-1/A,F-1/A`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Vela deal-flow (support@vela.ai)', Accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const hit = j?.hits?.hits?.[0];
    if (!hit) return null;
    const src = hit._source ?? {};
    const form = (src.form ?? '').toString();
    const date = (src.file_date ?? '').toString().slice(0, 10) || null;
    const displayName: string = src.display_names?.[0] ?? issuer;
    // Skip stale filings older than ~18 months — likely not an active IPO.
    if (date && Date.now() - new Date(date).getTime() > 550 * 86400_000) return null;
    return {
      symbol: null,
      name: displayName.replace(/\s*\(CIK.*$/i, '').trim(),
      date,
      exchange: null,
      priceRange: null,
      shares: null,
      value: null,
      source: 'SEC EDGAR',
      status: 'filed',
      formType: form,
    };
  } catch (e) { console.warn('edgar ipo lookup failed', issuer, e); return null; }
}

function nextNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function sortIposFutureFirst(a: any, b: any): number {
  const now = Date.now();
  const ta = a.date ? new Date(a.date).getTime() : 0;
  const tb = b.date ? new Date(b.date).getTime() : 0;
  const aFuture = ta >= now;
  const bFuture = tb >= now;
  if (aFuture && !bFuture) return -1;
  if (!aFuture && bFuture) return 1;
  // Both future: soonest first. Both past: most recent first.
  return aFuture ? ta - tb : tb - ta;
}

async function fetchDeals(authHeader: string | null, query: string, label: 'ma' | 'lbo') {
  const items: any[] = [];
  const newsapi = await getUserDataKey(authHeader, 'NEWSAPI_KEY');
  if (newsapi) {
    try {
      const r = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=25&apiKey=${newsapi}`);
      if (r.ok) {
        const j = await r.json();
        for (const a of j?.articles ?? []) items.push({ title: a.title, source: a.source?.name, url: a.url, date: a.publishedAt, description: a.description, provider: 'NewsAPI' });
      }
    } catch (e) { console.warn('newsapi deals failed', e); }
  }
  if (items.length === 0) {
    try {
      const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`);
      if (r.ok) {
        const xml = await r.text();
        const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 25);
        for (const m of matches) {
          const block = m[1];
          const title = block.match(/<title>(?:<!\[CDATA\[)?([^<\]]+)/)?.[1] ?? '';
          const link = block.match(/<link>([^<]+)<\/link>/)?.[1] ?? '';
          const date = block.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1] ?? '';
          const source = block.match(/<source[^>]*>([^<]+)<\/source>/)?.[1] ?? 'Google News';
          if (title) items.push({ title, source, url: link, date, provider: 'GoogleNews' });
        }
      }
    } catch (e) { console.warn('gnews deals failed', e); }
  }
  return items.map(x => ({ ...x, kind: label }));
}

async function aiSummary(authHeader: string, deals: any[], focus: string) {
  if (deals.length === 0) return null;
  // Hard-respect the user's AI opt-out. The rest of deal-flow (IPO/M&A
  // listings) keeps working because it does NOT call AI — only the
  // optional natural-language summary is skipped.
  if (await isAiOptedOut(authHeader)) return null;
  try {
    const cfg = await resolveAIConfig(authHeader);
    const sample = deals.slice(0, 15).map(d => `- ${d.title ?? d.name} (${d.source ?? d.exchange ?? ''}, ${d.date ?? ''})`).join('\n');
    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST', headers: cfg.headers,
      body: JSON.stringify({ model: cfg.model, messages: [
        { role: 'system', content: 'You are a buy-side analyst. Summarize the latest deal flow in 4-6 crisp bullets. No fluff. Mark uncertainty. End with "Not financial advice."' },
        { role: 'user', content: `Focus: ${focus}\n\n${sample}` },
      ] }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.choices?.[0]?.message?.content ?? null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const __aiAccess = await resolveAiAccess(req.headers.get('Authorization'));
  if (!__aiAccess.allowed) return aiDeniedResponse(__aiAccess, corsHeaders);
  try {
    const auth = req.headers.get('Authorization');
    const { kind = 'all', summarize = false, days = 7 } = await req.json().catch(() => ({}));
    const today = new Date();
    const from = new Date(today.getTime() - days * 86400_000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 90 * 86400_000).toISOString().slice(0, 10);
    // v2 = new "future-first" IPO logic + 90d lookahead; invalidates old cache.
    const cacheKey = `v2:${kind}:${days}`;

    const result: any = {};
    if (kind === 'ipo' || kind === 'all') {
      result.ipos = await cached('ipo', cacheKey, 15, () => fetchIpos(auth, from, to));
    }
    if (kind === 'ma' || kind === 'all') {
      result.ma = await cached('ma', cacheKey, 15, () => fetchDeals(auth, '(merger OR acquisition OR "to acquire") AND (deal OR announced)', 'ma'));
    }
    if (kind === 'lbo' || kind === 'all') {
      result.lbo = await cached('lbo', cacheKey, 15, () => fetchDeals(auth, '(leveraged buyout OR LBO OR "take private" OR "private equity buyout")', 'lbo'));
    }
    if (summarize && auth) {
      const all = [...(result.ipos ?? []), ...(result.ma ?? []), ...(result.lbo ?? [])];
      result.summary = await aiSummary(auth, all, kind);
    }
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});