// Switch a user's Pro billing cycle between monthly and annual.
// - monthly → annual: swap the price now with proration_behavior='always_invoice'
//   so Stripe issues an immediate invoice for the difference (credit for
//   unused monthly time + charge for the annual period).
// - annual → monthly: schedule the swap at current_period_end via
//   SubscriptionSchedule. No refund for unused annual time; user keeps Pro
//   access until the end of the paid annual period.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) throw new Error("Not authenticated");

    const body = await req.json();
    const targetCycle: "monthly" | "annual" = body?.targetCycle;
    const environment: StripeEnv = body?.environment === "live" ? "live" : "sandbox";
    if (!["monthly", "annual"].includes(targetCycle)) throw new Error("targetCycle must be 'monthly' or 'annual'");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userRes, error: userErr } = await sb.auth.getUser(authHeader);
    if (userErr || !userRes?.user) throw new Error("Not authenticated");
    const userId = userRes.user.id;

    // Find the active subscription
    const { data: sub } = await sb
      .from("subscriptions")
      .select("stripe_subscription_id, environment, status")
      .eq("user_id", userId)
      .eq("environment", environment)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub?.stripe_subscription_id) throw new Error("No active subscription");

    // Look up Pro price ids
    const { data: plan } = await sb
      .from("subscription_plans")
      .select("stripe_monthly_price_id, stripe_yearly_price_id")
      .eq("tier", "pro").eq("is_active", true).limit(1).maybeSingle();
    if (!plan) throw new Error("Pro plan not configured");
    const monthlyLookup: string = (plan as any).stripe_monthly_price_id;
    const annualLookup: string = (plan as any).stripe_yearly_price_id;
    const targetLookup = targetCycle === "annual" ? annualLookup : monthlyLookup;

    const stripe = createStripeClient(environment);
    const prices = await stripe.prices.list({ lookup_keys: [targetLookup] });
    if (!prices.data.length) throw new Error(`Target price not found for lookup "${targetLookup}"`);
    const targetPriceId = prices.data[0].id;

    const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const currentItem = subscription.items.data[0];
    const currentInterval = (currentItem.price?.recurring as any)?.interval as string | undefined;
    const alreadyOnTarget =
      (targetCycle === "annual" && currentInterval === "year") ||
      (targetCycle === "monthly" && currentInterval === "month");
    if (alreadyOnTarget) throw new Error(`Already on ${targetCycle} billing`);

    if (targetCycle === "annual") {
      // Upgrade cycle immediately with proration + invoice now
      const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        items: [{ id: currentItem.id, price: targetPriceId }],
        proration_behavior: "always_invoice",
        billing_cycle_anchor: "now",
        metadata: { ...(subscription.metadata ?? {}), userId, billing_cycle: "annual" },
      });
      await sb.from("profiles").update({ billing_cycle: "annual" }).eq("user_id", userId);
      return new Response(JSON.stringify({
        ok: true,
        effective_at: new Date().toISOString(),
        subscription_id: updated.id,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Downgrade to monthly at end of current annual period via SubscriptionSchedule
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: sub.stripe_subscription_id,
    });
    const currentPhase = schedule.phases[0];
    const periodEnd = (currentPhase as any).end_date ?? (subscription as any).current_period_end;
    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: [
        {
          items: [{ price: currentItem.price!.id, quantity: currentItem.quantity ?? 1 }],
          start_date: (currentPhase as any).start_date,
          end_date: periodEnd,
          proration_behavior: "none",
        },
        {
          items: [{ price: targetPriceId, quantity: 1 }],
          iterations: 1,
          proration_behavior: "none",
          metadata: { userId, billing_cycle: "monthly" },
        },
      ],
    });
    // Note: don't update profiles.billing_cycle yet — the switch happens at period end.
    return new Response(JSON.stringify({
      ok: true,
      effective_at: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      scheduled: true,
      schedule_id: schedule.id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[switch-billing-cycle]", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});