import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAiAccess, aiDeniedResponse, modelForCap } from '../_shared/ai-access.ts';
import { resolveAIConfig } from '../_shared/ai-provider.ts';
import { fetchFundamentals } from '../_shared/fundamentals.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

interface Body { query: string; symbols: string[] }

/** Human-readable labels for metric keys (also used by the UI rank chip). */
const SECTOR_SYNONYMS: Record<string, string[]> = {
  'financial services': ['bank', 'banks', 'banche', 'banca', 'financial', 'finance', 'insurance', 'assicurazioni', 'asset manager'],
  'technology': ['tech', 'technology', 'software', 'semiconductor', 'semiconductors', 'it'],
  'healthcare': ['health', 'healthcare', 'pharma', 'pharmaceutical', 'biotech', 'salute'],
  'energy': ['energy', 'oil', 'gas', 'petrolio', 'energia'],
  'utilities': ['utility', 'utilities', 'utilities sector'],
  'consumer cyclical': ['luxury', 'lusso', 'consumer cyclical', 'retail', 'automotive', 'auto'],
  'consumer defensive': ['consumer defensive', 'staples', 'food', 'beverage'],
  'industrials': ['industrial', 'industrials', 'industria', 'defence', 'defense', 'aerospace'],
  'basic materials': ['materials', 'mining', 'chemicals', 'materiali'],
  'real estate': ['real estate', 'reit', 'immobiliare'],
  'communication services': ['telecom', 'telecoms', 'media', 'communication'],
};

/** Match a free-text sector/industry constraint against Yahoo's classification. */
function matchesClassification(f: any, want: string): boolean {
  const w = want.trim().toLowerCase();
  if (!w) return true;
  const sector = String(f.sector ?? '').toLowerCase();
  const industry = String(f.industry ?? '').toLowerCase();
  if (!sector && !industry) return false;
  if (sector.includes(w) || industry.includes(w)) return true;
  for (const [canonical, syns] of Object.entries(SECTOR_SYNONYMS)) {
    if (w === canonical || syns.some((sy) => w.includes(sy))) {
      if (sector.includes(canonical)) return true;
      if (syns.some((sy) => industry.includes(sy) || sector.includes(sy))) return true;
    }
  }
  return false;
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

Sector/industry constraints must NOT be dropped: put them in "sectors" (e.g. ["Financial Services"]) and/or "industries" (e.g. ["Banks"]).
Any other constraint you cannot express with the allowed metrics or sectors/industries MUST be listed verbatim in "unmapped".

Deterministic rules (always follow, never improvise):
- If the query mentions dividends/yield, rankBy = "divYield", direction = "desc".
- Else if it mentions cheap/value/P/E, rankBy = "pe", direction = "asc".
- Else if it mentions growth, rankBy = "revGrowth", direction = "desc".
- Else if it mentions quality/ROE/margins, rankBy = "roe", direction = "desc".
- Else rankBy = "marketCap", direction = "desc".

Return JSON:
{"filters":[{"metric":string,"op":string,"value":number}],"sectors":string[],"industries":string[],"unmapped":string[],"rankBy":string,"direction":"asc"|"desc","explanation":string}

Example: "Italian banks with P/E below 10 and dividend yield above 6%" => {"filters":[{"metric":"pe","op":"<","value":10},{"metric":"divYield","op":">","value":0.06}],"sectors":["Financial Services"],"industries":["Banks"],"unmapped":[],"rankBy":"divYield","direction":"desc","explanation":"Cheap on earnings and high payout."}`,
          },
          { role: 'user', content: body.query },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!ai.ok) throw new Error(`AI ${ai.status}: ${await ai.text()}`);
    const aiJson = await ai.json();
    let spec: any = {};
    try { spec = JSON.parse(aiJson?.choices?.[0]?.message?.content ?? '{}'); } catch {}
    const filters = Array.isArray(spec.filters) ? spec.filters : [];
    const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
    const sectors: string[] = strArr(spec.sectors);
    const industries: string[] = strArr(spec.industries);
    const unmapped: string[] = strArr(spec.unmapped);
    const rankBy = typeof spec.rankBy === 'string' ? spec.rankBy : null;
    const dir = spec.direction === 'asc' ? 'asc' : 'desc';
    spec = { ...spec, filters, sectors, industries, unmapped, rankBy, direction: dir };

    // 2. Fetch fundamentals for each symbol (with small concurrency)
    const fundamentals: any[] = [];
    const fetchErrors: string[] = [];
    for (let i = 0; i < symbols.length; i += 5) {
      const batch = symbols.slice(i, i + 5);
      const rs = await Promise.all(
        batch.map((s) =>
          fetchFundamentals(s)
            .catch((e) => { fetchErrors.push(`${s}: ${(e as Error).message}`); return null; })
        ),
      );
      rs.forEach((r) => r && fundamentals.push(r));
    }
    console.log(`nl-screener: symbols=${symbols.length} fetched=${fundamentals.length} errors=${fetchErrors.length}`);

    // If the data source is entirely unavailable, say so instead of returning an empty screen.
    if (fundamentals.length === 0 && fetchErrors.length > 0) {
      return new Response(JSON.stringify({
        error: 'Market data provider unavailable — no fundamentals could be loaded. Please retry in a moment.',
        detail: fetchErrors.slice(0, 3),
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Apply filters (metric clauses + sector/industry constraints)
    const classificationWanted = [...sectors, ...industries];
    const matched = fundamentals.filter((f) =>
      filters.every((c: any) => applyFilter(f, c)) &&
      (classificationWanted.length === 0 || classificationWanted.some((w) => matchesClassification(f, w)))
    );
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
      requested: symbols.length,
      matched: matched.length,
      unmapped,
      dataErrors: fetchErrors.length,
      results: matched.slice(0, 25),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('nl-screener error', e);
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});