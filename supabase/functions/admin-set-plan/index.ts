// Lets an admin grant (comp) or revoke a paid plan for a user manually,
// without any Stripe payment. Comped subscriptions are written with a
// `comp_` prefixed subscription id so they can be identified and revoked.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = createClient(SUPA_URL, SERVICE);
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await sb.auth.getUser(auth.replace('Bearer ', ''));
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const { data: roles } = await sb.from('user_roles').select('role').eq('user_id', user.id);
    if (!(roles ?? []).some((r: any) => r.role === 'admin')) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId ?? '');
    const planSlug: string | null = body?.planSlug ?? null;
    const cycle = body?.cycle === 'yearly' ? 'yearly' : 'monthly';
    const months = Math.min(120, Math.max(1, Number(body?.months ?? (cycle === 'yearly' ? 12 : 1))));
    const environment = body?.environment === 'sandbox' ? 'sandbox' : 'live';
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: 'Valid userId required' }, 400);

    // Always clear any previous comp grant for this user + environment.
    await sb.from('subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('environment', environment)
      .like('stripe_subscription_id', 'comp_%');

    if (!planSlug) {
      await sb.from('audit_log').insert({
        actor_id: user.id, actor_email: user.email, action: 'admin.plan.revoked',
        entity: 'subscriptions', entity_id: userId, payload: { environment },
      });
      return json({ ok: true, revoked: true });
    }

    const { data: plan } = await sb.from('subscription_plans')
      .select('id,slug,name,tier,stripe_monthly_price_id,stripe_yearly_price_id')
      .eq('slug', planSlug).maybeSingle();
    if (!plan) return json({ error: 'Unknown plan' }, 400);
    const priceId = cycle === 'yearly' ? plan.stripe_yearly_price_id : plan.stripe_monthly_price_id;
    if (!priceId) return json({ error: `Plan "${plan.name}" has no ${cycle} price configured` }, 400);

    const now = new Date();
    const end = new Date(now); end.setMonth(end.getMonth() + months);
    const { error } = await sb.from('subscriptions').insert({
      user_id: userId,
      stripe_subscription_id: `comp_${crypto.randomUUID()}`,
      stripe_customer_id: `comp_${userId}`,
      product_id: `comp_${plan.slug}`,
      price_id: priceId,
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: end.toISOString(),
      cancel_at_period_end: false,
      environment,
    });
    if (error) return json({ error: error.message }, 500);

    await sb.from('audit_log').insert({
      actor_id: user.id, actor_email: user.email, action: 'admin.plan.granted',
      entity: 'subscriptions', entity_id: userId,
      payload: { planSlug: plan.slug, cycle, months, environment, priceId },
    });

    return json({ ok: true, plan: plan.slug, expiresAt: end.toISOString(), environment });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
