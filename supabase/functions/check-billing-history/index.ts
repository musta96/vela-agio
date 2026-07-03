// Authenticated. Returns whether the caller has prior Stripe billing history
// (past subscription / invoice / customer) so the UI can switch upgrade copy
// to reactivation and offer the saved card. Never mutates state.
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
    const stripe = createStripeClient(env);

    // Locate a Stripe customer for this user: prefer metadata.userId lookup,
    // fall back to email match. Either indicates prior billing history.
    let customerId: string | null = null;
    try {
      const byMeta = await stripe.customers.search({ query: `metadata['userId']:'${user.id}'`, limit: 1 });
      if (byMeta.data.length) customerId = byMeta.data[0].id;
    } catch { /* search may fail on brand-new accounts — that's fine */ }
    if (!customerId && user.email) {
      const byEmail = await stripe.customers.list({ email: user.email, limit: 1 });
      if (byEmail.data.length) customerId = byEmail.data[0].id;
    }

    if (!customerId) return json({ hasHistory: false, card: null, hasDefaultPaymentMethod: false });

    const [subs, invoices, customer] = await Promise.all([
      stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 }),
      stripe.invoices.list({ customer: customerId, limit: 1 }),
      stripe.customers.retrieve(customerId) as Promise<any>,
    ]);
    const hasHistory = subs.data.length > 0 || invoices.data.length > 0;

    let card: { brand: string; last4: string; exp_month: number; exp_year: number } | null = null;
    const defaultPmId = customer?.invoice_settings?.default_payment_method;
    if (defaultPmId) {
      const pm = typeof defaultPmId === "string"
        ? await stripe.paymentMethods.retrieve(defaultPmId)
        : defaultPmId;
      if (pm?.card) card = { brand: pm.card.brand, last4: pm.card.last4, exp_month: pm.card.exp_month, exp_year: pm.card.exp_year };
    }

    return json({
      hasHistory,
      card,
      hasDefaultPaymentMethod: !!defaultPmId,
      customerId, // used by reactivate-subscription; not sensitive to expose to the owning user
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}