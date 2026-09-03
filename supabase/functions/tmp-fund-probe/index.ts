import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function tryIt(name: string, fn: () => Promise<unknown>) {
  try { return { name, ok: true, res: await fn() }; } catch (e: any) { return { name, ok: false, err: String(e?.message ?? e) }; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const out: any[] = [];

  out.push(await tryIt('fc.yahoo.com cookie', async () => {
    const r = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'manual' });
    return { status: r.status, cookie: (r.headers.get('set-cookie') ?? '').slice(0, 40) };
  }));

  out.push(await tryIt('query1 quoteSummary no crumb', async () => {
    const r = await fetch('https://query1.finance.yahoo.com/v10/finance/quoteSummary/ISP.MI?modules=summaryDetail,assetProfile', { headers: { 'User-Agent': UA } });
    const t = await r.text();
    return { status: r.status, body: t.slice(0, 200) };
  }));

  out.push(await tryIt('query1 v7 quote', async () => {
    const r = await fetch('https://query1.finance.yahoo.com/v7/finance/quote?symbols=ISP.MI', { headers: { 'User-Agent': UA } });
    return { status: r.status, body: (await r.text()).slice(0, 200) };
  }));

  out.push(await tryIt('query2 getcrumb no cookie', async () => {
    const r = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA } });
    return { status: r.status, body: (await r.text()).slice(0, 80) };
  }));

  out.push(await tryIt('finance.yahoo.com http1 via query1 root', async () => {
    const r = await fetch('https://query1.finance.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'manual' });
    return { status: r.status, cookie: (r.headers.get('set-cookie') ?? '').slice(0, 60) };
  }));

  out.push(await tryIt('stooq csv', async () => {
    const r = await fetch('https://stooq.com/q/l/?s=isp.mi&f=sd2t2ohlcv&h&e=csv');
    return { status: r.status, body: (await r.text()).slice(0, 120) };
  }));

  return new Response(JSON.stringify(out, null, 1), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
