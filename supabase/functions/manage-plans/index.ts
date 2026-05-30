import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createStripeClient, type StripeEnv } from '../_shared/stripe.ts';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function requireAdmin(req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth) throw new Error('Unauthorized');
  const sb = createClient(SUPA_URL, SERVICE);
  const token = auth.replace('Bearer ', '');
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) throw new Error('Unauthorized');
  const { data: roles } = await sb.from('user_roles').select('role').eq('user_id', user.id);
  const isAdmin = (roles ?? []).some((r: any) => r.role === 'admin');
  if (!isAdmin) throw new Error('Forbidden');
  return user;
}

function pickEnv(body: any, url: URL): StripeEnv {
  const e = body?.env || url.searchParams.get('env') || 'sandbox';
  return e === 'live' ? 'live' : 'sandbox';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body?.action || url.searchParams.get('action') || 'list';
    const env = pickEnv(body, url);
    const stripe = createStripeClient(env);

    if (action === 'list') {
      const products = await stripe.products.list({ limit: 100, active: undefined });
      const prices = await stripe.prices.list({ limit: 100, active: undefined });
      return json({ env, products: products.data, prices: prices.data });
    }
    if (action === 'create_product') {
      const { name, description, metadata } = body;
      if (!name) return json({ error: 'name required' }, 400);
      const p = await stripe.products.create({
        name, description: description || undefined,
        metadata: metadata || {},
      });
      return json({ product: p });
    }
    if (action === 'update_product') {
      const { product_id, name, description, active } = body;
      if (!product_id) return json({ error: 'product_id required' }, 400);
      const p = await stripe.products.update(product_id, {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(active !== undefined && { active }),
      });
      return json({ product: p });
    }
    if (action === 'create_price') {
      const { product_id, amount, currency, interval } = body;
      if (!product_id || !amount || !currency) return json({ error: 'product_id, amount, currency required' }, 400);
      const p = await stripe.prices.create({
        product: product_id,
        unit_amount: Math.round(Number(amount)),
        currency: String(currency).toLowerCase(),
        ...(interval && { recurring: { interval } }),
      });
      return json({ price: p });
    }
    if (action === 'archive_price') {
      const { price_id } = body;
      if (!price_id) return json({ error: 'price_id required' }, 400);
      const p = await stripe.prices.update(price_id, { active: false });
      return json({ price: p });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return json({ error: msg }, status);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}