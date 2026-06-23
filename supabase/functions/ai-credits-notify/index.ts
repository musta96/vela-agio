import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Inserts a one-shot in-app notification when the user crosses an AI
// credit threshold. Dedupes per (user, kind, month) so we never spam.
// Body: { kind: "warn80" | "exhausted", used: number, limit: number }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const user = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: u } = await user.auth.getUser();
    if (!u?.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const kind = body?.kind === 'exhausted' ? 'exhausted' : 'warn80';
    const used = Number(body?.used ?? 0);
    const limit = Number(body?.limit ?? 0);
    const monthKey = new Date().toISOString().slice(0, 7);
    const notifKind = `ai_credits_${kind}_${monthKey}`;

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    // Dedupe — already sent this month?
    const { data: existing } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', u.user.id)
      .eq('kind', notifKind)
      .maybeSingle();
    if (existing) return new Response(JSON.stringify({ ok: true, deduped: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const title = kind === 'exhausted' ? 'AI credits exhausted' : 'AI credits at 80%';
    const body = kind === 'exhausted'
      ? `You've used all ${limit} of this month's AI credits. Paper trading and the rest of the app keep working — upgrade or add your own API key to use the AI again.`
      : `You've used ${used} of ${limit} monthly AI credits (80%). Non-AI features are not affected.`;

    await admin.from('notifications').insert({
      user_id: u.user.id,
      kind: notifKind,
      title,
      body,
      severity: kind === 'exhausted' ? 'warning' : 'info',
      payload: { used, limit, link: '/ai-usage' },
    });
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});