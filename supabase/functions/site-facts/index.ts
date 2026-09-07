// site-facts — read a listed company's / fund issuer's own website and return
// sourced facts, so the page analysis is grounded in what the company itself
// publishes. Every fact carries the page URL it came from.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAIConfig } from '../_shared/ai-provider.ts';
import { resolveAiAccess, logAiUsage } from '../_shared/ai-access.ts';
import { researchWebsite } from '../_shared/website-facts.ts';
import { normaliseWebsite } from '../_shared/site-research.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    const body = await req.json().catch(() => ({}));
    const website = normaliseWebsite(String(body?.website ?? ''));
    if (!website) return json({ error: 'invalid_website', message: 'Enter a valid website address.' }, 400);

    const access = await resolveAiAccess(auth);
    if (!access.allowed) {
      return json({ error: 'ai_unavailable', message: 'AI is not available on your plan. Add credits or your own API key in Settings > Connections.' }, 403);
    }
    const cfg = await resolveAIConfig(auth);
    const research = await researchWebsite(cfg, website, Math.min(10, Math.max(3, Number(body?.maxPages) || 8)));
    await logAiUsage({ access, feature: 'site_facts', cost: 2 }).catch(() => {});
    return json({ website, symbol: body?.symbol ?? null, research });
  } catch (e) {
    return json({ error: 'failed', message: e instanceof Error ? e.message : 'Website research failed' }, 500);
  }
});
