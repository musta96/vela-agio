import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAiAccess, aiDeniedResponse, modelForCap } from '../_shared/ai-access.ts';
import { resolveAIConfig } from '../_shared/ai-provider.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

interface Body { query: string; symbols: string[] }

function n(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'object' && typeof v.raw === 'number') return v.raw;
  return null;
}

let cachedCrumb: { crumb: string; cookie: string; at: number } | null = null;
async function getCrumb() {
  if (cachedCrumb && Date.now() - cachedCrumb.at < 30 * 60 * 1000) return cachedCrumb;
  const r2 = await fetch('https://finance.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'manual' });
  const sc = r2.headers.get('set-cookie') ?? '';
  const cookiePairs: string[] = [];
  for (const p of sc.split(/,(?=\s*[A-Za-z0-9_-]+=)/)) {
    const kv = p.split(';')[0].trim();
    if (kv && kv.includes('=')) cookiePairs.push(kv);
  }
  const cookie = cookiePairs.join('; ');
  const r3 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie },
  });
  if (!r3.ok) throw new Error(`crumb ${r3.status}`);
  const crumb = (await r3.text()).trim();
  cachedCrumb = { crumb, cookie, at: Date.now() };
  return cachedCrumb;
}

async function fetchFundamentals(symbol: string) {
  const modules = ['summaryDetail', 'defaultKeyStatistics', 'financialData', 'price', 'assetProfile'].join(',');
  const { crumb, cookie } = await getCrumb();
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie } });
  if (!r.ok) return null;
  const j = await r.json();
  const q = j?.quoteSummary?.result?.[0];
  if (!q) return null;
  const sd = q.summaryDetail ?? {};
  const ks = q.defaultKeyStatistics ?? {};
  const fd = q.financialData ?? {};
  const p = q.price ?? {};
  const ap = q.assetProfile ?? {};
  return {
    symbol,
    name: p.longName || p.shortName || symbol,
    sector: ap.sector,
    industry: ap.industry,
    price: n(p.regularMarketPrice),
    marketCap: n(p.marketCap),
    pe: n(sd.trailingPE),
    forwardPe: n(sd.forwardPE) ?? n(ks.forwardPE),
    peg: n(ks.pegRatio),
    pb: n(ks.priceToBook),
    ps: n(sd.priceToSalesTrailing12Months),
    evEbitda: n(ks.enterpriseToEbitda),
    divYield: n(sd.dividendYield),
    payout: n(sd.payoutRatio),
    roe: n(fd.returnOnEquity),
    roa: n(fd.returnOnAssets),
    grossMargin: n(fd.grossMargins),
    opMargin: n(fd.operatingMargins),
    netMargin: n(fd.profitMargins),
    revGrowth: n(fd.revenueGrowth),
    earningsGrowth: n(fd.earningsGrowth),
    debtEquity: n(fd.debtToEquity),
    currentRatio: n(fd.currentRatio),
    beta: n(sd.beta),
    fcf: n(fd.freeCashflow),
    targetMean: n(fd.targetMeanPrice),
    recommendation: fd.recommendationKey,
  };
}

/** Apply a single filter clause to a fundamentals object. */
function applyFilter(f: any, clause: { metric: string; op: string; value: number }) {
  const v = f[clause.metric];
  if (v == null) return false;
  switch (clause.op) {
    case '>': return v > clause.value;
    case '>=': return v >= clause.value;
    case '<': return v < clause.value;
    case '<=': return v <= clause.value;
    case '=':
    case '==': return v === clause.value;
    default: return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    if (!body?.query || !Array.isArray(body?.symbols)) {
      return new Response(JSON.stringify({ error: 'query and symbols required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const symbols = body.symbols.slice(0, 40);
    const auth = req.headers.get('Authorization');
    const access = await resolveAiAccess(auth);
    if (!access.allowed) return aiDeniedResponse(access, corsHeaders);
    const cfg = access.source === 'byo'
      ? await resolveAIConfig(auth)
      : {
          baseURL: 'https://ai.gateway.lovable.dev/v1',
          model: modelForCap(access.modelCap, 'google/gemini-2.5-flash'),
          headers: {
            'Lovable-API-Key': LOVABLE_API_KEY,
            'X-Lovable-AIG-SDK': 'direct-fetch',
            'Content-Type': 'application/json',
          },
        };

    // 1. Translate NL query into structured filter + ranking
    const ai = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          {
            role: 'system',
            content: `Translate the user's natural-language stock screening request into a STRICT JSON filter spec.

Allowed metrics (exact keys): marketCap, pe, forwardPe, peg, pb, ps, evEbitda, divYield (decimal e.g. 0.05 = 5%), payout (decimal), roe (decimal), roa (decimal), grossMargin (decimal), opMargin (decimal), netMargin (decimal), revGrowth (decimal), earningsGrowth (decimal), debtEquity, currentRatio, beta, fcf, price, targetMean.

Allowed ops: ">", ">=", "<", "<=", "==".

rankBy: same metric keys plus "_score". direction: "asc" or "desc".

Return JSON:
{"filters":[{"metric":string,"op":string,"value":number}],"rankBy":string,"direction":"asc"|"desc","explanation":string}

Example: "Italian banks with P/E below 10 and dividend yield above 6%" => {"filters":[{"metric":"pe","op":"<","value":10},{"metric":"divYield","op":">","value":0.06}],"rankBy":"divYield","direction":"desc","explanation":"Cheap on earnings and high payout."}`,
          },
          { role: 'user', content: body.query },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!ai.ok) throw new Error(`AI ${ai.status}: ${await ai.text()}`);
    const aiJson = await ai.json();
    let spec: any = {};
    try { spec = JSON.parse(aiJson?.choices?.[0]?.message?.content ?? '{}'); } catch {}
    const filters = Array.isArray(spec.filters) ? spec.filters : [];
    const rankBy = typeof spec.rankBy === 'string' ? spec.rankBy : null;
    const dir = spec.direction === 'asc' ? 'asc' : 'desc';

    // 2. Fetch fundamentals for each symbol (with small concurrency)
    const fundamentals: any[] = [];
    for (let i = 0; i < symbols.length; i += 5) {
      const batch = symbols.slice(i, i + 5);
      const rs = await Promise.all(batch.map((s) => fetchFundamentals(s).catch(() => null)));
      rs.forEach((r) => r && fundamentals.push(r));
    }

    // 3. Apply filters
    const matched = fundamentals.filter((f) => filters.every((c: any) => applyFilter(f, c)));
    // 4. Rank
    if (rankBy) {
      matched.sort((a, b) => {
        const av = a[rankBy], bv = b[rankBy];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return dir === 'asc' ? av - bv : bv - av;
      });
    }

    return new Response(JSON.stringify({
      query: body.query,
      spec,
      total: fundamentals.length,
      matched: matched.length,
      results: matched.slice(0, 25),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('nl-screener error', e);
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});