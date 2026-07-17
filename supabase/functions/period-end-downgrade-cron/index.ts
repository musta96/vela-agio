// Runs every 15 minutes. For every subscription that Stripe already marked
// canceled AND whose current_period_end has passed, flip the user's
// profile plan to 'explorer' and log a plan_downgraded audit event so the
// retention dashboard can see the flow.
//
// The webhook (customer.subscription.deleted) is the primary path; this
// cron is the safety net for cases where the webhook was missed or the
// user's profile row was not updated at the exact period-end moment.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function authed(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return false;
  const provided =
    req.headers.get("x-cron-secret") ??
    new URL(req.url).searchParams.get("secret");
  return provided === secret;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (!authed(req)) return new Response("forbidden", { status: 403 });

  const nowIso = new Date().toISOString();

  // Find canceled subs whose paid period has ended.
  const { data: subs, error } = await sb
    .from("subscriptions")
    .select("id, user_id, stripe_subscription_id, environment, current_period_end, status, cancel_at_period_end")
    .eq("status", "canceled")
    .not("current_period_end", "is", null)
    .lte("current_period_end", nowIso)
    .limit(500);

  if (error) {
    console.error("query canceled subs failed", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  let flipped = 0;
  const skipped: string[] = [];

  for (const s of subs ?? []) {
    const uid = s.user_id as string;

    // Skip if the user has a newer active/trialing sub in any env (they re-subscribed).
    const { data: newer } = await sb
      .from("subscriptions")
      .select("id, status, current_period_end")
      .eq("user_id", uid)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (newer) { skipped.push(uid); continue; }

    const { data: prof } = await sb
      .from("profiles")
      .select("plan, subscription_status")
      .eq("user_id", uid)
      .maybeSingle();

    // Already downgraded — nothing to do, but still emit the audit once by
    // checking whether we've already logged the event for this sub.
    const alreadyExplorer = (prof as any)?.plan === "explorer";

    if (!alreadyExplorer) {
      await sb.from("profiles").update({
        plan: "explorer",
        subscription_status: "canceled",
        current_period_end: null,
        reverted_to_free_at: nowIso,
      }).eq("user_id", uid);
      flipped++;
    }

    // Idempotent audit: only insert if no plan_downgraded row exists for this sub.
    const { data: existing } = await sb
      .from("cancellation_feedback")
      .select("id")
      .eq("user_id", uid)
      .eq("event_type", "plan_downgraded")
      .eq("stripe_subscription_id", s.stripe_subscription_id ?? "")
      .limit(1)
      .maybeSingle();

    if (!existing) {
      await sb.from("cancellation_feedback").insert({
        user_id: uid,
        stripe_subscription_id: s.stripe_subscription_id,
        event_type: "plan_downgraded",
        accepted_offer: false,
        metadata: {
          source: "period-end-downgrade-cron",
          environment: s.environment,
          period_ended_at: s.current_period_end,
          previous_plan: (prof as any)?.plan ?? null,
        },
      });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: subs?.length ?? 0, flipped, skipped_active_resubscribers: skipped.length, at: nowIso }),
    { headers: { "Content-Type": "application/json" } },
  );
});