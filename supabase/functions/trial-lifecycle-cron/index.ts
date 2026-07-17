// Hourly cron: sends T-2 and T-1 trial reminder emails to Pro trial users.
// Idempotent via trial_reminder_2d_sent_at / trial_reminder_1d_sent_at columns.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function auth(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return false;
  const provided = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  return provided === secret;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (!auth(req)) return new Response("forbidden", { status: 403 });

  const now = Date.now();
  // T-2 window: trial ends between now+36h and now+60h and 2d reminder not sent
  const t2Lo = new Date(now + 36 * 3600 * 1000).toISOString();
  const t2Hi = new Date(now + 60 * 3600 * 1000).toISOString();
  // T-1 window: trial ends between now+12h and now+36h and 1d reminder not sent
  const t1Lo = new Date(now + 12 * 3600 * 1000).toISOString();
  const t1Hi = new Date(now + 36 * 3600 * 1000).toISOString();

  const origin = "https://vela-agio.lovable.app";
  let sent2 = 0, sent1 = 0;

  // ---- T-2 reminders ----
  {
    const { data: rows } = await sb
      .from("profiles")
      .select("user_id, trial_ends_at, billing_cycle, display_name")
      .eq("plan", "pro_trial")
      .is("trial_reminder_2d_sent_at", null)
      .gte("trial_ends_at", t2Lo)
      .lte("trial_ends_at", t2Hi)
      .limit(500);
    for (const p of rows ?? []) {
      const { data: authUser } = await sb.auth.admin.getUserById(p.user_id as string);
      const email = authUser?.user?.email;
      if (!email) continue;
      const amount = p.billing_cycle === "annual" ? "€290/year" : "€29/month";
      try {
        await sb.functions.invoke("send-transactional-email", {
          body: {
            templateName: "trial-reminder-2d",
            recipientEmail: email,
            idempotencyKey: `trial-remind-2d-${p.user_id}-${p.trial_ends_at}`,
            templateData: {
              name: p.display_name ?? "",
              trialEndsAt: p.trial_ends_at,
              amount,
              cancelUrl: `${origin}/settings?tab=Billing&cancel=1`,
              manageUrl: `${origin}/settings?tab=Billing`,
            },
          },
        });
      } catch (e) { console.warn("t-2 email failed", (e as Error).message); }
      await sb.from("profiles").update({ trial_reminder_2d_sent_at: new Date().toISOString() }).eq("user_id", p.user_id);
      sent2++;
    }
  }

  // ---- T-1 reminders ----
  {
    const { data: rows } = await sb
      .from("profiles")
      .select("user_id, trial_ends_at, billing_cycle, display_name")
      .eq("plan", "pro_trial")
      .is("trial_reminder_1d_sent_at", null)
      .gte("trial_ends_at", t1Lo)
      .lte("trial_ends_at", t1Hi)
      .limit(500);
    for (const p of rows ?? []) {
      const { data: authUser } = await sb.auth.admin.getUserById(p.user_id as string);
      const email = authUser?.user?.email;
      if (!email) continue;
      const amount = p.billing_cycle === "annual" ? "€290/year" : "€29/month";
      try {
        await sb.functions.invoke("send-transactional-email", {
          body: {
            templateName: "trial-reminder-1d",
            recipientEmail: email,
            idempotencyKey: `trial-remind-1d-${p.user_id}-${p.trial_ends_at}`,
            templateData: {
              name: p.display_name ?? "",
              trialEndsAt: p.trial_ends_at,
              amount,
              cancelUrl: `${origin}/settings?tab=Billing&cancel=1`,
            },
          },
        });
      } catch (e) { console.warn("t-1 email failed", (e as Error).message); }
      await sb.from("profiles").update({ trial_reminder_1d_sent_at: new Date().toISOString() }).eq("user_id", p.user_id);
      sent1++;
    }
  }

  return new Response(JSON.stringify({ ok: true, sent2, sent1 }), {
    headers: { "Content-Type": "application/json" },
  });
});