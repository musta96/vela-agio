import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getUserDataKey } from '../_shared/data-provider.ts';

// SnapTrade read-only broker sync.
// Docs: https://docs.snaptrade.com/reference
// Auth: every request signed with HMAC-SHA256 of `{content,path,query}` JSON
// using the consumerKey as secret; sent as `Signature` header. clientId,
// timestamp, userId, userSecret are query params.

const BASE = 'https://api.snaptrade.com/api/v1';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

async function hmacSha256(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
  // SnapTrade expects base64-url-safe (no padding) of raw HMAC
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function stFetch(opts: {
  clientId: string;
  consumerKey: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string; // e.g. /snapTrade/registerUser
  query?: Record<string, string>;
  body?: any;
}): Promise<any> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const query: Record<string, string> = { clientId: opts.clientId, timestamp, ...(opts.query ?? {}) };
  const queryStr = new URLSearchParams(query).toString();
  const path = opts.path;
  const content = opts.body ?? '';
  const signingObject = { content, path, query: queryStr };
  const signingMessage = JSON.stringify(signingObject);
  const signature = await hmacSha256(opts.consumerKey, signingMessage);
  const url = `${BASE}${path}?${queryStr}`;
  const r = await fetch(url, {
    method: opts.method,
    headers: {
      Signature: signature,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: opts.method === 'GET' ? undefined : JSON.stringify(content),
  });
  const text = await r.text();
  let json: any; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) throw new Error(`SnapTrade ${r.status}: ${text.slice(0, 300)}`);
  return json;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const clientId = await getUserDataKey(auth, 'SNAPTRADE_CLIENT_ID');
    const consumerKey = await getUserDataKey(auth, 'SNAPTRADE_CONSUMER_KEY');
    if (!clientId || !consumerKey) {
      return new Response(JSON.stringify({ error: 'SnapTrade not configured. Add SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY in Settings → Data Providers.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { action, redirectURI } = await req.json();

    // Helper: get-or-create the SnapTrade user binding for this auth user.
    async function ensureBinding(): Promise<{ snaptrade_user_id: string; snaptrade_user_secret: string }> {
      const { data: existing } = await sb.from('snaptrade_connections').select('*').eq('user_id', user.id).maybeSingle();
      if (existing) return existing as any;
      const snapUserId = `vela_${user.id}`;
      const reg = await stFetch({ clientId, consumerKey, method: 'POST', path: '/snapTrade/registerUser', body: { userId: snapUserId } });
      const snaptrade_user_secret = reg.userSecret;
      await sb.from('snaptrade_connections').insert({ user_id: user.id, snaptrade_user_id: snapUserId, snaptrade_user_secret });
      return { snaptrade_user_id: snapUserId, snaptrade_user_secret };
    }

    if (action === 'login-url') {
      const b = await ensureBinding();
      const r = await stFetch({
        clientId, consumerKey, method: 'POST',
        path: '/snapTrade/login',
        query: { userId: b.snaptrade_user_id, userSecret: b.snaptrade_user_secret },
        body: { customRedirect: redirectURI ?? null, connectionType: 'read' },
      });
      return new Response(JSON.stringify({ redirectURI: r.redirectURI }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'sync') {
      const b = await ensureBinding();
      const accounts = await stFetch({
        clientId, consumerKey, method: 'GET',
        path: '/accounts',
        query: { userId: b.snaptrade_user_id, userSecret: b.snaptrade_user_secret },
      });
      const accountsArr: any[] = Array.isArray(accounts) ? accounts : [];
      let totalPositions = 0;
      for (const acc of accountsArr) {
        const accExternal = acc.id ?? acc.account_id;
        const { data: upserted } = await sb.from('broker_accounts').upsert({
          user_id: user.id,
          source: 'snaptrade',
          external_id: accExternal,
          institution: acc.institution_name ?? acc.brokerage?.name ?? null,
          name: acc.name ?? acc.number ?? null,
          currency: acc.balance?.currency?.code ?? acc.cash_balance?.currency ?? null,
          cash: acc.balance?.cash ?? acc.cash_balance?.amount ?? null,
          total_value: acc.balance?.total ?? acc.total_value ?? null,
          raw: acc,
          synced_at: new Date().toISOString(),
        }, { onConflict: 'user_id,source,external_id' }).select('id').single();

        const accountId = upserted?.id;
        if (!accountId) continue;

        try {
          const positions = await stFetch({
            clientId, consumerKey, method: 'GET',
            path: `/accounts/${accExternal}/positions`,
            query: { userId: b.snaptrade_user_id, userSecret: b.snaptrade_user_secret },
          });
          const posArr: any[] = Array.isArray(positions) ? positions : [];
          for (const p of posArr) {
            const sym = p.symbol?.symbol?.symbol ?? p.symbol?.symbol ?? p.symbol?.raw_symbol;
            if (!sym) continue;
            await sb.from('broker_positions').upsert({
              user_id: user.id,
              account_id: accountId,
              symbol: String(sym).toUpperCase(),
              name: p.symbol?.symbol?.description ?? p.symbol?.description ?? null,
              quantity: p.units ?? p.quantity ?? null,
              avg_price: p.average_purchase_price ?? null,
              market_price: p.price ?? null,
              market_value: p.market_value ?? null,
              currency: p.symbol?.symbol?.currency?.code ?? null,
              raw: p,
              synced_at: new Date().toISOString(),
            }, { onConflict: 'account_id,symbol' });
            totalPositions++;
          }
        } catch (e) { /* per-account positions error, continue */ }
      }
      await sb.from('snaptrade_connections').update({ last_sync_at: new Date().toISOString() }).eq('user_id', user.id);
      return new Response(JSON.stringify({ ok: true, accounts: accountsArr.length, positions: totalPositions }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'status') {
      const { data: b } = await sb.from('snaptrade_connections').select('snaptrade_user_id, last_sync_at').eq('user_id', user.id).maybeSingle();
      const { count: accCount } = await sb.from('broker_accounts').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
      const { count: posCount } = await sb.from('broker_positions').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
      return new Response(JSON.stringify({ connected: !!b, last_sync_at: b?.last_sync_at ?? null, accounts: accCount ?? 0, positions: posCount ?? 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'disconnect') {
      await sb.from('broker_positions').delete().eq('user_id', user.id);
      await sb.from('broker_accounts').delete().eq('user_id', user.id);
      await sb.from('snaptrade_connections').delete().eq('user_id', user.id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});