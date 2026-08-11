// Resolves a Vela-issued referral/discount code (created in the owner console)
// into a real Stripe coupon. Owner-created codes only carry `percent_off`, so
// the matching Stripe coupon is minted on first use and cached back on the row.
import { createClient } from "npm:@supabase/supabase-js@2";

export type VelaCouponResult = { couponId: string; coupon: any } | null;

export type VelaCodeLookup = {
  found: boolean;
  kind?: "beta" | "discount";
  active?: boolean;
  expired?: boolean;
  exhausted?: boolean;
  percent_off?: number | null;
  stripe_coupon_id?: string | null;
  plan_id?: string | null;
  label?: string | null;
};

export async function lookupVelaCode(code: string): Promise<VelaCodeLookup | null> {
  if (!code || !/^[A-Za-z0-9_-]{2,64}$/.test(code)) return null;
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await sb.rpc("lookup_referral_code", { _code: code });
  if (error) throw error;
  return data as VelaCodeLookup;
}

export async function resolveVelaCoupon(
  stripe: any,
  code: string,
  opts: { mint?: boolean } = { mint: true },
): Promise<VelaCouponResult> {
  if (!code || !/^[A-Za-z0-9_-]{2,64}$/.test(code)) return null;
  try {
    const r = await lookupVelaCode(code);
    if (!r?.found || !r.active || r.expired || r.exhausted) return null;
    if (r.kind !== "discount") return null;

    if (r.stripe_coupon_id) {
      try {
        const existing = await stripe.coupons.retrieve(String(r.stripe_coupon_id));
        if (existing?.valid !== false) return { couponId: existing.id, coupon: existing };
      } catch { /* stale id — fall through and re-mint */ }
    }
    if (!r.percent_off || opts.mint === false) return null;

    const created = await stripe.coupons.create({
      percent_off: Number(r.percent_off),
      duration: "forever",
      name: `Referral ${code.toUpperCase()}`,
      metadata: { referralCode: code.toUpperCase(), source: "vela_referral" },
    });
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await sb.from("referral_codes").update({ stripe_coupon_id: created.id }).ilike("code", code);
    return { couponId: created.id, coupon: created };
  } catch (e) {
    console.warn("resolveVelaCoupon failed", (e as Error).message);
    return null;
  }
}
