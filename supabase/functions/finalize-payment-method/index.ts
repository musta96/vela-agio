// Finalizes the setup flow: reads the Checkout Session, attaches the new
// PaymentMethod as the default on both the customer and the subscription,
// and (if requested) retries the latest open invoice immediately.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { sessionId, retryOpenInvoice, environment } = await req.json();
    if (!sessionId) return json({ error: "sessionId required" }, 400);
    const env: StripeEnv = environment === "live" ? "live" : "sandbox";

    const stripe = createStripeClient(env);
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["setup_intent"] });
    if (session.metadata?.userId !== user.id) return json({ error: "Session mismatch" }, 403);
    const setupIntent = session.setup_intent as any;
    const paymentMethodId: string | null = setupIntent?.payment_method ?? null;
    const customerId = session.customer as string;
    if (!paymentMethodId || !customerId) return json({ error: "No payment method captured" }, 400);

    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const subscriptionId = session.metadata?.subscription_id || null;
    if (subscriptionId) {
      try {
        await stripe.subscriptions.update(subscriptionId, { default_payment_method: paymentMethodId });
      } catch (e) {
        console.warn("subscription default_payment_method update failed", (e as Error).message);
      }
    }

    // Retrieve the new card details for display.
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    const card = pm.card ? { brand: pm.card.brand, last4: pm.card.last4, exp_month: pm.card.exp_month, exp_year: pm.card.exp_year } : null;

    let retryResult: { attempted: boolean; paid?: boolean; error?: string } = { attempted: false };
    if (retryOpenInvoice && subscriptionId) {
      try {
        const invoices = await stripe.invoices.list({ customer: customerId, status: "open", limit: 5 });
        const openInvoice = invoices.data.find((i) => i.subscription === subscriptionId) ?? invoices.data[0];
        if (openInvoice?.id) {
          const paid = await stripe.invoices.pay(openInvoice.id, { payment_method: paymentMethodId });
          retryResult = { attempted: true, paid: paid.status === "paid" };
        }
      } catch (e) {
        retryResult = { attempted: true, paid: false, error: (e as Error).message };
      }
    }

    return json({ ok: true, card, retryResult });
  } catch (e) {
    console.error("finalize-payment-method error", e);
    return json({ error: (e as Error).message }, 400);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}