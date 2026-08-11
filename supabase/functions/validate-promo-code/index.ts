// Validates a Stripe promotion code (or coupon id) against a specific price
// and returns a discount preview the UI can render before the user confirms.
//
// Public: called from unauthenticated trial signup as well as authenticated
// upgrade/reactivation flows. Never mutates anything — read-only lookup.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { lookupVelaCode, resolveVelaCoupon } from "../_shared/velaCoupon.ts";

function money(cents: number, currency: string) {
  return { cents, currency, formatted: new Intl.NumberFormat("en-IE", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { code, priceLookupKey, environment } = await req.json();
    if (!code || typeof code !== "string" || !/^[A-Za-z0-9_-]{2,64}$/.test(code)) {
      return json({ valid: false, error: "Enter a valid promo code" }, 200);
    }
    if (!priceLookupKey || typeof priceLookupKey !== "string") {
      return json({ valid: false, error: "Missing price" }, 200);
    }
    const env: StripeEnv = environment === "live" ? "live" : "sandbox";
    const stripe = createStripeClient(env);

    // Beta codes grant full access through the referral redemption route; they
    // are valid access codes, but they must not be sent to Stripe as coupons.
    const velaCode = await lookupVelaCode(code);
    if (velaCode?.found && velaCode.active && !velaCode.expired && !velaCode.exhausted && velaCode.kind === "beta") {
      return json({ valid: true, kind: "beta", code: code.toUpperCase() });
    }

    // Try promotion code first (customer-facing codes), then fall back to
    // coupon id (admin-configured). Only accept active promotion codes.
    let coupon: any = null;
    let promotionCodeId: string | null = null;
    try {
      const promos = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
      if (promos.data.length) {
        promotionCodeId = promos.data[0].id;
        coupon = promos.data[0].coupon;
      }
    } catch { /* ignore */ }
    if (!coupon) {
      try {
        const c = await stripe.coupons.retrieve(code);
        if (c?.valid) coupon = c;
      } catch { /* ignore */ }
    }
    // Fall back to Vela referral/discount codes stored in our own database.
    // These are created in the owner console and may only carry a percent_off.
    if (!coupon) {
      // Mint (and cache) the real Stripe coupon now so the preview shown here
      // is exactly the discount checkout will apply.
      const resolved = await resolveVelaCoupon(stripe, code);
      if (resolved) coupon = resolved.coupon;
    }
    if (!coupon || coupon.valid === false) {
      return json({ valid: false, error: "That promo code isn't valid" }, 200);
    }

    // Look up the price so we can preview the discounted total.
    const prices = await stripe.prices.list({ lookup_keys: [priceLookupKey], limit: 1 });
    if (!prices.data.length) return json({ valid: false, error: "Price not found" }, 200);
    const price = prices.data[0];
    const unitAmount = price.unit_amount ?? 0;
    const currency = price.currency ?? "eur";

    let discountCents = 0;
    if (coupon.percent_off) discountCents = Math.round(unitAmount * (coupon.percent_off / 100));
    else if (coupon.amount_off) discountCents = Math.min(unitAmount, coupon.amount_off);
    const finalCents = Math.max(0, unitAmount - discountCents);

    const durationLabel = coupon.duration === "forever"
      ? "on every renewal"
      : coupon.duration === "once"
        ? "on your first payment only"
        : coupon.duration === "repeating"
          ? `for the first ${coupon.duration_in_months} month${coupon.duration_in_months === 1 ? "" : "s"}`
          : "";

    return json({
      valid: true,
      kind: "discount",
      code,
      promotionCodeId,
      couponId: coupon.id,
      percentOff: coupon.percent_off ?? null,
      amountOff: coupon.amount_off ?? null,
      duration: coupon.duration,
      durationInMonths: coupon.duration_in_months ?? null,
      durationLabel,
      original: money(unitAmount, currency),
      discount: money(discountCents, currency),
      final: money(finalCents, currency),
    });
  } catch (e) {
    return json({ valid: false, error: (e as Error).message }, 200);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}