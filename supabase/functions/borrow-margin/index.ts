import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { getBorrowQuote, getMarginProfile } from '../_shared/borrow-margin.ts';
import { marketForSymbol } from '../_shared/market-registry.ts';

// POST { symbols: string[], assetClass?: 'equity'|'future' }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const symbols: string[] = (Array.isArray(body.symbols) ? body.symbols : [body.symbol])
      .filter(Boolean).map((s: unknown) => String(s).toUpperCase()).slice(0, 25);
    if (!symbols.length) return json({ error: 'symbols required' }, 400);
    const assetClass = String(body.assetClass ?? 'equity');

    const records = await Promise.all(symbols.map(async (s) => {
      const mkt = marketForSymbol(s);
      const country = mkt.country === '??' ? 'US' : mkt.country;
      const borrow = await getBorrowQuote(s, country);
      return { symbol: s, market: mkt.market, country, borrow, margin: getMarginProfile(s, country, assetClass) };
    }));

    return json({
      records,
      sources: [
        'Interactive Brokers public shortable-shares / borrow-fee files (ftp3.interactivebrokers.com/shortstock)',
        'Federal Reserve Regulation T, FINRA Rule 4210',
        'MiFID II broker haircuts, EU Short Selling Regulation 236/2012',
        'CME / Eurex SPAN margin methodology',
      ],
      note: 'Borrow rates are indicative end-of-day broker data and change intraday; hard-to-borrow names can be recalled at any time.',
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'failed' }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
