import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

/**
 * Universal symbol search using Yahoo Finance's autocomplete endpoint.
 * Covers ~150k instruments worldwide: stocks, ETFs, bonds (mostly via funds),
 * mutual funds, futures, indices, currencies, crypto — across every exchange
 * Yahoo tracks (US, Milan .MI, Xetra .DE, London .L, Paris .PA, Amsterdam .AS,
 * Hong Kong .HK, Tokyo .T, Toronto .TO, ASX .AX, etc.).
 *
 * No API key required.
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
    const results = (j?.quotes ?? [])
      .filter((it: any) => it.symbol && it.quoteType !== 'OPTION')
      .map((it: any) => ({
        symbol: it.symbol,
        name: it.shortname || it.longname || it.symbol,
        exchange: it.exchDisp || it.exchange || '',
        type: it.quoteType || it.typeDisp || '',
        currency: inferCurrency(it.symbol, it.exchange),
      }));
    return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ results: [], error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

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