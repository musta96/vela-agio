import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const out: any = {};
  try {
    const r = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'manual' });
    const sc = r.headers.get('set-cookie') ?? '';
    const cookie = sc.split(/,(?=\s*[A-Za-z0-9_-]+=)/).map((p) => p.split(';')[0].trim()).filter((k) => k.includes('=')).join('; ');
    out.cookieLen = cookie.length;
    const c = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie } });
    const crumb = (await c.text()).trim();
    out.crumbStatus = c.status;
    out.crumbSample = crumb.slice(0, 12);
    const q = await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/ISP.MI?modules=summaryDetail,assetProfile,price,financialData&crumb=${encodeURIComponent(crumb)}`, { headers: { 'User-Agent': UA, Cookie: cookie } });
    out.qsStatus = q.status;
    const j = await q.json().catch(() => null);
    const res = j?.quoteSummary?.result?.[0];
    out.sector = res?.assetProfile?.sector;
    out.industry = res?.assetProfile?.industry;
    out.pe = res?.summaryDetail?.trailingPE;
    out.divYield = res?.summaryDetail?.dividendYield;
  } catch (e: any) {
    out.error = String(e?.message ?? e);
  }
  return new Response(JSON.stringify(out, null, 1), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
