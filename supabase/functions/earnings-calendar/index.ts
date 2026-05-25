import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Yahoo Finance earnings calendar via CORS-bypass proxy.
const PROXY = 'https://api.allorigins.win/raw?url=';

async function yahoo(symbol: string) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=earnings,earningsHistory,earningsTrend,calendarEvents`;
  const r = await fetch(PROXY + encodeURIComponent(url));
  if (!r.ok) return null;
  const j = await r.json();
  return j?.quoteSummary?.result?.[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { symbols } = await req.json();
    const list: string[] = Array.isArray(symbols) ? symbols : [];
    const out: any[] = [];
    for (const s of list.slice(0, 25)) {
      const d = await yahoo(s);
      if (!d) continue;
      const cal = d.calendarEvents?.earnings;
      const trend = d.earningsTrend?.trend?.[0];
      const hist = d.earningsHistory?.history ?? [];
      out.push({
        symbol: s,
        nextDate: cal?.earningsDate?.[0]?.fmt ?? null,
        epsEstimate: cal?.earningsAverage?.raw ?? null,
        revEstimate: cal?.revenueAverage?.raw ?? null,
        consensusEps: trend?.earningsEstimate?.avg?.raw ?? null,
        growth: trend?.earningsEstimate?.growth?.raw ?? null,
        history: hist.map((h: any) => ({
          period: h.period, date: h.quarter?.fmt,
          eps: h.epsActual?.raw, estimate: h.epsEstimate?.raw, surprisePct: h.surprisePercent?.raw,
        })),
      });
    }
    return new Response(JSON.stringify({ events: out }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});