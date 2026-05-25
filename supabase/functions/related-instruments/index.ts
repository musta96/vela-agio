import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

async function yahooMeta(symbol: string) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile,price,summaryDetail`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.quoteSummary?.result?.[0] ?? null;
  } catch { return null; }
}

async function yahooRecommendations(symbol: string): Promise<string[]> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v6/finance/recommendationsbysymbol/${encodeURIComponent(symbol)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const j = await r.json();
    const items: any[] = j?.finance?.result?.[0]?.recommendedSymbols ?? [];
    return items.map((x) => x.symbol).filter(Boolean);
  } catch { return []; }
}

const SECTOR_ETF: Record<string, { symbol: string; name: string }> = {
  'Technology': { symbol: 'XLK', name: 'Tech Select Sector SPDR' },
  'Financial Services': { symbol: 'XLF', name: 'Financial Select Sector SPDR' },
  'Healthcare': { symbol: 'XLV', name: 'Health Care Select SPDR' },
  'Energy': { symbol: 'XLE', name: 'Energy Select Sector SPDR' },
  'Consumer Cyclical': { symbol: 'XLY', name: 'Consumer Discretionary SPDR' },
  'Consumer Defensive': { symbol: 'XLP', name: 'Consumer Staples SPDR' },
  'Industrials': { symbol: 'XLI', name: 'Industrial Select SPDR' },
  'Utilities': { symbol: 'XLU', name: 'Utilities Select SPDR' },
  'Real Estate': { symbol: 'XLRE', name: 'Real Estate SPDR' },
  'Basic Materials': { symbol: 'XLB', name: 'Materials Select SPDR' },
  'Communication Services': { symbol: 'XLC', name: 'Communication Services SPDR' },
};

async function aiSemantic(symbol: string, name: string, sector: string): Promise<{ symbol: string; name: string; reason: string }[]> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) return [];
  const prompt = `For the company ${name} (${symbol}, ${sector || 'unknown sector'}), list 5-7 RELATED publicly traded instruments that an investor researching this name should also look at. Include suppliers, customers, key competitors and a thematic peer. Return STRICT JSON: {"items":[{"symbol":"YAHOO_TICKER","name":"COMPANY","reason":"short reason"}]}. Use Yahoo Finance tickers (e.g. AAPL, ASML.AS, ENI.MI).`;
  try {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'google/gemini-2.5-flash', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed.items) ? parsed.items.slice(0, 7) : [];
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { symbol } = await req.json();
    if (!symbol) return new Response(JSON.stringify({ error: 'symbol required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const meta = await yahooMeta(symbol);
    const sector = meta?.assetProfile?.sector ?? '';
    const industry = meta?.assetProfile?.industry ?? '';
    const name = meta?.price?.longName ?? meta?.price?.shortName ?? symbol;
    const [peers, ai] = await Promise.all([yahooRecommendations(symbol), aiSemantic(symbol, name, sector)]);
    const etf = SECTOR_ETF[sector] ?? null;

    const groups: Record<string, Array<{ symbol: string; name?: string; reason?: string }>> = {
      peers: peers.slice(0, 8).map((s) => ({ symbol: s })),
      thematic: ai.map((x) => ({ symbol: x.symbol, name: x.name, reason: x.reason })),
      sector_etf: etf ? [{ symbol: etf.symbol, name: etf.name }] : [],
    };

    return new Response(JSON.stringify({ symbol, name, sector, industry, groups }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});