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
      if (!action || ["load", "list", "get", "read"].includes(action)) {
        // No/memoized load action → treat as data load (invoke() may default to POST)
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
          case "retract_signal_notify": {
            const { id, reason } = body;
            const { data: sig } = await admin.from("ai_signal_log").select("user_id, symbol, signal_type").eq("id", id).maybeSingle();
            await admin.from("ai_signal_log").update({ status: "retracted", retracted_by: userRes.user.id, retracted_reason: reason || null, retracted_at: new Date().toISOString() }).eq("id", id);
            if (sig?.user_id) {
              await admin.from("notifications").insert({
                user_id: sig.user_id, kind: "ai_retraction", severity: "warning",
                title: `AI signal retracted${sig.symbol ? `: ${sig.symbol}` : ""}`,
                body: reason || "An AI-generated signal you received has been retracted by the platform.",
                symbol: sig.symbol || null,
                payload: { signal_id: id, signal_type: sig.signal_type },
              });
            }
            await logIncident("ai_governance", { id, notified: !!sig?.user_id }, reason);
            return ok({ ok: true });
          }
          case "bulk_retract_by_symbol": {
            const { symbol, since, reason } = body;
            let q = admin.from("ai_signal_log").select("id, user_id, symbol, signal_type").eq("symbol", String(symbol || "").toUpperCase()).neq("status", "retracted");
            if (since) q = q.gte("created_at", since);
            const { data: rows } = await q;
            const ids = (rows || []).map((r: any) => r.id);
            if (ids.length) {
              await admin.from("ai_signal_log").update({ status: "retracted", retracted_by: userRes.user.id, retracted_reason: reason || null, retracted_at: new Date().toISOString() }).in("id", ids);
              const notifs = (rows || []).filter((r: any) => r.user_id).map((r: any) => ({
                user_id: r.user_id, kind: "ai_retraction", severity: "warning",
                title: `AI signal retracted: ${r.symbol}`,
                body: reason || "An AI-generated signal you received has been retracted by the platform.",
                symbol: r.symbol, payload: { signal_id: r.id, bulk: true },
              }));
              if (notifs.length) await admin.from("notifications").insert(notifs);
            }
            await logIncident("ai_governance", { symbol, count: ids.length, since }, reason);
            return ok({ ok: true, retracted: ids.length });
          }
          case "panic_mode": {
            const { enabled, reason } = body;
            const keys = ["maintenance_mode", "ai_signals_halted", "live_trading_disabled", "emails_paused", "signups_disabled", "data_feeds_frozen"];
            for (const key of keys) {
              await admin.from("platform_controls").upsert({ key, enabled: !!enabled, reason: reason || "PANIC MODE", updated_by: userRes.user.id, updated_at: new Date().toISOString() });
            }
            await logIncident("panic_mode", { enabled, keys }, reason);
            return ok({ ok: true });
          }
          case "toggle_control_expiry": {
            const { key, enabled, reason, expires_at } = body;
            await admin.from("platform_controls").upsert({ key, enabled: !!enabled, reason: reason ?? null, expires_at: expires_at || null, updated_by: userRes.user.id, updated_at: new Date().toISOString() });
            await logIncident("kill_switch", { key, enabled, expires_at }, reason);
            return ok({ ok: true });
          }
          case "user_detail": {
            const { user_id } = body;
            const [{ data: prof }, { data: ports }, { data: holds }, { data: nwa }, { data: bkr }, { data: cons }, { data: sigs }, { data: susp }, { data: roles }, { data: ord }] = await Promise.all([
              admin.from("profiles").select("*").eq("user_id", user_id).maybeSingle(),
              admin.from("portfolios").select("*").eq("user_id", user_id),
              admin.from("portfolio_holdings").select("*").eq("user_id", user_id),
              admin.from("net_worth_accounts").select("*").eq("user_id", user_id),
              admin.from("broker_accounts").select("*").eq("user_id", user_id),
              admin.from("user_consents").select("*").eq("user_id", user_id).order("accepted_at", { ascending: false }),
              admin.from("ai_signal_log").select("*").eq("user_id", user_id).order("created_at", { ascending: false }).limit(20),
              admin.from("user_suspensions").select("*").eq("user_id", user_id).maybeSingle(),
              admin.from("user_roles").select("role").eq("user_id", user_id),
              admin.from("live_order_intents").select("*").eq("user_id", user_id).order("created_at", { ascending: false }).limit(20),
            ]);
            const { data: au } = await admin.auth.admin.getUserById(user_id);
            return ok({ profile: prof, auth: au?.user, portfolios: ports, holdings: holds, net_worth: nwa, brokers: bkr, consents: cons, signals: sigs, suspension: susp, roles: (roles || []).map((r: any) => r.role), orders: ord });
          }
          case "impersonate_log": {
            const { user_id, purpose } = body;
            const { data: u } = await admin.auth.admin.getUserById(user_id);
            await admin.from("admin_sessions").insert({
              actor_id: userRes.user.id, actor_email: userRes.user.email,
              target_user_id: user_id, target_email: u?.user?.email || null,
              purpose: purpose || "support read-only review",
            });
            await logIncident("impersonation", { user_id }, purpose);
            return ok({ ok: true });
          }
          case "request_erasure": {
            const { user_id, reason, days } = body;
            const { data: u } = await admin.auth.admin.getUserById(user_id);
            const scheduled = new Date(Date.now() + (Number(days) || 30) * 86400_000).toISOString();
            const { data: req } = await admin.from("gdpr_erasure_requests").insert({
              user_id, user_email: u?.user?.email || null,
              requested_by: userRes.user.id, requested_by_email: userRes.user.email,
              reason: reason || "Right to erasure (Art. 17)", scheduled_for: scheduled,
            }).select().single();
            await logIncident("gdpr_erasure_requested", { user_id, scheduled }, reason);
            return ok({ request: req });
          }
          case "cancel_erasure": {
            const { id, reason } = body;
            await admin.from("gdpr_erasure_requests").update({ status: "cancelled", notes: reason || null, updated_at: new Date().toISOString() }).eq("id", id);
            await logIncident("gdpr_erasure_cancelled", { id }, reason);
            return ok({ ok: true });
          }
          case "execute_erasure": {
            const { id } = body;
            const { data: req } = await admin.from("gdpr_erasure_requests").select("*").eq("id", id).single();
            if (!req) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: jsonHeaders });
            const tables = ["portfolios","portfolio_holdings","portfolio_simulations","watchlist_items","alert_rules","alert_preferences","notifications","investor_profiles","broker_accounts","broker_positions","live_order_intents","feature_requests","user_consents","user_roles","user_api_keys","snaptrade_connections","net_worth_accounts","net_worth_snapshots","profiles"];
            for (const t of tables) await admin.from(t).delete().eq("user_id", (req as any).user_id);
            await admin.auth.admin.deleteUser((req as any).user_id);
            const cert = `gdpr-erasure-${id}-${new Date().toISOString().slice(0,10)}`;
            await admin.from("gdpr_erasure_requests").update({ status: "completed", completed_at: new Date().toISOString(), certificate_url: cert }).eq("id", id);
            await logIncident("gdpr_erasure_completed", { id, user_id: (req as any).user_id }, "Scheduled erasure executed");
            return ok({ ok: true, certificate: cert });
          }
          case "run_healthchecks": {
            const checks: { service: string; status: string; latency_ms: number | null; detail: string | null }[] = [];
            const check = async (service: string, url: string) => {
              const t0 = Date.now();
              try {
                const r = await fetch(url, { method: "GET" });
                const ms = Date.now() - t0;
                checks.push({ service, status: r.ok ? "ok" : "degraded", latency_ms: ms, detail: `HTTP ${r.status}` });
              } catch (e: any) {
                checks.push({ service, status: "down", latency_ms: null, detail: String(e?.message || e) });
              }
            };
            await check("yahoo_proxy", "https://api.allorigins.win/raw?url=https%3A%2F%2Fquery1.finance.yahoo.com%2Fv7%2Ffinance%2Fquote%3Fsymbols%3DAAPL");
            await check("supabase_rest", `${supabaseUrl}/rest/v1/`);
            try {
              const t0 = Date.now();
              const { error } = await admin.from("profiles").select("user_id", { head: true, count: "exact" }).limit(1);
              checks.push({ service: "database", status: error ? "down" : "ok", latency_ms: Date.now() - t0, detail: error?.message || "ok" });
            } catch (e: any) {
              checks.push({ service: "database", status: "down", latency_ms: null, detail: String(e?.message || e) });
            }
            for (const c of checks) {
              await admin.from("health_checks").upsert({ ...c, last_checked: new Date().toISOString() });
            }
            return ok({ checks });
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
          case "export_user_data": {
            // GDPR Article 20 — data portability. Returns a JSON bundle of every row this user owns.
            const { user_id } = body;
            const tables = [
              "profiles", "user_roles", "user_consents", "investor_profiles",
              "portfolios", "portfolio_holdings", "portfolio_simulations",
              "watchlist_items", "alert_rules", "alert_preferences", "notifications",
              "broker_accounts", "broker_positions", "live_order_intents",
              "net_worth_accounts", "net_worth_snapshots", "feature_requests",
              "ai_signal_log",
            ];
            const bundle: Record<string, unknown> = { exported_at: new Date().toISOString(), user_id };
            for (const t of tables) {
              const { data } = await admin.from(t).select("*").eq("user_id", user_id);
              bundle[t] = data || [];
            }
            const { data: u } = await admin.auth.admin.getUserById(user_id);
            bundle["auth_user"] = u?.user || null;
            await logAudit("gdpr_export", user_id, { tables: tables.length });
            return ok({ bundle });
          }
          case "export_audit_csv": {
            const { from, to } = body;
            let q = admin.from("audit_log").select("ts, actor_email, action, entity, entity_id, payload, ip").order("ts", { ascending: false }).limit(5000);
            if (from) q = q.gte("ts", from);
            if (to) q = q.lte("ts", to);
            const { data } = await q;
            const rows = data || [];
            const header = "ts,actor_email,action,entity,entity_id,ip,payload\n";
            const esc = (v: unknown) => {
              if (v == null) return "";
              const s = typeof v === "string" ? v : JSON.stringify(v);
              return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const csv = header + rows.map((r: any) => [r.ts, r.actor_email, r.action, r.entity, r.entity_id, r.ip, r.payload].map(esc).join(",")).join("\n");
            return new Response(csv, { headers: { ...corsHeaders, "Content-Type": "text/csv" } });
          }
          case "set_ai_config": {
            // Stores all AI governance knobs in platform_controls under key "ai_config".
            const { value } = body;
            await admin.from("platform_controls").upsert({
              key: "ai_config",
              enabled: true,
              value: value || {},
              updated_by: userRes.user.id,
              updated_at: new Date().toISOString(),
            });
            await logAudit("ai_config", null, value);
            return ok({ ok: true });
          }
          case "force_reconsent": {
            // Bumps a control flag the client reads to force re-acceptance of T&C.
            const { version, reason } = body;
            await admin.from("platform_controls").upsert({
              key: "required_consent_version",
              enabled: true,
              value: { version: version || new Date().toISOString().slice(0, 10) },
              reason: reason || null,
              updated_by: userRes.user.id,
              updated_at: new Date().toISOString(),
            });
            await logIncident("gdpr", { version }, reason);
            return ok({ ok: true });
          }
          case "legal_upsert": {
            const { id, kind, version, title, body: docBody, status } = body;
            const row: Record<string, unknown> = {
              kind, version, title,
              body: docBody ?? "",
              status: status || "draft",
              created_by: userRes.user.id,
              updated_at: new Date().toISOString(),
            };
            if (id) (row as any).id = id;
            const { data, error } = await admin.from("legal_documents").upsert(row).select().single();
            if (error) throw error;
            await logAudit("legal_documents", (data as any)?.id ?? null, { kind, version, status });
            return ok({ document: data });
          }
          case "legal_publish": {
            const { id } = body;
            const { data } = await admin.from("legal_documents").update({
              status: "published",
              published_at: new Date().toISOString(),
            }).eq("id", id).select().single();
            await logAudit("legal_documents", id, { op: "publish" });
            return ok({ document: data });
          }
          case "legal_unpublish": {
            const { id } = body;
            await admin.from("legal_documents").update({ status: "draft" }).eq("id", id);
            await logAudit("legal_documents", id, { op: "unpublish" });
            return ok({ ok: true });
          }
          case "legal_delete": {
            const { id } = body;
            await admin.from("legal_documents").delete().eq("id", id);
            await logAudit("legal_documents", id, { op: "delete" });
            return ok({ ok: true });
          }
          case "legal_notify_users": {
            // Force a re-consent prompt and (optionally) drop an in-app notification for every user.
            const { version, message } = body;
            await admin.from("platform_controls").upsert({
              key: "required_consent_version", enabled: true,
              value: { version: version || new Date().toISOString().slice(0, 10) },
              updated_by: userRes.user.id, updated_at: new Date().toISOString(),
            });
            if (message) {
              const { data: us } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
              const rows = (us?.users || []).map((u) => ({
                user_id: u.id, kind: "legal_update", severity: "info",
                title: "Updated legal documents", body: message,
              }));
              if (rows.length) await admin.from("notifications").insert(rows);
            }
            await logIncident("gdpr", { version }, "legal_notify_users");
            return ok({ ok: true });
          }
          case "apikey_revoke": {
            const { id } = body;
            await admin.from("user_api_keys").delete().eq("id", id);
            await logAudit("user_api_keys", id, { op: "revoke" });
            return ok({ ok: true });
          }
          default:
            return new Response(JSON.stringify({ error: "Unknown action", action }), { status: 400, headers: jsonHeaders });
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

    const [{ data: controls }, { data: banners }, { data: signals }, { data: incidents }, { data: flags }, { data: suspensions }, { data: consents }, { data: auditFull }] = await Promise.all([
      admin.from("platform_controls").select("*").order("key"),
      admin.from("platform_banners").select("*").order("created_at", { ascending: false }).limit(50),
      admin.from("ai_signal_log").select("*").order("created_at", { ascending: false }).limit(100),
      admin.from("incident_log").select("*").order("ts", { ascending: false }).limit(50),
      admin.from("feature_flags").select("*").order("category"),
      admin.from("user_suspensions").select("*"),
      admin.from("user_consents").select("*").order("accepted_at", { ascending: false }).limit(500),
      admin.from("audit_log").select("*").order("ts", { ascending: false }).limit(500),
    ]);
    const [{ data: erasure }, { data: sessions }, { data: health }] = await Promise.all([
      admin.from("gdpr_erasure_requests").select("*").order("created_at", { ascending: false }).limit(100),
      admin.from("admin_sessions").select("*").order("created_at", { ascending: false }).limit(50),
      admin.from("health_checks").select("*"),
    ]);
    const [{ data: legalDocs }, { data: apiKeys }, { data: profilesList }] = await Promise.all([
      admin.from("legal_documents").select("*").order("updated_at", { ascending: false }),
      admin.from("user_api_keys").select("id, user_id, provider, hint, created_at, updated_at").order("created_at", { ascending: false }).limit(500),
      admin.from("profiles").select("user_id, display_name, avatar_url"),
    ]);
    const profileByUser: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
    for (const p of profilesList || []) profileByUser[(p as any).user_id] = { display_name: (p as any).display_name, avatar_url: (p as any).avatar_url };
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
      users: users.map((u) => ({
        ...u,
        suspended: suspendedSet.has(u.id),
        roles: rolesMap[u.id] || [],
        display_name: profileByUser[u.id]?.display_name || null,
        avatar_url: profileByUser[u.id]?.avatar_url || null,
      })),
      recentAudit: recentAudit || [],
      controls: controls || [],
      banners: banners || [],
      signals: signals || [],
      incidents: incidents || [],
      flags: flags || [],
      consents: consents || [],
      audit: auditFull || [],
      erasure: erasure || [],
      sessions: sessions || [],
      health: health || [],
      legal: legalDocs || [],
      apiKeys: apiKeys || [],
    }), { headers: jsonHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" } as const;
function ok(body: unknown) { return new Response(JSON.stringify(body), { headers: jsonHeaders }); }