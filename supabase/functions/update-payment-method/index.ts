// Creates a Stripe Embedded Checkout session in `setup` mode so the user
// can enter a new card. No charge occurs here. The return handler
// (`update-payment-method-return`) attaches the resulting PaymentMethod as
// the customer + subscription default, and optionally retries any open
// invoice.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@22.0.2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const env: StripeEnv = body.environment === "live" ? "live" : "sandbox";
    const returnUrl: string = body.returnUrl ?? "https://vela-agio.lovable.app/settings?tab=Billing";

    const { data: sub } = await sb.from("subscriptions")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("user_id", user.id).eq("environment", env)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!sub?.stripe_customer_id) return json({ error: "No customer on file" }, 400);

    const stripe = createStripeClient(env);
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: sub.stripe_customer_id,
      currency: "eur",
      ui_mode: "embedded",
      return_url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}pm_session_id={CHECKOUT_SESSION_ID}`,
      metadata: { userId: user.id, subscription_id: sub.stripe_subscription_id ?? "", purpose: "update_payment_method" },
    } as Stripe.Checkout.SessionCreateParams);

    return json({ clientSecret: session.client_secret });
  } catch (e) {
    console.error("update-payment-method error", e);
    return json({ error: (e as Error).message }, 400);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}