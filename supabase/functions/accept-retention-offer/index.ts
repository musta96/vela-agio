// Applies the current retention offer (from billing_settings) as a coupon
// on the user's Stripe subscription. Keeps them on Pro; does not cancel.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@22.0.2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const env: StripeEnv = body.environment === "live" ? "live" : "sandbox";

    const { data: settings } = await sb.from("billing_settings")
      .select("retention_offer_enabled, retention_discount_type, retention_discount_value, retention_duration_months")
      .eq("id", 1).maybeSingle();
    if (!settings || !(settings as any).retention_offer_enabled) {
      return json({ error: "Retention offer is not currently available" }, 400);
    }

    const { data: sub } = await sb.from("subscriptions")
      .select("stripe_subscription_id, stripe_customer_id, price_id")
      .eq("user_id", user.id).eq("environment", env)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!sub?.stripe_subscription_id) return json({ error: "No active subscription" }, 400);

    const stripe = createStripeClient(env);

    const type = (settings as any).retention_discount_type as "percentage" | "fixed";
    const value = Number((settings as any).retention_discount_value);
    const months = Math.max(1, Number((settings as any).retention_duration_months || 1));

    // Currency for fixed-amount coupons — fetch the price.
    let currency = "eur";
    if (type === "fixed") {
      try {
        const prices = await stripe.prices.list({ lookup_keys: [sub.price_id as string], limit: 1 });
        currency = prices.data[0]?.currency ?? "eur";
      } catch { /* keep default */ }
    }

    const couponParams: Stripe.CouponCreateParams = {
      duration: "repeating",
      duration_in_months: months,
      name: `Retention offer (${months}mo)`,
      metadata: { purpose: "retention_offer", userId: user.id },
      ...(type === "percentage"
        ? { percent_off: value }
        : { amount_off: Math.round(value * 100), currency }),
    };
    const coupon = await stripe.coupons.create(couponParams);

    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: false,
      discounts: [{ coupon: coupon.id }],
    } as Stripe.SubscriptionUpdateParams);

    await sb.from("subscriptions")
      .update({ cancel_at_period_end: false, updated_at: new Date().toISOString() })
      .eq("stripe_subscription_id", sub.stripe_subscription_id).eq("environment", env);

    await sb.from("cancellation_feedback").insert({
      user_id: user.id,
      stripe_subscription_id: sub.stripe_subscription_id,
      reason: "accepted_retention_offer",
      accepted_offer: true,
      event_type: "retention_offer_accepted",
      metadata: {
        discount_type: type,
        discount_value: value,
        duration_months: months,
        coupon_id: coupon.id,
        environment: env,
      },
    });

    return json({ ok: true, coupon_id: coupon.id });
  } catch (e) {
    console.error("accept-retention-offer error", e);
    return json({ error: (e as Error).message }, 400);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}