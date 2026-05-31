import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAiAccess } from '../_shared/ai-access.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    const access = await resolveAiAccess(auth);
    return new Response(
      JSON.stringify({
        allowed: access.allowed,
        source: access.source,
        tier: access.tier,
        modelCap: access.modelCap,
        quotaUsed: access.quotaUsed ?? null,
        quotaLimit: access.quotaLimit ?? null,
        byoProvider: access.byoProvider ?? null,
        reason: access.reason ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});