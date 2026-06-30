// POST /functions/v1/submit-ticket
// Authenticated. Validates input, enforces per-user rate limit & basic spam guards,
// inserts into public.support_tickets, and optionally pings Slack via SUPPORT_SLACK_WEBHOOK_URL.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_CATEGORY = new Set(["bug", "feature", "question", "feedback", "other"]);
const ALLOWED_SEVERITY = new Set(["low", "normal", "high", "urgent"]);
const ALLOWED_SOURCE = new Set(["chat", "settings", "helper_bot", "other"]);

// Cheap spam heuristics — block obvious junk before we hit the DB / notify Slack.
const SPAM_PATTERNS = [
  /\b(?:viagra|cialis|casino|bitcoin\s+giveaway|crypto\s+airdrop|seo\s+services|loan\s+offer)\b/i,
  /https?:\/\/\S+\s+https?:\/\/\S+\s+https?:\/\/\S+/i, // 3+ URLs
  /(.)\1{30,}/, // long character repetition
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthenticated" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "unauthenticated" }, 401);
  const user = userRes.user;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const subject = String(body.subject ?? "").trim();
  const message = String(body.message ?? "").trim();
  const category = String(body.category ?? "feedback");
  const severity = String(body.severity ?? "normal");
  const source = String(body.source ?? "settings");
  const page_url = body.page_url ? String(body.page_url).slice(0, 500) : null;
  const user_agent = (req.headers.get("user-agent") ?? "").slice(0, 500) || null;

  // ---- Validation ----
  if (subject.length < 3 || subject.length > 200) return json({ error: "Subject must be 3–200 characters." }, 400);
  if (message.length < 5 || message.length > 5000) return json({ error: "Message must be 5–5000 characters." }, 400);
  if (!ALLOWED_CATEGORY.has(category)) return json({ error: "Invalid category." }, 400);
  if (!ALLOWED_SEVERITY.has(severity)) return json({ error: "Invalid severity." }, 400);
  if (!ALLOWED_SOURCE.has(source)) return json({ error: "Invalid source." }, 400);

  // ---- Spam heuristics ----
  const combined = `${subject}\n${message}`;
  if (SPAM_PATTERNS.some((re) => re.test(combined))) {
    return json({ error: "Submission rejected by spam filter." }, 422);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Rate limit: 5 tickets / 10 min, 20 / 24h, and duplicate-subject in last hour ----
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();

  const [{ count: recent10 }, { count: recent24h }, { data: dupe }] = await Promise.all([
    admin.from("support_tickets").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", tenMinAgo),
    admin.from("support_tickets").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", dayAgo),
    admin.from("support_tickets").select("id").eq("user_id", user.id).eq("subject", subject).eq("message", message).gte("created_at", fiveMinAgo).limit(1),
  ]);

  if ((recent10 ?? 0) >= 5)  return json({ error: "Too many submissions. Please wait 10 minutes before submitting again." }, 429);
  if ((recent24h ?? 0) >= 20) return json({ error: "Daily ticket limit reached. Please email support directly." }, 429);
  if (dupe && dupe.length > 0) return json({ error: "This looks like a duplicate of a ticket you just submitted. Please wait a few minutes or change the subject/message." }, 429);

  // ---- Insert ----
  const { data: ticket, error: insErr } = await admin
    .from("support_tickets")
    .insert({
      user_id: user.id,
      user_email: user.email ?? null,
      category, severity, source, subject, message, page_url, user_agent,
    })
    .select("id, created_at")
    .maybeSingle();

  if (insErr || !ticket) {
    console.error("[submit-ticket] insert failed", insErr);
    return json({ error: insErr?.message || "Could not create ticket." }, 500);
  }

  // ---- Optional Slack notification ----
  const slackUrl = Deno.env.get("SUPPORT_SLACK_WEBHOOK_URL");
  if (slackUrl) {
    const sevEmoji: Record<string, string> = { low: "🟢", normal: "🔵", high: "🟠", urgent: "🔴" };
    const text = `${sevEmoji[severity] ?? "🔵"} *New ${category}* from ${user.email ?? user.id}\n*${subject}*\n${message.slice(0, 800)}${message.length > 800 ? "…" : ""}${page_url ? `\n_Page: ${page_url}_` : ""}`;
    try {
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch (e) { console.error("[submit-ticket] slack notify failed", e); }
  }

  return json({ ok: true, id: ticket.id, created_at: ticket.created_at });
});