import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { providerStatus, type Tier } from '../_shared/data-entitlements.ts';

// GET/POST { tier?: 'free'|'plus'|'pro'|'enterprise' } -> data-source catalogue
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    let tier: Tier = 'free';
    if (req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      if (b?.tier) tier = String(b.tier) as Tier;
    } else {
      tier = (new URL(req.url).searchParams.get('tier') ?? 'free') as Tier;
    }
    const providers = providerStatus(tier);
    return new Response(JSON.stringify({
      tier,
      providers,
      note: 'Free sources are always active. Paid sources become active once a key is configured and the plan tier allows it — users can also bring their own key.',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
