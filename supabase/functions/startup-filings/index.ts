// startup-filings — real regulatory filings for a private company.
// Reads SEC EDGAR, GLEIF, national registers, VIES and CORDIS. Public data only.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { fetchStartupFilings } from '../_shared/startup-filings.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const country = typeof body?.country === 'string' ? body.country.trim() : '';

    if (name.length < 2) {
      return new Response(JSON.stringify({ error: 'A company name of at least 2 characters is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await fetchStartupFilings({ name, country: country || undefined });
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('startup-filings failed', e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
