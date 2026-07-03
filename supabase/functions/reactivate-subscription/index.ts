// Authenticated. Reactivates a previously-canceled user by creating a fresh
// Stripe subscription on their existing customer. Uses the saved default
// payment method — charges IMMEDIATELY in full, no trial. If the customer
// has no saved card, returns { needsCheckout: true } and the UI falls back
// to embedded checkout via `create-checkout`.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { priceLookupKey, promoCode, environment } = await req.json();
    if (!priceLookupKey || !/^[A-Za-z0-9_-]{2,64}$/.test(priceLookupKey)) return json({ error: "Invalid priceLookupKey" }, 400);
    const env: StripeEnv = environment === "live" ? "live" : "sandbox";
    const stripe = createStripeClient(env);

    // Locate the returning user's Stripe customer.
    let customerId: string | null = null;
    try {
      const byMeta = await stripe.customers.search({ query: `metadata['userId']:'${user.id}'`, limit: 1 });
      if (byMeta.data.length) customerId = byMeta.data[0].id;
    } catch { /* fine */ }
    if (!customerId && user.email) {
      const byEmail = await stripe.customers.list({ email: user.email, limit: 1 });
      if (byEmail.data.length) customerId = byEmail.data[0].id;
    }
    if (!customerId) return json({ needsCheckout: true, reason: "no_customer" });

    // Refuse if the user already has an active/trialing subscription — nothing
    // to reactivate; UI shouldn't have reached this endpoint.
    const activeSubs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 5 });
    if (activeSubs.data.some((s) => ["active", "trialing", "past_due"].includes(s.status))) {
      return json({ error: "You already have an active subscription." }, 409);
    }

    const customer = await stripe.customers.retrieve(customerId) as any;
    const defaultPmId: string | null = customer?.invoice_settings?.default_payment_method ?? null;
    if (!defaultPmId) return json({ needsCheckout: true, reason: "no_default_pm" });

    // Resolve price by lookup key.
    const prices = await stripe.prices.list({ lookup_keys: [priceLookupKey], limit: 1 });
    if (!prices.data.length) return json({ error: "Price not found" }, 404);
    const price = prices.data[0];

    // Optional promo code — resolve promotion_code or coupon id.
    let discounts: { promotion_code?: string; coupon?: string }[] | undefined;
    if (promoCode && typeof promoCode === "string" && /^[A-Za-z0-9_-]{2,64}$/.test(promoCode)) {
      try {
        const promos = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
        if (promos.data.length) discounts = [{ promotion_code: promos.data[0].id }];
        else {
          const c = await stripe.coupons.retrieve(promoCode);
          if (c?.valid) discounts = [{ coupon: c.id }];
        }
      } catch { /* silently ignore invalid promo — UI validated before submit */ }
    }

    // Ensure the customer carries userId in metadata so future lookups work.
    if (customer?.metadata?.userId !== user.id) {
      await stripe.customers.update(customerId, { metadata: { ...(customer.metadata || {}), userId: user.id } });
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id }],
      default_payment_method: defaultPmId,
      payment_behavior: "error_if_incomplete", // fail fast on decline instead of leaving an "incomplete" sub
      collection_method: "charge_automatically",
      ...(discounts && { discounts }),
      metadata: {
        userId: user.id,
        flow: "reactivation",
        price_lookup_key: priceLookupKey,
        ...(promoCode ? { promoCode } : {}),
      },
      expand: ["latest_invoice.payment_intent"],
    } as any);

    // Mark the profile so the app shows a "Welcome back" confirmation instead
    // of the standard new-Pro banner. The webhook will fill in plan/state.
    await sb.from("profiles").update({
      reactivated_at: new Date().toISOString(),
      trial_welcome_shown_at: new Date().toISOString(), // suppress "Welcome to Pro" banner
      reverted_to_free_at: null,
    }).eq("user_id", user.id);

    return json({
      ok: true,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  } catch (e) {
    console.error("[reactivate-subscription]", (e as Error).message);
    return json({ error: (e as Error).message }, 400);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}