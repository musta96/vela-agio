// startup-registry — official company-register lookup for private companies.
// Returns register entries and filings from GLEIF, national registers and the
// SEC. Read-only public data; nothing is invented.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { lookupRegistries } from '../_shared/company-registries.ts';

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

    const result = await lookupRegistries(name, country || undefined);
    return new Response(JSON.stringify({ ...result, company: name, asOf: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('startup-registry failed', e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
