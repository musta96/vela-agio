import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createStripeClient, type StripeEnv } from "../_shared/stripe.ts";

type RangeKey = "7d" | "30d" | "90d" | "12m" | "ytd" | "all";

function envFromQuery(req: Request): StripeEnv {
  const url = new URL(req.url);
  return url.searchParams.get("env") === "live" ? "live" : "sandbox";
}

function rangeBuckets(range: RangeKey): { buckets: { start: Date; end: Date; label: string }[]; step: "day" | "month" } {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const today = new Date();
  const out: { start: Date; end: Date; label: string }[] = [];
  if (range === "7d" || range === "30d" || range === "90d") {
    const n = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
      const e = new Date(d); e.setDate(d.getDate() + 1);
      out.push({ start: d, end: e, label: `${d.getDate()}/${d.getMonth() + 1}` });
    }
    return { buckets: out, step: "day" };
  }
  let count = 12;
  if (range === "ytd") count = today.getMonth() + 1;
  if (range === "all") count = 24;
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const e = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
    out.push({ start: d, end: e, label: months[d.getMonth()] });
  }
  return { buckets: out, step: "month" };
}

function monthlyAmount(price: any): number {
  if (!price?.unit_amount) return 0;
  const amt = price.unit_amount / 100;
  const interval = price.recurring?.interval;
  const count = price.recurring?.interval_count || 1;
  if (interval === "year") return amt / (12 * count);
  if (interval === "week") return (amt * 52) / 12 / count;
  if (interval === "day") return (amt * 365) / 12 / count;
  return amt / count;
}

async function listAll<T>(fetchPage: (starting_after?: string) => Promise<{ data: T[]; has_more: boolean; }>): Promise<T[]> {
  const all: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < 20; i++) {
    const page = await fetchPage(after);
    all.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    after = (page.data[page.data.length - 1] as any).id;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: claims.claims.sub, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* GET */ }
    const range: RangeKey = (body?.range as RangeKey) || "12m";
    const env = envFromQuery(req);

    const stripe = createStripeClient(env);

    // Fetch all subscriptions (any status) with expanded price/product.
    const subscriptions = await listAll<any>((after) =>
      stripe.subscriptions.list({ status: "all", limit: 100, starting_after: after, expand: ["data.items.data.price.product"] }) as any
    );

    const { buckets, step } = rangeBuckets(range);
    const rangeStart = buckets[0].start;

    // Fetch invoices created within range for new/churn computation.
    const invoices = await listAll<any>((after) =>
      stripe.invoices.list({ limit: 100, starting_after: after, created: { gte: Math.floor(rangeStart.getTime() / 1000) } }) as any
    );

    // Current MRR (active + trialing + past_due).
    let mrr = 0;
    const planCounts = new Map<string, { name: string; users: number; mrr: number; price: number; price_id: string }>();
    let activeCustomers = 0;
    const seenCustomers = new Set<string>();

    for (const sub of subscriptions) {
      if (!["active", "trialing", "past_due"].includes(sub.status)) continue;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      if (customerId && !seenCustomers.has(customerId)) {
        seenCustomers.add(customerId);
        activeCustomers++;
      }
      for (const item of sub.items?.data ?? []) {
        const monthly = monthlyAmount(item.price) * (item.quantity ?? 1);
        mrr += monthly;
        const priceId = item.price?.id ?? "unknown";
        const productName = (typeof item.price?.product === "object" ? item.price.product.name : null) ?? item.price?.lookup_key ?? "Plan";
        const entry = planCounts.get(priceId) ?? {
          name: productName,
          users: 0,
          mrr: 0,
          price: (item.price?.unit_amount ?? 0) / 100,
          price_id: priceId,
        };
        entry.users += item.quantity ?? 1;
        entry.mrr += monthly;
        planCounts.set(priceId, entry);
      }
    }

    const plans = [...planCounts.values()].sort((a, b) => b.mrr - a.mrr);

    // Bucket invoices into new MRR / churn approximation.
    // new = paid invoices net of refunded; churn = canceled-sub MRR loss in bucket.
    const series = buckets.map(b => ({ label: b.label, start: b.start.toISOString(), mrr: 0, new: 0, churn: 0, net: 0 }));
    const findBucket = (ts: number) => {
      const d = new Date(ts * 1000);
      for (let i = 0; i < buckets.length; i++) {
        if (d >= buckets[i].start && d < buckets[i].end) return i;
      }
      return -1;
    };

    for (const inv of invoices) {
      const idx = findBucket(inv.created);
      if (idx < 0) continue;
      const paid = (inv.amount_paid ?? 0) / 100;
      const isFirst = inv.billing_reason === "subscription_create";
      if (isFirst) series[idx].new += paid;
      // include all paid recurring as part of mrr-in-period
      series[idx].mrr += paid;
    }

    for (const sub of subscriptions) {
      if (sub.canceled_at) {
        const idx = findBucket(sub.canceled_at);
        if (idx < 0) continue;
        let lost = 0;
        for (const item of sub.items?.data ?? []) lost += monthlyAmount(item.price) * (item.quantity ?? 1);
        series[idx].churn += lost;
      }
    }
    for (const row of series) row.net = row.new - row.churn;

    // Trend: compare current vs previous period of same length.
    const periodLenMs = buckets[buckets.length - 1].end.getTime() - buckets[0].start.getTime();
    const prevStart = new Date(buckets[0].start.getTime() - periodLenMs);
    let prevMrr = 0, curMrr = 0;
    for (const inv of invoices) {
      const t = inv.created * 1000;
      if (t >= buckets[0].start.getTime() && t < buckets[buckets.length - 1].end.getTime()) curMrr += (inv.amount_paid ?? 0) / 100;
      else if (t >= prevStart.getTime() && t < buckets[0].start.getTime()) prevMrr += (inv.amount_paid ?? 0) / 100;
    }
    const trendPct = prevMrr > 0 ? ((curMrr - prevMrr) / prevMrr) * 100 : 0;

    // 30d churn rate: canceled subs in last 30d / active customers at start.
    const now = Date.now();
    const since30 = now - 30 * 86400_000;
    let canceled30 = 0;
    for (const sub of subscriptions) {
      if (sub.canceled_at && sub.canceled_at * 1000 >= since30) canceled30++;
    }
    const churnRate = activeCustomers + canceled30 > 0 ? (canceled30 / (activeCustomers + canceled30)) * 100 : 0;

    const arr = mrr * 12;
    const arpu = activeCustomers > 0 ? mrr / activeCustomers : 0;

    return new Response(JSON.stringify({
      env,
      range,
      step,
      kpis: { mrr, arr, arpu, paid: activeCustomers, churn_pct_30d: churnRate, trend_pct: trendPct },
      plans,
      series,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("billing-metrics error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});