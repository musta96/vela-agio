import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

// Public, unauthenticated: this runs BEFORE the Supabase account exists.
// The account is created after Stripe validates the card (see finalize-trial-signup).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { email, priceId, returnUrl, environment } = body ?? {};
    if (!email || typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("Valid email required");
    }
    if (!priceId || !["pro_monthly", "pro_annual"].includes(priceId)) {
      throw new Error("priceId must be pro_monthly or pro_annual");
    }
    if (!returnUrl || typeof returnUrl !== "string") throw new Error("returnUrl required");
    const env: StripeEnv = environment === "live" ? "live" : "sandbox";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Refuse if this email is already registered — trial signup is for new accounts.
    const { data: existing } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (existing?.users?.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
      return new Response(
        JSON.stringify({ error: "An account with that email already exists. Please sign in and upgrade from Settings." }),
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

    // Create a Customer keyed to the entered email only. userId will be
    // backfilled by finalize-trial-signup once the Supabase account is minted.
    const existingC = await stripe.customers.list({ email, limit: 1 });
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
        metadata: { flow: "trial_signup", pending_signup_email: email.toLowerCase() },
      },
      metadata: { flow: "trial_signup", pending_signup_email: email.toLowerCase(), price_lookup_key: priceId },
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