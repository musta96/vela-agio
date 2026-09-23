import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { resolveVelaCoupon } from "../_shared/velaCoupon.ts";
import { rateLimit } from "../_shared/rate-limit.ts";

// Single ineligibility message shared by every refusal path so the response
// never discloses whether an email already has an account.
const TRIAL_INELIGIBLE =
  "This email can't start a new trial. If you already have a Vela account, sign in and upgrade from Settings.";

// Public, unauthenticated: this runs BEFORE the Supabase account exists.
// The account is created after Stripe validates the card (see finalize-trial-signup).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { email, priceId, returnUrl, environment, promoCode } = body ?? {};
    if (!email || typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("Valid email required");
    }
    if (!priceId || !["pro_monthly", "pro_annual"].includes(priceId)) {
      throw new Error("priceId must be pro_monthly or pro_annual");
    }
    if (!returnUrl || typeof returnUrl !== "string") throw new Error("returnUrl required");

    // This endpoint is public by necessity — it runs *before* the Supabase
    // account exists, so there is no JWT to require. It is therefore locked
    // down with per-IP and per-email throttling instead, and it never accepts
    // a customer id from the body: the Stripe customer is looked up/created
    // from the validated email alone.
    const ipLimited = await rateLimit(req, { scope: "create-trial-checkout", limit: 5, windowSeconds: 900 }, corsHeaders);
    if (ipLimited) return ipLimited;
    const emailLimited = await rateLimit(
      req,
      { scope: "create-trial-checkout:email", identity: email.toLowerCase(), limit: 5, windowSeconds: 3600 },
      corsHeaders,
    );
    if (emailLimited) return emailLimited;
    const env: StripeEnv = environment === "live" ? "live" : "sandbox";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Refuse if this email is already registered — trial signup is for new accounts.
    const { data: existing } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (existing?.users?.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
      // Deliberately generic: the same message and status are returned for an
      // existing account and for prior billing history, so this endpoint can't
      // be used to confirm whether an email is registered.
      return new Response(
        JSON.stringify({ error: TRIAL_INELIGIBLE }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch trial length (single-row admin settings table).
    const { data: settings } = await sb.from("billing_settings").select("trial_length_days").limit(1).maybeSingle();
    const trialDays = Math.max(1, Math.min(60, Number(settings?.trial_length_days ?? 7)));

    const stripe = createStripeClient(env);
    const prices = await stripe.prices.list({ lookup_keys: [priceId] });
    if (!prices.data.length) throw new Error(`Stripe price not found for "${priceId}"`);
    const stripePrice = prices.data[0];

    // Optional promo code — resolve promotion_code (customer-facing) or coupon id.
    // Silently ignore invalid codes; the UI validated them via `validate-promo-code`
    // before submit, so any invalid value here is a stale attempt.
    let promoDiscounts: { promotion_code?: string; coupon?: string }[] | undefined;
    if (promoCode && typeof promoCode === "string" && /^[A-Za-z0-9_-]{2,64}$/.test(promoCode)) {
      try {
        const promos = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
        if (promos.data.length) promoDiscounts = [{ promotion_code: promos.data[0].id }];
        else {
          let c: any = null;
          try { c = await stripe.coupons.retrieve(promoCode); } catch { /* not a Stripe coupon id */ }
          if (c?.valid) promoDiscounts = [{ coupon: c.id }];
          else {
            const resolved = await resolveVelaCoupon(stripe, promoCode);
            if (resolved) promoDiscounts = [{ coupon: resolved.couponId }];
          }
        }
      } catch (e) { console.warn("promo lookup failed", (e as Error).message); }
    }

    // Trial-eligibility check: block any email that already has Stripe history
    // (previous subscription, invoice, or existing customer). Prior customers
    // are directed to the paid upgrade flow instead of receiving another trial.
    const existingC = await stripe.customers.list({ email, limit: 3 });
    for (const c of existingC.data) {
      const [subs, invoices] = await Promise.all([
        stripe.subscriptions.list({ customer: c.id, status: "all", limit: 1 }),
        stripe.invoices.list({ customer: c.id, limit: 1 }),
      ]);
      if (subs.data.length > 0 || invoices.data.length > 0) {
        return new Response(
          JSON.stringify({ error: TRIAL_INELIGIBLE }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
    // Reuse a clean pending customer if one exists, otherwise create fresh.
    const customerId = existingC.data[0]?.id
      ?? (await stripe.customers.create({ email, metadata: { pending_signup: "true" } })).id;

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: "subscription",
      ui_mode: "embedded_page",
      return_url: returnUrl,
      customer: customerId,
      payment_method_collection: "always",
      subscription_data: {
        trial_period_days: trialDays,
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        metadata: { flow: "trial_signup", pending_signup_email: email.toLowerCase(), ...(promoCode ? { promoCode } : {}) },
      },
      metadata: { flow: "trial_signup", pending_signup_email: email.toLowerCase(), price_lookup_key: priceId, ...(promoCode ? { promoCode } : {}) },
      ...(promoDiscounts ? { discounts: promoDiscounts } : { allow_promotion_codes: true }),
    } as any);

    const trialEndDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
    return new Response(
      JSON.stringify({
        clientSecret: session.client_secret,
        sessionId: session.id,
        trialDays,
        trialEndDate,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[create-trial-checkout]", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});