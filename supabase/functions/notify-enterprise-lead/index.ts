// Fires after an enterprise lead is submitted. Fans a notification out to
// every admin (in-app) and attempts an email via Lovable transactional
// emails if the template is configured. Failure to email is not fatal;
// the lead row already exists.
import { createClient } from "npm:@supabase/supabase-js@2";
import { rateLimit, requireUserId } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Anyone could previously fire admin notifications or probe lead ids with
    // just the anon key. The endpoint now accepts two trusted callers only:
    //   1. a server context presenting the internal notify secret, and
    //   2. a signed-in user, rate limited per account.
    // Anonymous lead submissions no longer notify from the browser; the
    // enterprise_leads insert itself is what admins read.
    const internalSecret = Deno.env.get("INTERNAL_NOTIFY_SECRET");
    const presented = req.headers.get("x-internal-secret");
    const trustedServer = !!internalSecret && presented === internalSecret;

    let callerId: string | null = null;
    if (!trustedServer) {
      const uid = await requireUserId(req);
      callerId = uid;
      if (!uid) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const limited = await rateLimit(
        req,
        { scope: "notify-enterprise-lead", identity: uid, limit: 5, windowSeconds: 600 },
        corsHeaders,
      );
      if (limited) return limited;
    }

    const ipLimited = await rateLimit(req, { scope: "notify-enterprise-lead:ip", limit: 20, windowSeconds: 600 }, corsHeaders);
    if (ipLimited) return ipLimited;

    const { lead_id } = await req.json();
    if (!lead_id || typeof lead_id !== "string") {
      return new Response(JSON.stringify({ error: "lead_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lead, error: leadErr } = await sb
      .from("enterprise_leads")
      .select("id,user_id,first_name,last_name,email,company,firm_name,num_clients,message,role,created_at")
      .eq("id", lead_id)
      .maybeSingle();
    if (leadErr || !lead) throw leadErr ?? new Error("lead not found");

    // A signed-in caller may only notify for a lead they themselves submitted,
    // unless they hold an admin role. Otherwise any account could enumerate
    // lead ids and spam admin notifications/emails.
    if (!trustedServer) {
      const ownsLead = !!callerId && lead.user_id === callerId;
      let isAdmin = false;
      if (callerId && !ownsLead) {
        const { data: adminRole } = await sb.rpc("has_role", { _user_id: callerId, _role: "admin" });
        isAdmin = adminRole === true;
      }
      if (!ownsLead && !isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const firm = lead.firm_name || lead.company || "—";
    const contactName = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || lead.email;
    const title = "New Enterprise lead";
    const body = `${contactName} from ${firm}${lead.num_clients ? ` (~${lead.num_clients} clients)` : ""}`;

    // 1) Fan-out in-app notification to every admin.
    const { data: admins } = await sb
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const rows = (admins ?? []).map((a: any) => ({
      user_id: a.user_id,
      kind: "enterprise_lead",
      title,
      body,
      severity: "info",
      payload: { lead_id: lead.id, email: lead.email, firm, num_clients: lead.num_clients ?? null },
    }));
    if (rows.length) {
      const { error: notifErr } = await sb.from("notifications").insert(rows);
      if (notifErr) console.error("[notify-enterprise-lead] notif insert failed", notifErr);
    }

    // 2) Best-effort email to admin addresses via Lovable transactional email.
    //    Silently ignored when the template is not registered / infra is not set up.
    try {
      // Look up admin email addresses from auth.users.
      const adminIds = (admins ?? []).map((a: any) => a.user_id);
      if (adminIds.length) {
        // deno-lint-ignore no-explicit-any
        const { data: usersRes } = await (sb.auth.admin as any).listUsers({ perPage: 1000 });
        const emails: string[] = (usersRes?.users ?? [])
          .filter((u: any) => adminIds.includes(u.id) && !!u.email)
          .map((u: any) => u.email as string);

        await Promise.all(
          emails.map((to) =>
            sb.functions
              .invoke("send-transactional-email", {
                body: {
                  templateName: "enterprise-lead-alert",
                  recipientEmail: to,
                  idempotencyKey: `enterprise-lead-${lead.id}-${to}`,
                  templateData: {
                    contactName,
                    email: lead.email,
                    firm,
                    role: lead.role,
                    numClients: lead.num_clients ?? null,
                    message: lead.message ?? "",
                  },
                },
              })
              .catch((e) => console.warn("[notify-enterprise-lead] email skipped", e?.message)),
          ),
        );
      }
    } catch (e) {
      console.warn("[notify-enterprise-lead] email step skipped", (e as Error).message);
    }

    // 3) Audit trail.
    await sb.from("audit_log").insert({
      action: "enterprise_lead.submitted",
      entity: "enterprise_leads",
      entity_id: lead.id,
      payload: { firm, email: lead.email, num_clients: lead.num_clients ?? null },
    }).catch(() => undefined);

    return new Response(JSON.stringify({ ok: true, notified: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[notify-enterprise-lead] failed", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});