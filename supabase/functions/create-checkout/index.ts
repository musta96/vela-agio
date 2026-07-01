import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Invalid userId");
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  let logCtx: Record<string, unknown> = {};
  try {
    const body = await req.json();
    const { priceId, quantity, customerEmail, userId, returnUrl, environment, referralCode, correlationId } = body ?? {};
    logCtx = { event: "create-checkout:start", lookupKey: priceId, userId, environment, hasReferral: !!referralCode, correlationId };
    console.log("[payments]", logCtx);
    if (!priceId || !/^[a-zA-Z0-9_-]+$/.test(priceId)) throw new Error("Invalid priceId");
    if (!returnUrl) throw new Error("returnUrl required");
    const env: StripeEnv = environment === "live" ? "live" : "sandbox";

    const stripe = createStripeClient(env);
    const prices = await stripe.prices.list({ lookup_keys: [priceId] });
    if (!prices.data.length) {
      console.warn("[payments]", { event: "create-checkout:price_not_found", lookupKey: priceId, environment: env, correlationId });
      throw new Error(`Price not found for lookup key "${priceId}"`);
    }
    const stripePrice = prices.data[0];
    const isRecurring = stripePrice.type === "recurring";

    const customerId = (customerEmail || userId)
      ? await resolveOrCreateCustomer(stripe, { email: customerEmail, userId })
      : undefined;

    let productDescription: string | undefined;
    if (!isRecurring) {
      const productId = typeof stripePrice.product === "string" ? stripePrice.product : stripePrice.product.id;
      const product = await stripe.products.retrieve(productId);
      productDescription = product.name;
    }

    // Resolve optional referral code -> Stripe discount
    let discounts: { coupon: string }[] | undefined;
    if (referralCode && typeof referralCode === "string" && /^[A-Za-z0-9_-]{2,64}$/.test(referralCode)) {
      try {
        const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data } = await sb.rpc("lookup_referral_code", { _code: referralCode });
        const r = data as any;
        if (r?.found && r.active && !r.expired && !r.exhausted && r.kind === "discount" && r.stripe_coupon_id) {
          discounts = [{ coupon: String(r.stripe_coupon_id) }];
        }
      } catch (e) { console.warn("referral lookup failed", e); }
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: quantity || 1 }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded_page",
      return_url: returnUrl,
      ...(customerId && { customer: customerId }),
      ...(!isRecurring && { payment_intent_data: { description: productDescription } }),
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      ...(userId && {
        metadata: { userId, ...(referralCode ? { referralCode } : {}) },
        ...(isRecurring && { subscription_data: { metadata: { userId, ...(referralCode ? { referralCode } : {}) } } }),
      }),
    });

    console.log("[payments]", { event: "create-checkout:success", lookupKey: (logCtx as any).lookupKey, correlationId, duration_ms: Date.now() - t0 });
    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[payments]", { event: "create-checkout:error", lookupKey: (logCtx as any).lookupKey, userId: (logCtx as any).userId, correlationId: (logCtx as any).correlationId, error: (e as Error).message });
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});