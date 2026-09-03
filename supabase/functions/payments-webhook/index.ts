import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, verifyWebhook } from "../_shared/stripe.ts";
import { autoApplyRetentionOffer, planFromPriceLookup } from "../_shared/retention.ts";
import { provisionEnterpriseFirm } from "../_shared/enterprise.ts";

/**
 * Verified-payment Enterprise activation. Only ever called with a plan slug
 * derived from the Stripe price on a subscription Stripe reports as paid, so
 * a lead alone can never unlock seats.
 */
async function maybeProvisionEnterprise(plan: string, status: string, userId: string | undefined, source: string) {
  if (!userId || plan !== "enterprise") return;
  if (status !== "active" && status !== "trialing") return;
  try {
    const result = await provisionEnterpriseFirm(getSupabase() as any, userId, { source });
    console.log("[payments-webhook] enterprise provisioning", { userId, source, ...result });
  } catch (e) {
    console.warn("enterprise provisioning failed", (e as Error).message);
  }
}

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

  // Reflect the plan tier on the profile so app UI (banners, gates, plan
  // label in settings) updates without a Stripe round trip. Trials keep
  // the special "pro_trial" marker used by the trial banner.
  const planSlug = subscription.status === "trialing"
    ? "pro_trial"
    : planFromPriceLookup(priceId);
  await getSupabase().from("profiles").update({
    plan: planSlug,
    subscription_status: subscription.status,
    trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  }).eq("user_id", userId);

  await maybeProvisionEnterprise(planFromPriceLookup(priceId), subscription.status, userId, "subscription_created");
}

async function handleSubscriptionUpdated(subscription: any, env: StripeEnv) {
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  // Read the previous cancel_at_period_end so we can detect scheduled-cancel
  // and undo-cancel transitions coming from the Stripe portal (or any other
  // out-of-band source) and mirror them to the app UI + audit trail.
  const { data: previous } = await getSupabase()
    .from("subscriptions")
    .select("cancel_at_period_end, status")
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env)
    .maybeSingle();
  const wasCancelScheduled = Boolean((previous as any)?.cancel_at_period_end);
  const isCancelScheduled = Boolean(subscription.cancel_at_period_end);

  await getSupabase().from("subscriptions").update({
    status: subscription.status,
    product_id: productId,
    price_id: priceId,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: isCancelScheduled,
    updated_at: new Date().toISOString(),
  }).eq("stripe_subscription_id", subscription.id).eq("environment", env);

  // Mirror trial → active transition onto profiles so app UI updates without a Stripe call.
  const userId = subscription.metadata?.userId;
  if (userId) {
    // Mirror the cancel-at-period-end flag onto profiles so pages that
    // only read the profile row (banners, plan label) also update.
    await getSupabase().from("profiles").update({
      cancel_at_period_end: isCancelScheduled,
      cancellation_scheduled_at: isCancelScheduled ? new Date().toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    }).eq("user_id", userId);

    // Audit + email for out-of-band transitions (e.g. Stripe portal). Our
    // in-app cancel-subscription/undo-cancellation functions insert their
    // own audit rows synchronously, so we dedupe by looking for a matching
    // audit row written in the last 60 seconds before inserting one here.
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    if (isCancelScheduled && !wasCancelScheduled) {
      const { data: recent } = await getSupabase()
        .from("cancellation_feedback")
        .select("id")
        .eq("user_id", userId)
        .eq("event_type", "cancellation")
        .gte("created_at", cutoff)
        .limit(1)
        .maybeSingle();
      if (!recent) {
        await getSupabase().from("cancellation_feedback").insert({
          user_id: userId,
          stripe_subscription_id: subscription.id,
          event_type: "cancellation",
          accepted_offer: false,
          metadata: { source: "stripe_portal", environment: env, current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null },
        });
      }
    } else if (!isCancelScheduled && wasCancelScheduled) {
      const { data: recent } = await getSupabase()
        .from("cancellation_feedback")
        .select("id")
        .eq("user_id", userId)
        .eq("event_type", "cancellation_undone")
        .gte("created_at", cutoff)
        .limit(1)
        .maybeSingle();
      if (!recent) {
        await getSupabase().from("cancellation_feedback").insert({
          user_id: userId,
          stripe_subscription_id: subscription.id,
          event_type: "cancellation_undone",
          accepted_offer: false,
          metadata: { source: "stripe_portal", environment: env },
        });
      }
    }

    const activePlan = planFromPriceLookup(priceId);
    if (subscription.status === "active") {
      await getSupabase().from("profiles").update({
        plan: activePlan,
        subscription_status: "active",
        trial_ends_at: null,
        past_due_since: null,
        dunning_email_sent_at: null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      }).eq("user_id", userId);
    } else if (subscription.status === "past_due") {
      // Only stamp past_due_since the first time — the grace period is measured
      // from the initial failure, not from every subsequent retry event.
      const { data: prof } = await getSupabase().from("profiles").select("past_due_since").eq("user_id", userId).maybeSingle();
      const patch: Record<string, unknown> = { subscription_status: "past_due" };
      if (!(prof as any)?.past_due_since) patch.past_due_since = new Date().toISOString();
      await getSupabase().from("profiles").update(patch).eq("user_id", userId);
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
    // Null out the period end so `has_feature` / `my_entitlements` can't
    // keep the grace-period branch open after a hard cancellation.
    current_period_end: null,
    cancel_at_period_end: false,
    updated_at: new Date().toISOString(),
  }).eq("stripe_subscription_id", subscription.id).eq("environment", env);

  // Revert profile to free immediately when Stripe confirms cancellation.
  // Also clear every transient billing flag the Settings UI reads
  // (past-due banner, scheduled-cancel banner, dunning email marker,
  // reactivation marker) so the account cleanly moves back to Explorer.
  let userId = subscription.metadata?.userId;
  if (!userId) {
    const { data: subRow } = await getSupabase()
      .from("subscriptions").select("user_id")
      .eq("stripe_subscription_id", subscription.id).eq("environment", env)
      .maybeSingle();
    userId = (subRow as any)?.user_id;
  }
  if (userId) {
    await getSupabase().from("profiles").update({
      plan: "explorer",
      subscription_status: "canceled",
      trial_ends_at: null,
      current_period_end: null,
      billing_cycle: null,
      cancel_at_period_end: false,
      cancellation_scheduled_at: null,
      past_due_since: null,
      dunning_email_sent_at: null,
      reactivated_at: null,
      retention_offer_applied_at: null,
    }).eq("user_id", userId);

    // Audit row so the Settings billing timeline reflects the final
    // termination (as opposed to the "scheduled to cancel" event that
    // was recorded when the user first hit Cancel).
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await getSupabase()
      .from("cancellation_feedback").select("id")
      .eq("user_id", userId).eq("event_type", "subscription_ended")
      .gte("created_at", cutoff).limit(1).maybeSingle();
    if (!recent) {
      await getSupabase().from("cancellation_feedback").insert({
        user_id: userId,
        stripe_subscription_id: subscription.id,
        event_type: "subscription_ended",
        accepted_offer: false,
        metadata: { source: "stripe_webhook", environment: env, ended_at: new Date().toISOString() },
      });
    }
  }
}

// Fires ~3 days before the trial converts. Send the reminder email (if we
// haven't already) and, when the retention offer is enabled, attach the
// configured coupon to the subscription so the first paid invoice is
// discounted. Deduped via `profiles.retention_offer_applied_at`.
async function handleTrialWillEnd(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;
  await getSupabase().from("profiles").update({
    trial_ends_at: trialEnd,
    subscription_status: "trialing",
  }).eq("user_id", userId);

  // Best-effort retention nudge.
  try {
    const result = await autoApplyRetentionOffer({ userId, env, reason: "trial_will_end" });
    console.log("[payments-webhook] retention trial_will_end", result);
  } catch (e) {
    console.warn("retention auto-apply (trial) failed", (e as Error).message);
  }

  // Send the "trial ending soon" transactional email — the client copy
  // template handles the CTA. Idempotency keyed on subscription id.
  try {
    const { data: authUser } = await getSupabase().auth.admin.getUserById(userId);
    const email = (authUser as any)?.user?.email;
    if (email) {
      await getSupabase().functions.invoke("send-transactional-email", {
        body: {
          templateName: "trial-ending",
          recipientEmail: email,
          idempotencyKey: `trial-ending-${subscription.id}`,
          templateData: {
            trialEndsAt: trialEnd,
            settingsUrl: "https://vela-agio.lovable.app/settings?tab=Billing",
          },
        },
      });
    }
  } catch (e) { console.warn("trial-ending email failed", (e as Error).message); }
}

async function handleInvoicePaid(invoice: any, env: StripeEnv) {
  // First real charge after trial → welcome-to-pro path.
  if (invoice.billing_reason !== "subscription_cycle" && invoice.billing_reason !== "subscription_create") return;
  const subId = invoice.subscription;
  if (!subId) return;
  const { data: sub } = await getSupabase()
    .from("subscriptions").select("user_id, price_id").eq("stripe_subscription_id", subId).eq("environment", env).maybeSingle();
  const userId = (sub as any)?.user_id;
  if (!userId) return;
  const activePlan = planFromPriceLookup((sub as any)?.price_id);

  // Reactivation path: the profile was marked `reactivated_at` when the user
  // resubscribed after cancellation. Suppress the standard "Welcome to Pro"
  // banner and send the "Welcome back" email instead.
  const { data: prof } = await getSupabase()
    .from("profiles").select("reactivated_at").eq("user_id", userId).maybeSingle();
  const isReactivation = !!(prof as any)?.reactivated_at;

  await getSupabase().from("profiles").update({
    plan: activePlan,
    subscription_status: "active",
    trial_ends_at: null,
    past_due_since: null,
    dunning_email_sent_at: null,
    // Suppress the welcome banner for reactivations; leave null (=> show it)
    // for first-time Pro activations after trial.
    trial_welcome_shown_at: isReactivation ? new Date().toISOString() : null,
  }).eq("user_id", userId);

  if (isReactivation) {
    try {
      const { data: authUser } = await getSupabase().auth.admin.getUserById(userId);
      const email = (authUser as any)?.user?.email;
      if (email) {
        await getSupabase().functions.invoke("send-transactional-email", {
          body: {
            templateName: "welcome-back",
            recipientEmail: email,
            idempotencyKey: `reactivated-${userId}-${invoice.id}`,
            templateData: {
              dashboardUrl: "https://vela-agio.lovable.app/dashboard",
            },
          },
        });
      }
    } catch (e) { console.warn("welcome-back email failed", (e as Error).message); }
  }
}

async function handleInvoicePaymentFailed(invoice: any, env: StripeEnv) {
  const subId = invoice.subscription;
  if (!subId) return;
  const { data: sub } = await getSupabase()
    .from("subscriptions").select("user_id").eq("stripe_subscription_id", subId).eq("environment", env).maybeSingle();
  const userId = (sub as any)?.user_id;
  if (!userId) return;
  // Mirror the failed payment onto the subscription row so the Settings
  // billing UI (which reads `subscriptions.status`) flips to past_due
  // even before Stripe re-issues a `subscription.updated` event.
  await getSupabase().from("subscriptions").update({
    status: "past_due",
    updated_at: new Date().toISOString(),
  }).eq("stripe_subscription_id", subId).eq("environment", env);

  const { data: prof } = await getSupabase().from("profiles").select("past_due_since, dunning_email_sent_at").eq("user_id", userId).maybeSingle();
  const patch: Record<string, unknown> = { subscription_status: "past_due" };
  if (!(prof as any)?.past_due_since) patch.past_due_since = new Date().toISOString();
  await getSupabase().from("profiles").update(patch).eq("user_id", userId);

  // Audit row for the Settings billing timeline. Dedupe by invoice id
  // so Stripe smart-retries don't spam the log.
  try {
    const { data: existing } = await getSupabase()
      .from("cancellation_feedback").select("id")
      .eq("user_id", userId).eq("event_type", "payment_failed")
      .contains("metadata", { invoice_id: invoice.id }).limit(1).maybeSingle();
    if (!existing) {
      await getSupabase().from("cancellation_feedback").insert({
        user_id: userId,
        stripe_subscription_id: subId,
        event_type: "payment_failed",
        accepted_offer: false,
        metadata: {
          source: "stripe_webhook",
          environment: env,
          invoice_id: invoice.id,
          attempt_count: invoice.attempt_count ?? null,
          next_payment_attempt: invoice.next_payment_attempt
            ? new Date(invoice.next_payment_attempt * 1000).toISOString()
            : null,
          amount_due: invoice.amount_due ?? null,
          currency: invoice.currency ?? null,
        },
      });
    }
  } catch (e) { console.warn("payment_failed audit failed", (e as Error).message); }

  // Best-effort auto-apply of the retention offer to reduce churn on the
  // very next Stripe smart-retry attempt. Deduped so we only apply once.
  try {
    const result = await autoApplyRetentionOffer({ userId, env, reason: "past_due" });
    console.log("[payments-webhook] retention past_due", result);
  } catch (e) {
    console.warn("retention auto-apply (past_due) failed", (e as Error).message);
  }

  // Best-effort initial dunning email; idempotent via dunning_email_sent_at.
  if (!(prof as any)?.dunning_email_sent_at) {
    try {
      const { data: authUser } = await getSupabase().auth.admin.getUserById(userId);
      const email = (authUser as any)?.user?.email;
      if (email) {
        await getSupabase().functions.invoke("send-transactional-email", {
          body: {
            templateName: "payment-failed",
            recipientEmail: email,
            idempotencyKey: `dunning-${userId}-${invoice.id}`,
            templateData: {
              updateUrl: "https://vela-agio.lovable.app/settings?tab=Billing&update_pm=1",
            },
          },
        });
        await getSupabase().from("profiles").update({ dunning_email_sent_at: new Date().toISOString() }).eq("user_id", userId);
      }
    } catch (e) { console.warn("initial dunning email failed", (e as Error).message); }
  }
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
      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(event.data.object, env); break;
      case "invoice.paid":
      case "invoice.payment_succeeded":
        await handleInvoicePaid(event.data.object, env); break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object, env); break;
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