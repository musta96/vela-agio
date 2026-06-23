import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

/**
 * Universal symbol search using Yahoo Finance's autocomplete endpoint.
 *
 * On top of the raw Yahoo results we:
 *  1. Normalize every result into a coarse `category` bucket
 *     (company | etf | index | fund | crypto | fx | future | other).
 *  2. Score and re-order results so that direct company listings come first,
 *     then ETFs, indices, funds, then everything else. Exact symbol matches
 *     get a strong boost so e.g. typing "AAPL" never hides the equity behind
 *     an option-style ticker.
 *  3. Detect a curated set of well-known PRIVATE companies (SpaceX, OpenAI,
 *     Stripe, ByteDance, Shein, Discord, Anthropic, xAI, Databricks…). When
 *     the query hits one of these, Yahoo will return tangential matches
 *     (e.g. an index *named after* the company, or an ETF that holds it via
 *     a venture sleeve). We attach a `privateCompanyHint` so the UI can
 *     clarify with the user instead of silently routing them to a product
 *     that is not the company they searched for.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) {
      return new Response(JSON.stringify({ results: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const yUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0&listsCount=0`;
    const r = await fetch(yUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) {
      return new Response(JSON.stringify({ results: [], error: `yahoo ${r.status}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const j = await r.json();
    const qLower = q.toLowerCase();
    const qUpper = q.toUpperCase();
    const raw = (j?.quotes ?? []).filter((it: any) => it.symbol && it.quoteType !== 'OPTION');
    const results = raw
      .map((it: any) => {
        const name = it.shortname || it.longname || it.symbol;
        const category = categorize(it.quoteType, it.typeDisp);
        return {
          symbol: it.symbol,
          name,
          exchange: it.exchDisp || it.exchange || '',
          type: it.quoteType || it.typeDisp || '',
          category,
          currency: inferCurrency(it.symbol, it.exchange),
          _score: scoreResult({ symbol: it.symbol, name, category }, qLower, qUpper),
        };
      })
      .sort((a: any, b: any) => b._score - a._score)
      .map(({ _score, ...rest }: any) => rest);

    const privateCompanyHint = detectPrivateCompany(qLower);
    // If the user clearly searched a private company, surface the curated
    // related instruments at the top so the disambiguation UI has something
    // concrete to show even when Yahoo returns noise.
    if (privateCompanyHint) {
      const have = new Set(results.map((r: any) => r.symbol.toUpperCase()));
      for (const rel of privateCompanyHint.related) {
        if (!have.has(rel.symbol.toUpperCase())) {
          results.push({
            symbol: rel.symbol,
            name: rel.name,
            exchange: rel.exchange ?? '',
            type: rel.type,
            category: rel.category,
            currency: 'USD',
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ results, privateCompanyHint }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ results: [], error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

function categorize(quoteType?: string, typeDisp?: string): string {
  const t = (quoteType || typeDisp || '').toUpperCase();
  if (t === 'EQUITY') return 'company';
  if (t === 'ETF') return 'etf';
  if (t === 'INDEX') return 'index';
  if (t === 'MUTUALFUND') return 'fund';
  if (t === 'CRYPTOCURRENCY') return 'crypto';
  if (t === 'CURRENCY') return 'fx';
  if (t === 'FUTURE') return 'future';
  return 'other';
}

const CATEGORY_BASE: Record<string, number> = {
  company: 100, etf: 80, index: 65, fund: 55, crypto: 50, fx: 40, future: 30, other: 10,
};

function scoreResult(it: { symbol: string; name: string; category: string }, qLower: string, qUpper: string): number {
  let s = CATEGORY_BASE[it.category] ?? 10;
  const sym = it.symbol.toUpperCase();
  const name = (it.name || '').toLowerCase();
  if (sym === qUpper) s += 60;
  else if (sym.startsWith(qUpper)) s += 25;
  else if (sym.includes(qUpper)) s += 10;
  if (name === qLower) s += 30;
  else if (name.startsWith(qLower)) s += 15;
  else if (name.includes(qLower)) s += 5;
  // Penalize obvious leveraged / inverse / micro derivatives so they don't
  // outrank the underlying.
  if (/\b(2X|3X|INVERSE|BEAR|BULL|LEVERAGED)\b/i.test(it.name)) s -= 15;
  return s;
}

/**
 * Curated map of well-known private companies whose name people frequently
 * type into a market search. Yahoo will return *something* (usually an index
 * or ETF that merely references the company), and we need to tell the user
 * that no direct listing exists — and what the closest exposure vehicles are.
 */
type RelatedInstrument = { symbol: string; name: string; type: string; category: string; exchange?: string };
const PRIVATE_COMPANIES: Array<{ match: RegExp; canonical: string; related: RelatedInstrument[] }> = [
  {
    match: /\b(space\s*x|spacex)\b/i,
    canonical: 'SpaceX',
    related: [
      { symbol: 'DXYZ', name: 'Destiny Tech100 — holds SpaceX', type: 'CEF', category: 'fund' },
      { symbol: 'ARKX', name: 'ARK Space Exploration & Innovation ETF', type: 'ETF', category: 'etf' },
      { symbol: 'ARKVX', name: 'ARK Venture Fund (SpaceX exposure)', type: 'Fund', category: 'fund' },
    ],
  },
  {
    match: /\b(open\s*ai|openai)\b/i,
    canonical: 'OpenAI',
    related: [
      { symbol: 'MSFT', name: 'Microsoft — large OpenAI stakeholder', type: 'Equity', category: 'company' },
      { symbol: 'ARKVX', name: 'ARK Venture Fund (OpenAI exposure)', type: 'Fund', category: 'fund' },
    ],
  },
  {
    match: /\bstripe\b/i,
    canonical: 'Stripe',
    related: [
      { symbol: 'DXYZ', name: 'Destiny Tech100 — holds Stripe', type: 'CEF', category: 'fund' },
      { symbol: 'ARKVX', name: 'ARK Venture Fund (Stripe exposure)', type: 'Fund', category: 'fund' },
    ],
  },
  {
    match: /\b(byte\s*dance|bytedance|tiktok)\b/i,
    canonical: 'ByteDance',
    related: [
      { symbol: 'KWEB', name: 'KraneShares CSI China Internet ETF', type: 'ETF', category: 'etf' },
    ],
  },
  { match: /\bshein\b/i, canonical: 'Shein', related: [] },
  {
    match: /\bdiscord\b/i, canonical: 'Discord',
    related: [{ symbol: 'DXYZ', name: 'Destiny Tech100 — holds Discord', type: 'CEF', category: 'fund' }],
  },
  {
    match: /\banthropic\b/i, canonical: 'Anthropic',
    related: [
      { symbol: 'GOOGL', name: 'Alphabet — Anthropic investor', type: 'Equity', category: 'company' },
      { symbol: 'AMZN', name: 'Amazon — Anthropic investor', type: 'Equity', category: 'company' },
    ],
  },
  {
    match: /\b(x\s*ai|xai)\b/i, canonical: 'xAI',
    related: [{ symbol: 'TSLA', name: 'Tesla — Elon Musk linked exposure', type: 'Equity', category: 'company' }],
  },
  {
    match: /\bdatabricks\b/i, canonical: 'Databricks',
    related: [{ symbol: 'ARKVX', name: 'ARK Venture Fund (Databricks exposure)', type: 'Fund', category: 'fund' }],
  },
  {
    match: /\b(epic\s*games)\b/i, canonical: 'Epic Games',
    related: [{ symbol: 'TCEHY', name: 'Tencent — ~40% stake in Epic Games', type: 'Equity', category: 'company' }],
  },
  {
    match: /\b(canva)\b/i, canonical: 'Canva',
    related: [{ symbol: 'DXYZ', name: 'Destiny Tech100 — holds Canva', type: 'CEF', category: 'fund' }],
  },
];

function detectPrivateCompany(qLower: string):
  | { canonical: string; message: string; related: RelatedInstrument[] }
  | null {
  for (const p of PRIVATE_COMPANIES) {
    if (p.match.test(qLower)) {
      const msg = p.related.length
        ? `${p.canonical} is not publicly traded. These instruments offer the closest exposure:`
        : `${p.canonical} is not publicly traded and has no commonly-tracked exposure vehicle on public markets.`;
      return { canonical: p.canonical, message: msg, related: p.related };
    }
  }
  return null;
}

function inferCurrency(symbol: string, exchange?: string): string {
  const s = (symbol || '').toUpperCase();
  if (/\.(MI|DE|PA|AS|BR|MC|LS|VI|HE|IR|F)$/.test(s)) return 'EUR';
  if (s.endsWith('.L') || s.endsWith('.IL')) return 'GBP';
  if (s.endsWith('.SW')) return 'CHF';
  if (s.endsWith('.HK')) return 'HKD';
  if (s.endsWith('.T') || s.endsWith('.JP')) return 'JPY';
  if (s.endsWith('.TO') || s.endsWith('.V')) return 'CAD';
  if (s.endsWith('.AX')) return 'AUD';
  if (s.endsWith('.SS') || s.endsWith('.SZ')) return 'CNY';
  if (s.endsWith('.NS') || s.endsWith('.BO')) return 'INR';
  if (s.endsWith('.SA')) return 'BRL';
  if (s.endsWith('.MX')) return 'MXN';
  if (s.endsWith('-USD') || s.endsWith('=X')) return 'USD';
  if (exchange === 'CCY') return 'USD';
  return 'USD';
}