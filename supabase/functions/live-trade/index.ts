import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getUserDataKey } from '../_shared/data-provider.ts';

// =====================================================================
// LIVE-TRADE — execute or reject a LIVE order intent previously
// proposed by the Copilot. Requires the user to explicitly confirm
// from the confirm-modal in the UI. Supports Alpaca LIVE today;
// IBKR is wired through a stub (CP Gateway requires user-hosted
// session, so we just persist intent + return a manual link).
// =====================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function sb(auth: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function executeAlpacaLive(authHeader: string, intent: any) {
  const key = await getUserDataKey(authHeader, 'ALPACA_API_KEY');
  const secret = await getUserDataKey(authHeader, 'ALPACA_API_SECRET');
  if (!key || !secret) return { ok: false, error: 'Alpaca LIVE keys missing. Add ALPACA_API_KEY + ALPACA_API_SECRET (LIVE, not paper) in Settings → Data providers.' };
  const body: any = {
    symbol: intent.symbol, qty: String(intent.qty), side: intent.side,
    type: intent.type, time_in_force: intent.time_in_force ?? 'day',
  };
  if (intent.type === 'limit' && intent.limit_price != null) body.limit_price = String(intent.limit_price);
  const r = await fetch('https://api.alpaca.markets/v2/orders', {
    method: 'POST',
    headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) return { ok: false, error: j?.message ?? `Alpaca ${r.status}`, detail: j };
  return { ok: true, mode: 'LIVE', broker: 'alpaca', order_id: j.id, status: j.status, submitted_at: j.submitted_at };
}

async function executeIbkrLive(authHeader: string, intent: any) {
  const token = await getUserDataKey(authHeader, 'IB_GATEWAY_TOKEN');
  if (!token) return { ok: false, error: 'IBKR live trading needs the Client Portal Gateway running locally + IB_GATEWAY_TOKEN configured.' };
  // Stub: real implementation would POST to https://localhost:5000/v1/api/iserver/account/{acctId}/orders.
  return { ok: false, error: 'IBKR direct order placement requires a user-hosted Client Portal Gateway — not yet executable from the cloud. Intent stored for manual placement.', manual: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { intent_id, action } = await req.json();
    if (!intent_id || !['confirm', 'reject'].includes(action)) {
      return new Response(JSON.stringify({ error: 'intent_id + action(confirm|reject) required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const client = sb(auth);
    const { data: { user } } = await client.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: intent, error: ferr } = await client.from('live_order_intents').select('*').eq('id', intent_id).eq('user_id', user.id).maybeSingle();
    if (ferr || !intent) return new Response(JSON.stringify({ error: 'intent not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (intent.status !== 'pending') return new Response(JSON.stringify({ error: `intent already ${intent.status}` }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (new Date(intent.expires_at).getTime() < Date.now()) {
      await client.from('live_order_intents').update({ status: 'expired' }).eq('id', intent.id);
      return new Response(JSON.stringify({ error: 'intent expired — please re-issue in chat' }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'reject') {
      await client.from('live_order_intents').update({ status: 'rejected' }).eq('id', intent.id);
      return new Response(JSON.stringify({ ok: true, status: 'rejected' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const exec = intent.broker === 'alpaca' ? await executeAlpacaLive(auth, intent) : await executeIbkrLive(auth, intent);
    const newStatus = exec.ok ? 'executed' : (exec as any).manual ? 'confirmed' : 'failed';
    await client.from('live_order_intents').update({ status: newStatus, result: exec }).eq('id', intent.id);
    return new Response(JSON.stringify({ ok: exec.ok, status: newStatus, result: exec }), { status: exec.ok ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});