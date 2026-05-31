import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAiAccess } from '../_shared/ai-access.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const correlationId = req.headers.get('x-correlation-id') ?? `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
  try {
    const auth = req.headers.get('Authorization');
    const access = await resolveAiAccess(auth);
    if (!access.allowed) {
      console.warn('[ai-access-status] ai_access_denied', JSON.stringify({
        correlationId,
        userId: access.userId ?? null,
        source: access.source,
        tier: access.tier,
        quotaUsed: access.quotaUsed ?? null,
        quotaLimit: access.quotaLimit ?? null,
        reason: access.reason ?? null,
        hasAuthHeader: !!auth,
      }));
    }
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
        correlationId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-correlation-id': correlationId }, status: 200 },
    );
  } catch (e) {
    console.error('[ai-access-status] unhandled', JSON.stringify({ correlationId, error: String(e) }));
    return new Response(JSON.stringify({ error: String(e), correlationId }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-correlation-id': correlationId },
    });
  }
});