import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { resolveVelaCoupon } from "../_shared/velaCoupon.ts";

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
    const {
      priceId, quantity, customerEmail, userId: bodyUserId, returnUrl, environment,
      referralCode, promoCode, correlationId,
      expectedTotalCents, expectedCurrency,
    } = body ?? {};

    // Derive userId from the caller's JWT — never trust the client-supplied value.
    // Guest checkouts (no auth header) may still proceed but cannot bind to any account.
    let userId: string | undefined = undefined;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
        const sub = data?.claims?.sub as string | undefined;
        if (sub) userId = sub;
      } catch { /* fall through as guest */ }
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (bodyUserId && bodyUserId !== userId) {
        return new Response(JSON.stringify({ error: "userId mismatch" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
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
    const unitAmount = stripePrice.unit_amount ?? 0;
    const priceCurrency = (stripePrice.currency ?? "eur").toLowerCase();

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
    let referralCoupon: any | null = null;
    if (referralCode && typeof referralCode === "string" && /^[A-Za-z0-9_-]{2,64}$/.test(referralCode)) {
      const resolved = await resolveVelaCoupon(stripe, referralCode);
      if (resolved) {
        referralCoupon = resolved.coupon;
        discounts = [{ coupon: resolved.couponId }];
      }
    }

    // Resolve optional user-entered promo code -> Stripe promotion_code / coupon.
    // If both a referralCode-derived coupon and a promo are present, the referral
    // wins (referral code took the explicit action of being applied first).
    let promoDiscounts: { promotion_code?: string; coupon?: string }[] | undefined;
    let promoCoupon: any | null = null;
    if (!discounts && promoCode && typeof promoCode === "string" && /^[A-Za-z0-9_-]{2,64}$/.test(promoCode)) {
      try {
        const promos = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
        if (promos.data.length) {
          promoDiscounts = [{ promotion_code: promos.data[0].id }];
          promoCoupon = promos.data[0].coupon;
        } else {
          let c: any = null;
          try { c = await stripe.coupons.retrieve(promoCode); } catch { /* not a Stripe coupon id */ }
          if (c?.valid) { promoDiscounts = [{ coupon: c.id }]; promoCoupon = c; }
          else {
            // Vela-issued discount code typed into the promo field.
            const resolved = await resolveVelaCoupon(stripe, promoCode);
            if (resolved) { promoDiscounts = [{ coupon: resolved.couponId }]; promoCoupon = resolved.coupon; }
          }
        }
      } catch (e) { console.warn("promo lookup failed", (e as Error).message); }
    }
    const finalDiscounts = discounts ?? promoDiscounts;
    const activeCoupon = referralCoupon ?? promoCoupon;

    // Server-side price integrity check. If the client told us what it
    // rendered under "Due today", recompute the same discount here and
    // refuse to open a session on mismatch — otherwise a tampered client
    // or a stale promo could authorise a charge different from what the
    // user saw. Off-by-one rounding is tolerated (Stripe rounds percent
    // discounts to the nearest cent).
    if (typeof expectedTotalCents === "number" && Number.isFinite(expectedTotalCents)) {
      let discountCents = 0;
      if (activeCoupon?.percent_off) {
        discountCents = Math.round(unitAmount * (Number(activeCoupon.percent_off) / 100));
      } else if (activeCoupon?.amount_off) {
        discountCents = Math.min(unitAmount, Number(activeCoupon.amount_off));
      }
      const serverFinal = Math.max(0, unitAmount - discountCents);
      const drift = Math.abs(serverFinal - Math.round(expectedTotalCents));
      const currencyMismatch = expectedCurrency
        ? String(expectedCurrency).toLowerCase() !== priceCurrency
        : false;
      if (drift > 1 || currencyMismatch) {
        console.warn("[payments]", {
          event: "create-checkout:price_mismatch",
          lookupKey: priceId,
          userId, environment: env, correlationId,
          expectedTotalCents, serverFinal, unitAmount,
          discountCents, priceCurrency, expectedCurrency,
          hasPromo: !!activeCoupon, promoCode: promoCode ?? null, referralCode: referralCode ?? null,
        });
        return new Response(JSON.stringify({
          error: "price_mismatch",
          message: "The price shown to you has changed. Please refresh and try again.",
          serverTotalCents: serverFinal,
          expectedTotalCents,
          currency: priceCurrency,
        }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: quantity || 1 }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded_page",
      return_url: returnUrl,
      ...(customerId && { customer: customerId }),
      ...(!isRecurring && { payment_intent_data: { description: productDescription } }),
      ...(finalDiscounts ? { discounts: finalDiscounts } : { allow_promotion_codes: true }),
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