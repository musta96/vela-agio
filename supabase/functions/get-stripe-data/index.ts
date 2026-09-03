import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const ZERO_DECIMAL = new Set(["bif","clp","djf","gnf","jpy","kmf","krw","mga","pyg","rwf","ugx","vnd","vuv","xaf","xof","xpf"]);
const THREE_DECIMAL = new Set(["bhd","jod","kwd","omr","tnd"]);
function toMajor(amount: number | null | undefined, currency: string) {
  const v = amount ?? 0;
  const c = (currency ?? "").toLowerCase();
  if (ZERO_DECIMAL.has(c)) return v;
  if (THREE_DECIMAL.has(c)) return v / 1000;
  return v / 100;
}
const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const env: StripeEnv = body.environment === "live" ? "live" : "sandbox";

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Manually granted / comped plans use synthetic ids (comp_*) that don't exist in Stripe.
    if (!sub?.stripe_customer_id || !sub.stripe_customer_id.startsWith("cus_")) {
      return new Response(JSON.stringify({ invoices: [], events: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = createStripeClient(env);
    const customerId = sub.stripe_customer_id;

    const [invList, subList] = await Promise.all([
      stripe.invoices.list({ customer: customerId, limit: 12 }),
      stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 }),
    ]);

    const invoices = invList.data.map((inv: any) => ({
      id: inv.id,
      number: inv.number ?? null,
      status: inv.status ?? null,
      amount_paid: toMajor(inv.amount_paid, inv.currency),
      amount_due: toMajor(inv.amount_due, inv.currency),
      currency: inv.currency,
      created: iso(inv.created),
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
      pdf_url: inv.invoice_pdf ?? null,
    }));

    // Build a simple billing events timeline from subscription metadata.
    type Evt = { type: string; at: string; label: string; detail?: string | null };
    const events: Evt[] = [];
    for (const s of subList.data as any[]) {
      const item = s.items?.data?.[0];
      const planLabel = item?.price?.lookup_key
        ?? item?.price?.nickname
        ?? item?.price?.metadata?.lovable_external_id
        ?? s.id;

      if (s.start_date) {
        events.push({
          type: "subscription_started",
          at: iso(s.start_date)!,
          label: "Subscription started",
          detail: planLabel,
        });
      }
      const periodEnd = item?.current_period_end ?? s.current_period_end;
      if (periodEnd && ["active", "trialing", "past_due"].includes(s.status)) {
        events.push({
          type: s.cancel_at_period_end ? "ends_at_period_end" : "next_renewal",
          at: iso(periodEnd)!,
          label: s.cancel_at_period_end ? "Access ends" : "Next renewal",
          detail: planLabel,
        });
      }
      if (s.canceled_at) {
        events.push({
          type: "canceled",
          at: iso(s.canceled_at)!,
          label: "Subscription canceled",
          detail: planLabel,
        });
      }
      if (s.ended_at) {
        events.push({
          type: "ended",
          at: iso(s.ended_at)!,
          label: "Subscription ended",
          detail: planLabel,
        });
      }
    }
    for (const inv of invList.data as any[]) {
      if (inv.status === "paid" && inv.status_transitions?.paid_at) {
        events.push({
          type: "invoice_paid",
          at: iso(inv.status_transitions.paid_at)!,
          label: "Invoice paid",
          detail: inv.number ?? null,
        });
      }
    }
    events.sort((a, b) => (a.at < b.at ? 1 : -1));

    return new Response(JSON.stringify({ invoices, events }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("get-stripe-data error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});