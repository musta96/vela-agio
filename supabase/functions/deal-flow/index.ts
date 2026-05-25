import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getUserDataKey } from '../_shared/data-provider.ts';
import { resolveAIConfig } from '../_shared/ai-provider.ts';

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

async function fetchIpos(authHeader: string | null, from: string, to: string) {
  const fh = await getUserDataKey(authHeader, 'FINNHUB_API_KEY');
  if (fh) {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/calendar/ipo?from=${from}&to=${to}&token=${fh}`);
      if (r.ok) {
        const j = await r.json();
        return (j?.ipoCalendar ?? []).map((d: any) => ({
          symbol: d.symbol, name: d.name, date: d.date, exchange: d.exchange,
          priceRange: d.price, shares: d.numberOfShares, value: d.totalSharesValue,
          source: 'Finnhub',
        }));
      }
    } catch (e) { console.warn('finnhub ipo failed', e); }
  }
  // Fallback: Nasdaq priced IPOs RSS (no key)
  try {
    const r = await fetch('https://api.nasdaq.com/api/ipo/calendar?date=' + from.slice(0, 7), { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.ok) {
      const j = await r.json();
      const priced = j?.data?.priced?.rows ?? [];
      return priced.map((d: any) => ({
        symbol: d.proposedTickerSymbol, name: d.companyName, date: d.pricedDate,
        exchange: d.proposedExchange, priceRange: d.proposedSharePrice, shares: d.sharesOffered, value: d.dollarValueOfSharesOffered,
        source: 'Nasdaq',
      }));
    }
  } catch (e) { console.warn('nasdaq ipo failed', e); }
  return [];
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
  try {
    const auth = req.headers.get('Authorization');
    const { kind = 'all', summarize = false, days = 14 } = await req.json().catch(() => ({}));
    const today = new Date();
    const from = new Date(today.getTime() - days * 86400_000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 30 * 86400_000).toISOString().slice(0, 10);
    const cacheKey = `${kind}:${days}`;

    const result: any = {};
    if (kind === 'ipo' || kind === 'all') {
      result.ipos = await cached('ipo', cacheKey, 30, () => fetchIpos(auth, from, to));
    }
    if (kind === 'ma' || kind === 'all') {
      result.ma = await cached('ma', cacheKey, 30, () => fetchDeals(auth, '(merger OR acquisition OR "to acquire") AND (deal OR announced)', 'ma'));
    }
    if (kind === 'lbo' || kind === 'all') {
      result.lbo = await cached('lbo', cacheKey, 30, () => fetchDeals(auth, '(leveraged buyout OR LBO OR "take private" OR "private equity buyout")', 'lbo'));
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