// Returns the customer's default card (brand/last4/expiry) and whether they
// currently have an unpaid open invoice (dunning state).
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
      .select("stripe_customer_id, status")
      .eq("user_id", user.id).eq("environment", env)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!sub?.stripe_customer_id) return json({ card: null, hasOpenInvoice: false });

    const stripe = createStripeClient(env);
    const customer = await stripe.customers.retrieve(sub.stripe_customer_id) as any;
    const defaultPmId = customer?.invoice_settings?.default_payment_method;
    let card = null;
    if (defaultPmId) {
      const pm = typeof defaultPmId === "string"
        ? await stripe.paymentMethods.retrieve(defaultPmId)
        : defaultPmId;
      if (pm?.card) card = { brand: pm.card.brand, last4: pm.card.last4, exp_month: pm.card.exp_month, exp_year: pm.card.exp_year };
    }
    const invoices = await stripe.invoices.list({ customer: sub.stripe_customer_id, status: "open", limit: 1 });
    return json({ card, hasOpenInvoice: invoices.data.length > 0, subscriptionStatus: sub.status });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}