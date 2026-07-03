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

    const { data: sub } = await sb.from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", user.id).eq("environment", env)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!sub?.stripe_subscription_id) return json({ error: "No subscription" }, 400);

    const stripe = createStripeClient(env);
    await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: false });
    await sb.from("subscriptions")
      .update({ cancel_at_period_end: false, updated_at: new Date().toISOString() })
      .eq("stripe_subscription_id", sub.stripe_subscription_id).eq("environment", env);

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}