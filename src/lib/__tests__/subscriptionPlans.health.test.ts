/**
 * CI health check: every ACTIVE row in public.subscription_plans that
 * represents a real paid tier (monthly OR yearly price > 0) MUST have both
 * `stripe_monthly_price_id` and `stripe_yearly_price_id` set, otherwise
 * Stripe Embedded Checkout can't resolve a price for it and the upgrade
 * silently breaks in production.
 *
 * Runs as a normal vitest test against the live Supabase project via the
 * publishable (anon) key — RLS policy "plans_public_read" allows reads of
 * active plans. Fails CI if any active paid tier is missing its keys.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

describe("subscription_plans health", () => {
  it.runIf(!!url && !!key)(
    "every active paid plan has both stripe_monthly_price_id and stripe_yearly_price_id",
    async () => {
      const sb = createClient(url!, key!);
      const { data, error } = await sb
        .from("subscription_plans")
        .select("id,slug,tier,is_active,monthly_price_cents,yearly_price_cents,stripe_monthly_price_id,stripe_yearly_price_id")
        .eq("is_active", true);
      expect(error, error?.message).toBeNull();
      expect(Array.isArray(data)).toBe(true);

      const broken = (data ?? []).filter((p: any) => {
        const isPaid = (p.monthly_price_cents ?? 0) > 0 || (p.yearly_price_cents ?? 0) > 0;
        if (!isPaid) return false; // free tier exempt
        return !p.stripe_monthly_price_id || !p.stripe_yearly_price_id;
      });

      if (broken.length) {
        const detail = broken
          .map((p: any) =>
            `  - ${p.slug ?? p.id} (tier=${p.tier}): monthly=${p.stripe_monthly_price_id ?? "NULL"}, yearly=${p.stripe_yearly_price_id ?? "NULL"}`)
          .join("\n");
        throw new Error(
          `subscription_plans has ${broken.length} active paid plan(s) missing Stripe lookup keys:\n${detail}\n` +
          "→ Backfill stripe_monthly_price_id / stripe_yearly_price_id before users can subscribe to these tiers.",
        );
      }
    },
    20_000,
  );
});