// Auto-apply the configured retention offer to a Stripe subscription.
// Shared by payments-webhook (trial_will_end, past_due) and any admin
// flow that needs to nudge a churn-risk user without opening the cancel
// dialog. Returns { applied: true } on first application, { applied:
// false, reason } if disabled, already applied, or subscription missing.
import Stripe from "https://esm.sh/stripe@22.0.2";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "./stripe.ts";

export type RetentionAutoApplyResult =
  | { applied: true; couponId: string; reason: string }
  | { applied: false; reason: string };

export async function autoApplyRetentionOffer(args: {
  userId: string;
  env: StripeEnv;
  reason: "trial_will_end" | "past_due" | "manual";
}): Promise<RetentionAutoApplyResult> {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Dedup: don't re-apply if we've already given this profile the offer.
  const { data: prof } = await sb.from("profiles")
    .select("retention_offer_applied_at")
    .eq("user_id", args.userId).maybeSingle();
  if ((prof as any)?.retention_offer_applied_at) {
    return { applied: false, reason: "already_applied" };
  }

  const { data: settings } = await sb.from("billing_settings")
    .select("retention_offer_enabled, retention_discount_type, retention_discount_value, retention_duration_months")
    .limit(1).maybeSingle();
  const s = settings as any;
  if (!s?.retention_offer_enabled) return { applied: false, reason: "disabled" };

  const { data: sub } = await sb.from("subscriptions")
    .select("stripe_subscription_id, price_id")
    .eq("user_id", args.userId).eq("environment", args.env)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!(sub as any)?.stripe_subscription_id) {
    return { applied: false, reason: "no_subscription" };
  }

  const stripe = createStripeClient(args.env);
  const type = s.retention_discount_type as "percentage" | "fixed";
  const value = Number(s.retention_discount_value);
  const months = Math.max(1, Number(s.retention_duration_months || 1));

  let currency = "eur";
  if (type === "fixed") {
    try {
      const prices = await stripe.prices.list({ lookup_keys: [(sub as any).price_id], limit: 1 });
      currency = prices.data[0]?.currency ?? "eur";
    } catch { /* keep default */ }
  }

  const coupon = await stripe.coupons.create({
    duration: "repeating",
    duration_in_months: months,
    name: `Retention offer (${months}mo, auto: ${args.reason})`,
    metadata: { purpose: "retention_offer_auto", userId: args.userId, trigger: args.reason },
    ...(type === "percentage"
      ? { percent_off: value }
      : { amount_off: Math.round(value * 100), currency }),
  } as Stripe.CouponCreateParams);

  await stripe.subscriptions.update((sub as any).stripe_subscription_id, {
    discounts: [{ coupon: coupon.id }],
  } as Stripe.SubscriptionUpdateParams);

  await sb.from("profiles")
    .update({ retention_offer_applied_at: new Date().toISOString() })
    .eq("user_id", args.userId);

  return { applied: true, couponId: coupon.id, reason: args.reason };
}

/** Map a Stripe price lookup_key (or fallback id) to a plan slug. */
export function planFromPriceLookup(priceKey: string | null | undefined): string {
  const k = (priceKey ?? "").toLowerCase();
  if (k.startsWith("plus_")) return "plus";
  if (k.startsWith("pro_")) return "pro";
  if (k.startsWith("enterprise_")) return "enterprise";
  return "pro"; // legacy — most existing rows are Pro
}