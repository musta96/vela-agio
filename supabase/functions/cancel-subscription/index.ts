// Schedules a Pro subscription to end at period end. Access remains until
// current_period_end; profile.plan does not change here. The
// customer.subscription.deleted webhook flips it to `free` when Stripe
// finalizes the cancellation.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
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
    const reason: string | null = typeof body.reason === "string" ? body.reason : null;
    const feedback: string | null = typeof body.feedback === "string" ? body.feedback : null;

    const { data: sub } = await sb.from("subscriptions")
      .select("stripe_subscription_id, current_period_end")
      .eq("user_id", user.id).eq("environment", env)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!sub?.stripe_subscription_id) return json({ error: "No active subscription" }, 400);

    const stripe = createStripeClient(env);
    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
      cancellation_details: reason ? { comment: (feedback ?? "").slice(0, 500), feedback: mapReason(reason) } : undefined,
    });

    await sb.from("subscriptions")
      .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq("stripe_subscription_id", sub.stripe_subscription_id).eq("environment", env);

    await sb.from("cancellation_feedback").insert({
      user_id: user.id,
      stripe_subscription_id: sub.stripe_subscription_id,
      reason, feedback, accepted_offer: false,
    });

    const endsAt = updated.current_period_end
      ? new Date(updated.current_period_end * 1000).toISOString()
      : sub.current_period_end;

    // Best-effort confirmation email — non-blocking.
    try {
      const { data: authUser } = await sb.auth.admin.getUserById(user.id);
      const email = (authUser as any)?.user?.email;
      if (email && endsAt) {
        await sb.functions.invoke("send-transactional-email", {
          body: {
            templateName: "subscription-canceled",
            recipientEmail: email,
            idempotencyKey: `cancel-${sub.stripe_subscription_id}-${endsAt}`,
            templateData: {
              endsAt,
              resumeUrl: "https://vela-agio.lovable.app/settings?tab=Billing",
            },
          },
        });
      }
    } catch (e) { console.warn("cancel email failed", (e as Error).message); }

    return json({ ok: true, endsAt });
  } catch (e) {
    console.error("cancel-subscription error", e);
    return json({ error: (e as Error).message }, 400);
  }
});

// Map our free-form reason to Stripe's cancellation_details.feedback enum
function mapReason(reason: string): any {
  const m: Record<string, string> = {
    too_expensive: "too_expensive",
    missing_features: "missing_features",
    switched_service: "switched_service",
    unused: "unused",
    customer_service: "customer_service",
    too_complex: "too_complex",
    low_quality: "low_quality",
    other: "other",
  };
  return m[reason] ?? "other";
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}