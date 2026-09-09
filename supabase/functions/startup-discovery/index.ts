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
    return json(result);
  } catch (e) {
    console.error('startup-discovery error', e);
    return json({ error: e instanceof Error ? e.message : 'Discovery failed', candidates: [] }, 500);
  }
});
