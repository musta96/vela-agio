import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { fetchFundamentals } from '../_shared/fundamentals.ts';
Deno.serve(async () => {
  const out: any[] = [];
  for (const s of ['ISP.MI','UCG.MI','ENI.MI']) {
    try { const f = await fetchFundamentals(s); out.push({ s, sector: f?.sector, industry: f?.industry, pe: f?.pe, dy: f?.divYield }); }
    catch (e: any) { out.push({ s, err: e.message }); }
  }
  return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
