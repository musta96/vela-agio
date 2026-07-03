// Hourly cron. For every profile with subscription_status='past_due':
//   - If Stripe already recovered the invoice (subscription active again),
//     clear past_due_since. (Webhook usually handles this; belt-and-braces.)
//   - Otherwise, once past_due_since is older than grace_period_days
//     (from billing_settings), downgrade plan → 'free', cancel Stripe
//     subscription, and send the "Pro access has ended" email.
// Also (re)sends the initial dunning email if the webhook missed it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function auth(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return true;
  const provided = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  return provided === secret;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (!auth(req)) return new Response("forbidden", { status: 403 });

  const origin = "https://vela-agio.lovable.app";
  const { data: settings } = await sb.from("billing_settings").select("grace_period_days").limit(1).maybeSingle();
  const graceDays = (settings as any)?.grace_period_days ?? 3;

  const { data: rows } = await sb.from("profiles")
    .select("user_id, past_due_since, dunning_email_sent_at, display_name, plan, subscription_status")
    .eq("subscription_status", "past_due")
    .limit(500);

  let expired = 0, reminded = 0;
  for (const p of rows ?? []) {
    const { data: authUser } = await sb.auth.admin.getUserById(p.user_id as string);
    const email = authUser?.user?.email;
    if (!email) continue;

    // Send the initial dunning email if the webhook path didn't manage to
    // (idempotent via dunning_email_sent_at).
    if (!p.dunning_email_sent_at) {
      try {
        await sb.functions.invoke("send-transactional-email", {
          body: {
            templateName: "payment-failed",
            recipientEmail: email,
            idempotencyKey: `dunning-${p.user_id}-${p.past_due_since ?? "init"}`,
            templateData: {
              name: p.display_name ?? "",
              updateUrl: `${origin}/settings?tab=Billing&update_pm=1`,
              graceDays,
            },
          },
        });
        await sb.from("profiles").update({ dunning_email_sent_at: new Date().toISOString() }).eq("user_id", p.user_id);
        reminded++;
      } catch (e) { console.warn("dunning email failed", (e as Error).message); }
    }

    const since = p.past_due_since ? new Date(p.past_due_since).getTime() : null;
    if (!since) continue;
    const ageMs = Date.now() - since;
    if (ageMs < graceDays * 86400 * 1000) continue;

    // Grace period expired → downgrade + cancel Stripe subscription.
    for (const env of ["sandbox", "live"] as StripeEnv[]) {
      const { data: sub } = await sb.from("subscriptions")
        .select("stripe_subscription_id, status")
        .eq("user_id", p.user_id).eq("environment", env)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!sub?.stripe_subscription_id) continue;
      if (sub.status === "active" || sub.status === "trialing") continue; // recovered
      try {
        const stripe = createStripeClient(env);
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      } catch (e) { console.warn("stripe cancel failed", (e as Error).message); }
    }

    await sb.from("profiles").update({
      plan: "free",
      subscription_status: "canceled",
      past_due_since: null,
      reverted_to_free_at: new Date().toISOString(),
      trial_ends_at: null,
      current_period_end: null,
    }).eq("user_id", p.user_id);

    try {
      await sb.functions.invoke("send-transactional-email", {
        body: {
          templateName: "pro-access-ended",
          recipientEmail: email,
          idempotencyKey: `dunning-ended-${p.user_id}-${p.past_due_since}`,
          templateData: {
            name: p.display_name ?? "",
            reactivateUrl: `${origin}/reactivate`,
          },
        },
      });
    } catch (e) { console.warn("ended email failed", (e as Error).message); }
    expired++;
  }

  return new Response(JSON.stringify({ ok: true, reminded, expired, graceDays }), {
    headers: { "Content-Type": "application/json" },
  });
});