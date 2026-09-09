// startup-discovery — find private-company / startup candidates from real sources.
//
// Free sources: Google News funding headlines, SEC EDGAR Form D filings.
// Optional paid sources (BYO key): Crunchbase API, PitchBook, Dealroom.
//
// POST body:
//   query?: string           free-text search
//   sector?: string
//   stage?: string
//   country?: string
//   sources?: string[]       defaults to ['news','sec_formd']
//   limit?: number           max 100, default 25
//
// Response:
//   { candidates: [...], sources: [...], warnings: [...] }

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { discoverStartups } from '../_shared/startup-discovery.ts';
import { lookupRegistries } from '../_shared/company-registries.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const auth = req.headers.get('Authorization');
    const result = await discoverStartups({
      query: body?.query,
      sector: body?.sector,
      stage: body?.stage,
      country: body?.country,
      sources: body?.sources,
      limit: Number(body?.limit) || 25,
      authHeader: auth,
    });

    // Official registers: confirm the candidates that exist in a public company
    // register and attach the register entry, so nothing rests on press alone.
    const wantsRegistry = Array.isArray(body?.sources) && body.sources.includes('registry');
    if (wantsRegistry && Array.isArray(result?.candidates)) {
      const top = result.candidates.slice(0, 12);
      const checked = await Promise.allSettled(
        top.map((c: any) => lookupRegistries(c.name, c.country || body?.country)),
      );
      checked.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        const hit = (r.value.records ?? []).find((rec: any) => rec.identifier);
        if (!hit) return;
        top[i].registry = hit;
        top[i].registryFilings = (r.value.filings ?? []).slice(0, 5);
        if (top[i].confidence === 'low') top[i].confidence = 'medium';
      });
      (result.sources ??= []).push('registry');
    }

    return json(result);
  } catch (e) {
    console.error('startup-discovery error', e);
    return json({ error: e instanceof Error ? e.message : 'Discovery failed', candidates: [] }, 500);
  }
});
