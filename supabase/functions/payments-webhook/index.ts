import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, verifyWebhook } from "../_shared/stripe.ts";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _supabase;
}

async function handleSubscriptionCreated(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) { console.error("No userId in subscription metadata"); return; }
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await getSupabase().from("subscriptions").upsert({
    user_id: userId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: subscription.customer,
    product_id: productId,
    price_id: priceId,
    status: subscription.status,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    environment: env,
    updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_subscription_id" });
}

async function handleSubscriptionUpdated(subscription: any, env: StripeEnv) {
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await getSupabase().from("subscriptions").update({
    status: subscription.status,
    product_id: productId,
    price_id: priceId,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    updated_at: new Date().toISOString(),
  }).eq("stripe_subscription_id", subscription.id).eq("environment", env);

  // Mirror trial → active transition onto profiles so app UI updates without a Stripe call.
  const userId = subscription.metadata?.userId;
  if (userId) {
    const wasTrialing = subscription.status === "active" && !subscription.trial_end;
    if (subscription.status === "active") {
      await getSupabase().from("profiles").update({
        plan: "pro",
        subscription_status: "active",
        trial_ends_at: null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      }).eq("user_id", userId);
    } else if (subscription.status === "past_due") {
      await getSupabase().from("profiles").update({
        subscription_status: "past_due",
      }).eq("user_id", userId);
    } else if (subscription.status === "trialing") {
      await getSupabase().from("profiles").update({
        plan: "pro_trial",
        subscription_status: "trialing",
        trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      }).eq("user_id", userId);
    }
  }
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  await getSupabase().from("subscriptions").update({
    status: "canceled",
    updated_at: new Date().toISOString(),
  }).eq("stripe_subscription_id", subscription.id).eq("environment", env);

  // Revert profile to free immediately when Stripe confirms cancellation.
  const userId = subscription.metadata?.userId;
  if (userId) {
    await getSupabase().from("profiles").update({
      plan: "free",
      subscription_status: "canceled",
      trial_ends_at: null,
      current_period_end: null,
      billing_cycle: null,
    }).eq("user_id", userId);
  }
}

async function handleInvoicePaid(invoice: any, env: StripeEnv) {
  // First real charge after trial → welcome-to-pro path.
  if (invoice.billing_reason !== "subscription_cycle" && invoice.billing_reason !== "subscription_create") return;
  const subId = invoice.subscription;
  if (!subId) return;
  const { data: sub } = await getSupabase()
    .from("subscriptions").select("user_id").eq("stripe_subscription_id", subId).eq("environment", env).maybeSingle();
  const userId = (sub as any)?.user_id;
  if (!userId) return;
  await getSupabase().from("profiles").update({
    plan: "pro",
    subscription_status: "active",
    trial_ends_at: null,
    trial_welcome_shown_at: null, // triggers welcome banner on next login
  }).eq("user_id", userId);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawEnv = new URL(req.url).searchParams.get("env");
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    return new Response(JSON.stringify({ received: true, ignored: "invalid env" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  const env: StripeEnv = rawEnv;
  try {
    const event = await verifyWebhook(req, env);
    switch (event.type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object, env); break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object, env); break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object, env); break;
      case "invoice.paid":
      case "invoice.payment_succeeded":
        await handleInvoicePaid(event.data.object, env); break;
      default:
        console.log("Unhandled event:", event.type);
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Webhook error", { status: 400 });
  }
});