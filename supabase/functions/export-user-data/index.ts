import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

// Tables exported (per-user, scoped by user_id column).
// snaptrade_connections + user_api_keys + audit_log intentionally omitted —
// they contain ciphertext / are admin-only.
const TABLES = [
  'profiles',
  'portfolios',
  'portfolio_holdings',
  'portfolio_simulations',
  'watchlist_items',
  'alert_rules',
  'alert_preferences',
  'notifications',
  'investor_profiles',
  'broker_accounts',
  'broker_positions',
  'live_order_intents',
  'feature_requests',
  'user_consents',
  'user_roles',
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

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE);
    const out: Record<string, unknown> = {
      _meta: {
        exported_at: new Date().toISOString(),
        user_id: userId,
        email: userRes.user.email,
        notice: 'GDPR Article 20 data portability export. Encrypted credentials (broker API keys, SnapTrade secrets) are intentionally excluded.',
      },
    };
    for (const t of TABLES) {
      const { data, error } = await svc.from(t).select('*').eq('user_id', userId);
      out[t] = error ? { error: error.message } : (data ?? []);
    }

    const json = JSON.stringify(out, null, 2);
    return new Response(json, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="vela-export-${userId}.json"`,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});