import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

// Cascading delete order: child rows first, then parents.
const TABLES = [
  'portfolio_holdings',
  'portfolio_simulations',
  'portfolios',
  'watchlist_items',
  'alert_rules',
  'alert_preferences',
  'notifications',
  'investor_profiles',
  'broker_positions',
  'broker_accounts',
  'live_order_intents',
  'feature_requests',
  'snaptrade_connections',
  'user_api_keys',
  'user_consents',
  'user_roles',
  'profiles',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = userRes.user.id;

    // Require a confirmation phrase in the body.
    let body: { confirm?: string } = {};
    try { body = await req.json(); } catch { /* ignore */ }
    if ((body.confirm ?? '').trim().toUpperCase() !== 'DELETE') {
      return new Response(JSON.stringify({ error: "Type DELETE to confirm" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE);
    const deleted: Record<string, number | string> = {};
    for (const t of TABLES) {
      const { error, count } = await svc.from(t).delete({ count: 'exact' }).eq('user_id', userId);
      deleted[t] = error ? `error: ${error.message}` : (count ?? 0);
    }

    // Audit before destroying the auth user.
    await svc.from('audit_log').insert({
      action: 'account_deleted',
      entity: 'auth.users',
      entity_id: userId,
      actor_id: userId,
      actor_email: userRes.user.email,
      payload: { deleted },
      ip: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
    }).then(() => {}).catch(() => {});

    const { error: authErr } = await svc.auth.admin.deleteUser(userId);
    if (authErr) {
      return new Response(JSON.stringify({ error: `Auth deletion failed: ${authErr.message}`, deleted }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, deleted }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});