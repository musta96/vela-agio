import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

// Called from the trial-signup return page AFTER Stripe validates the card.
// Verifies the checkout session, creates the Supabase account, backfills
// userId onto the Stripe Customer + Subscription, inserts the subscriptions
// row, and returns a signed-in session so the client can move to onboarding.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const {
      sessionId, email, password, environment,
      billingCycle, // 'monthly' | 'annual'
      consent = {},
    } = body ?? {};

    if (!sessionId || typeof sessionId !== "string") throw new Error("sessionId required");
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Valid email required");
    if (!password || typeof password !== "string" || password.length < 6) throw new Error("Password must be at least 6 characters");
    if (!["monthly", "annual"].includes(billingCycle)) throw new Error("billingCycle must be monthly or annual");
    const env: StripeEnv = environment === "live" ? "live" : "sandbox";

    const stripe = createStripeClient(env);
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer", "subscription.latest_invoice.payment_intent", "setup_intent", "payment_intent"],
    });
    if (!session) throw new Error("Checkout session not found");
    const meta = (session.metadata ?? {}) as Record<string, string>;
    if (meta.flow !== "trial_signup") throw new Error("Not a trial-signup session");
    if (meta.pending_signup_email !== email.toLowerCase()) throw new Error("Email does not match checkout session");

    const subscription = session.subscription as any;
    if (!subscription || !["trialing", "active"].includes(subscription.status)) {
      // Surface the SPECIFIC decline reason so the client can render an
      // actionable message ("Insufficient funds", "Card declined by your
      // bank", "Card requires 3D Secure", etc.) instead of a generic error.
      const setupIntent: any = (session as any).setup_intent;
      const paymentIntent: any =
        (subscription?.latest_invoice as any)?.payment_intent ??
        (session as any).payment_intent;
      const lastError =
        setupIntent?.last_setup_error ??
        paymentIntent?.last_payment_error ??
        null;
      const declineCode: string | null = lastError?.decline_code ?? lastError?.code ?? null;
      const declineMessage: string | null = lastError?.message ?? null;
      const humanReason = declineMessage
        ?? (declineCode ? `Card was declined (${declineCode}).` : `Card was not validated (status: ${subscription?.status ?? "unknown"}).`);
      return new Response(JSON.stringify({
        error: `${humanReason} Please try a different card — no account has been created.`,
        declineCode,
        declineReason: humanReason,
        canRetryWithNewCard: true,
      }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (!customerId) throw new Error("Missing customer on session");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Create the Supabase account NOW (auto-confirmed since Stripe validated the card).
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        plan: "pro_trial",
        signup_flow: "trial",
        billing_cycle: billingCycle,
        ack_terms: !!consent.ackTerms,
        ack_not_advice: !!consent.ackNotAdvice,
        ack_risk: !!consent.ackRisk,
        marketing_opt_in: !!consent.marketingOptIn,
        consented_at: new Date().toISOString(),
      },
    });
    if (createErr || !created?.user) throw new Error(createErr?.message ?? "Failed to create account");
    const userId = created.user.id;

    // Backfill userId onto Stripe Customer + Subscription so webhooks and
    // Stripe search queries can find this user later.
    try {
      await stripe.customers.update(customerId, { metadata: { userId } });
      await stripe.subscriptions.update(subscription.id, { metadata: { ...(subscription.metadata ?? {}), userId } });
    } catch (e) { console.warn("stripe backfill failed", (e as Error).message); }

    // Insert the subscriptions row directly so the app immediately sees Pro
    // access without waiting for the webhook.
    const item = subscription.items?.data?.[0];
    const priceId = item?.price?.lookup_key ?? item?.price?.id ?? null;
    const productId = typeof item?.price?.product === "string" ? item.price.product : item?.price?.product?.id ?? null;
    const periodStart = item?.current_period_start ?? subscription.current_period_start;
    const periodEnd = item?.current_period_end ?? subscription.current_period_end;
    const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null;

    await sb.from("subscriptions").upsert({
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      product_id: productId,
      price_id: priceId,
      status: subscription.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: !!subscription.cancel_at_period_end,
      environment: env,
      updated_at: new Date().toISOString(),
    }, { onConflict: "stripe_subscription_id" });

    // Mirror the trial state onto profiles so the app can read it without a Stripe call.
    await sb.from("profiles").update({
      plan: "pro_trial",
      trial_ends_at: trialEnd,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      billing_cycle: billingCycle,
      subscription_status: subscription.status,
    }).eq("user_id", userId);

    // Log consent (best effort).
    void sb.from("user_consents").insert({
      user_id: userId,
      tos_version: "v1",
      privacy_version: "v1",
      marketing_opt_in: !!consent.marketingOptIn,
      user_agent: req.headers.get("User-Agent") ?? "",
    });

    // Best-effort confirmation email; ignore failure so signup still succeeds.
    const amount = billingCycle === "annual" ? "€290/year" : "€29/month";
    try {
      await sb.functions.invoke("send-transactional-email", {
        body: {
          templateName: "trial-confirmation",
          recipientEmail: email,
          idempotencyKey: `trial-confirm-${subscription.id}`,
          templateData: {
            trialEndsAt: trialEnd,
            amount,
            billingCycle,
            manageUrl: `${req.headers.get("origin") ?? ""}/settings?tab=billing`,
          },
        },
      });
    } catch (e) { console.warn("confirmation email skipped:", (e as Error).message); }

    return new Response(JSON.stringify({
      ok: true,
      userId,
      trialEndsAt: trialEnd,
      subscriptionStatus: subscription.status,
      billingCycle,
      amount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[finalize-trial-signup]", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});