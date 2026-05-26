import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const OWNER_EMAIL = "mustarelli.edoardo@gmail.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller is the owner
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const callerEmail = (userRes.user.email || "").toLowerCase();
    const admin = createClient(supabaseUrl, serviceKey);
    let isOwner = callerEmail === OWNER_EMAIL;
    if (!isOwner) {
      const { data: rr } = await admin.from("user_roles").select("role").eq("user_id", userRes.user.id).eq("role", "admin");
      isOwner = (rr?.length ?? 0) > 0;
    }
    if (!isOwner) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- POST: actions -------------------------------------------------
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = String(body?.action || "");
      if (!action) {
        // No action → treat as data load (invoke() defaults to POST with empty body)
      } else {
      const logIncident = (category: string, payload: any, reason?: string) =>
        admin.from("incident_log").insert({
          actor_id: userRes.user!.id,
          actor_email: userRes.user!.email,
          category,
          action,
          reason: reason ?? null,
          payload,
        });
      const logAudit = (entity: string, entity_id: string | null, payload: any) =>
        admin.from("audit_log").insert({
          actor_id: userRes.user!.id,
          actor_email: userRes.user!.email,
          action,
          entity,
          entity_id,
          payload,
        });

      try {
        switch (action) {
          case "toggle_control": {
            const { key, enabled, reason } = body;
            await admin.from("platform_controls").upsert({ key, enabled: !!enabled, reason: reason ?? null, updated_by: userRes.user.id, updated_at: new Date().toISOString() });
            await logIncident("kill_switch", { key, enabled }, reason);
            return ok({ ok: true });
          }
          case "create_banner": {
            const { message, severity, expires_at } = body;
            const { data } = await admin.from("platform_banners").insert({ message, severity: severity || "info", expires_at: expires_at || null, created_by: userRes.user.id }).select().single();
            await logAudit("platform_banners", data?.id ?? null, { message, severity });
            return ok({ banner: data });
          }
          case "deactivate_banner": {
            const { id } = body;
            await admin.from("platform_banners").update({ active: false }).eq("id", id);
            await logAudit("platform_banners", id, { active: false });
            return ok({ ok: true });
          }
          case "suspend_user": {
            const { user_id, reason } = body;
            await admin.from("user_suspensions").upsert({ user_id, reason: reason || null, suspended_by: userRes.user.id, suspended_at: new Date().toISOString() });
            await admin.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
            await logIncident("user", { user_id }, reason);
            return ok({ ok: true });
          }
          case "unsuspend_user": {
            const { user_id } = body;
            await admin.from("user_suspensions").delete().eq("user_id", user_id);
            await admin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
            await logIncident("user", { user_id }, "unsuspend");
            return ok({ ok: true });
          }
          case "delete_user": {
            const { user_id, reason } = body;
            await admin.auth.admin.deleteUser(user_id);
            await logIncident("gdpr", { user_id }, reason || "Right to erasure");
            return ok({ ok: true });
          }
          case "force_password_reset": {
            const { email } = body;
            await admin.auth.admin.generateLink({ type: "recovery", email });
            await logAudit("auth", null, { email });
            return ok({ ok: true });
          }
          case "grant_role": {
            const { user_id, role } = body;
            await admin.from("user_roles").upsert({ user_id, role });
            await logAudit("user_roles", user_id, { role, op: "grant" });
            return ok({ ok: true });
          }
          case "revoke_role": {
            const { user_id, role } = body;
            await admin.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
            await logAudit("user_roles", user_id, { role, op: "revoke" });
            return ok({ ok: true });
          }
          case "set_feature_flag": {
            const { key, label, enabled, category, description } = body;
            await admin.from("feature_flags").upsert({ key, label: label || key, enabled: !!enabled, category: category || "general", description: description || null, updated_by: userRes.user.id, updated_at: new Date().toISOString() });
            await logAudit("feature_flags", key, { enabled });
            return ok({ ok: true });
          }
          case "retract_signal": {
            const { id, reason } = body;
            await admin.from("ai_signal_log").update({ status: "retracted", retracted_by: userRes.user.id, retracted_reason: reason || null, retracted_at: new Date().toISOString() }).eq("id", id);
            await logIncident("ai_governance", { id }, reason);
            return ok({ ok: true });
          }
          case "purge_user_data": {
            const { user_id, reason } = body;
            // GDPR Article 17: anonymize + delete records across user-owned tables, then delete the auth user.
            const tables = [
              "portfolios", "portfolio_holdings", "portfolio_simulations", "watchlist_items",
              "alert_rules", "alert_preferences", "notifications", "investor_profiles",
              "broker_accounts", "broker_positions", "live_order_intents", "feature_requests",
              "user_consents", "user_roles", "user_api_keys", "snaptrade_connections",
              "net_worth_accounts", "net_worth_snapshots", "profiles",
            ];
            for (const t of tables) await admin.from(t).delete().eq("user_id", user_id);
            await admin.auth.admin.deleteUser(user_id);
            await logIncident("gdpr_erasure", { user_id }, reason || "Right to erasure");
            return ok({ ok: true });
          }
          default:
            return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: jsonHeaders });
        }
      } catch (err: any) {
        return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: jsonHeaders });
      }
      }
    }

    // List all users (paged)
    const allUsers: any[] = [];
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      allUsers.push(...data.users);
      if (!data.users.length || data.users.length < 200) break;
      page++;
      if (page > 25) break;
    }

    // Aggregate stats
    const now = Date.now();
    const day = 86400_000;
    const last24h = allUsers.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < day).length;
    const last7d = allUsers.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 7 * day).length;
    const newLast7d = allUsers.filter((u) => u.created_at && now - new Date(u.created_at).getTime() < 7 * day).length;
    const confirmed = allUsers.filter((u) => u.email_confirmed_at).length;

    // Recent audit + portfolios/holdings counts
    const [{ count: pCount }, { count: hCount }, { count: nwCount }, { data: recentAudit }] = await Promise.all([
      admin.from("portfolios").select("*", { count: "exact", head: true }),
      admin.from("portfolio_holdings").select("*", { count: "exact", head: true }),
      admin.from("net_worth_accounts").select("*", { count: "exact", head: true }),
      admin.from("audit_log").select("ts, actor_email, action, entity, payload").order("ts", { ascending: false }).limit(50),
    ]);

    // Per-user portfolio counts
    const { data: portfolioRows } = await admin.from("portfolios").select("user_id");
    const portfolioByUser: Record<string, number> = {};
    for (const r of portfolioRows || []) portfolioByUser[(r as any).user_id] = (portfolioByUser[(r as any).user_id] || 0) + 1;

    const users = allUsers
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        provider: (u.app_metadata as any)?.provider,
        portfolios: portfolioByUser[u.id] || 0,
      }));

    const [{ data: controls }, { data: banners }, { data: signals }, { data: incidents }, { data: flags }, { data: suspensions }] = await Promise.all([
      admin.from("platform_controls").select("*").order("key"),
      admin.from("platform_banners").select("*").order("created_at", { ascending: false }).limit(50),
      admin.from("ai_signal_log").select("*").order("created_at", { ascending: false }).limit(100),
      admin.from("incident_log").select("*").order("ts", { ascending: false }).limit(50),
      admin.from("feature_flags").select("*").order("category"),
      admin.from("user_suspensions").select("*"),
    ]);
    const suspendedSet = new Set((suspensions || []).map((s: any) => s.user_id));
    const rolesMap: Record<string, string[]> = {};
    const { data: allRoles } = await admin.from("user_roles").select("user_id, role");
    for (const r of allRoles || []) {
      const arr = rolesMap[(r as any).user_id] || [];
      arr.push((r as any).role);
      rolesMap[(r as any).user_id] = arr;
    }

    return new Response(JSON.stringify({
      stats: {
        total: allUsers.length,
        confirmed,
        signedInLast24h: last24h,
        signedInLast7d: last7d,
        newLast7d,
        portfolios: pCount || 0,
        holdings: hCount || 0,
        netWorthAccounts: nwCount || 0,
      },
      users: users.map((u) => ({ ...u, suspended: suspendedSet.has(u.id), roles: rolesMap[u.id] || [] })),
      recentAudit: recentAudit || [],
      controls: controls || [],
      banners: banners || [],
      signals: signals || [],
      incidents: incidents || [],
      flags: flags || [],
    }), { headers: jsonHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" } as const;
function ok(body: unknown) { return new Response(JSON.stringify(body), { headers: jsonHeaders }); }