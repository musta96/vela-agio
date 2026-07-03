// Cancels an active Pro trial IMMEDIATELY (no waiting for trial_ends_at).
// - Cancels the Stripe subscription right now (invoice_now=false, prorate=false)
// - Reverts profile.plan to 'free' and clears trial state
// - Sends a cancellation confirmation email
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) throw new Error("Not authenticated");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userRes, error: userErr } = await sb.auth.getUser(authHeader);
    if (userErr || !userRes?.user) throw new Error("Not authenticated");
    const user = userRes.user;

    const { data: profile } = await sb
      .from("profiles")
      .select("plan, billing_cycle, trial_ends_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile || profile.plan !== "pro_trial") {
      throw new Error("No active trial to cancel");
    }

    // Find the latest sub row for this user
    const { data: sub } = await sb
      .from("subscriptions")
      .select("stripe_subscription_id, environment")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sub?.stripe_subscription_id) {
      const env: StripeEnv = (sub.environment === "live" ? "live" : "sandbox");
      const stripe = createStripeClient(env);
      try {
        // Cancel NOW (not at period end) so no charge occurs
        await stripe.subscriptions.cancel(sub.stripe_subscription_id, {
          invoice_now: false,
          prorate: false,
        });
      } catch (e) {
        console.warn("stripe cancel failed", (e as Error).message);
      }
      await sb.from("subscriptions")
        .update({ status: "canceled", cancel_at_period_end: false, updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", sub.stripe_subscription_id);
    }

    // Revert profile to free IMMEDIATELY
    await sb.from("profiles").update({
      plan: "free",
      subscription_status: "canceled",
      trial_ends_at: null,
      current_period_end: null,
      billing_cycle: null,
      trial_canceled_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    // Confirmation email (best-effort)
    try {
      await sb.functions.invoke("send-transactional-email", {
        body: {
          templateName: "trial-canceled",
          recipientEmail: user.email,
          idempotencyKey: `trial-canceled-${user.id}-${Date.now()}`,
          templateData: {
            resubscribeUrl: `${req.headers.get("origin") ?? "https://vela-agio.lovable.app"}/pricing`,
          },
        },
      });
    } catch (e) { console.warn("cancel email failed", (e as Error).message); }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cancel-trial]", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});