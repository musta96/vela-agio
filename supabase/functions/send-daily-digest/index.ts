// Daily morning digest: groups undelivered notifications and emails them.
// Triggered by pg_cron hourly; only sends to users whose preferred digest hour matches current UTC hour.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function listUsersForHour(hour: number) {
  const { data } = await supabase
    .from("alert_preferences")
    .select("user_id, email_enabled, daily_digest_enabled, digest_hour_utc")
    .eq("daily_digest_enabled", true)
    .eq("email_enabled", true)
    .eq("digest_hour_utc", hour);
  return data ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __expected = Deno.env.get("CRON_SECRET") ?? "";
  const __got = req.headers.get("x-cron-secret") ?? "";
  if (!__expected || __got !== __expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const now = new Date();
  const hour = now.getUTCHours();

  const users = await listUsersForHour(hour);
  let sent = 0;

  for (const u of users) {
    const { data: notifs } = await supabase
      .from("notifications")
      .select("id,title,body,severity,symbol,created_at")
      .eq("user_id", u.user_id)
      .is("digested_at", null)
      .is("emailed_at", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!notifs || notifs.length === 0) continue;

    // Lookup user email
    const { data: userInfo } = await supabase.auth.admin.getUserById(u.user_id);
    const email = userInfo?.user?.email;
    if (!email) continue;

    const lines = notifs
      .map((n) => `<li><strong>${n.title}</strong><br/><span style="color:#64748b">${n.body}</span></li>`)
      .join("");
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h1 style="font-size:20px;color:#0f172a">Your morning market digest</h1>
        <p style="color:#475569">You have ${notifs.length} new alert${notifs.length === 1 ? "" : "s"}.</p>
        <ul style="padding-left:18px;line-height:1.6">${lines}</ul>
        <p style="color:#64748b;font-size:12px;margin-top:24px">Manage your alerts in FTSE MIB Analytics → Alerts.</p>
      </div>`;

    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "alert-digest",
          recipientEmail: email,
          idempotencyKey: `digest-${u.user_id}-${now.toISOString().slice(0, 10)}`,
          templateData: { count: notifs.length, html },
        },
      });
      if (!error) {
        sent++;
        await supabase
          .from("notifications")
          .update({ digested_at: now.toISOString() })
          .in("id", notifs.map((n) => n.id));
      } else {
        console.error("digest send failed", error);
      }
    } catch (e) {
      console.error("digest exception", e);
    }
  }

  return new Response(JSON.stringify({ ok: true, hour, users: users.length, sent }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});