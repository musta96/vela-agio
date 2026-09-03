import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { fetchFundamentals } from '../_shared/fundamentals.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);
  const syms = (url.searchParams.get('symbols') ?? 'ISP.MI,UCG.MI,ENI.MI').split(',');
  const out: any[] = [];
  for (const s of syms) {
    try {
      const f = await fetchFundamentals(s.trim());
      out.push(f ? { symbol: f.symbol, sector: f.sector, industry: f.industry, pe: f.pe, divYield: f.divYield, price: f.price } : { symbol: s, null: true });
    } catch (e: any) {
      out.push({ symbol: s, error: e?.message });
    }
  }
  return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
