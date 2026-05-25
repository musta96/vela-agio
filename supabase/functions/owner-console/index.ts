import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    if ((userRes.user.email || "").toLowerCase() !== OWNER_EMAIL) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(supabaseUrl, serviceKey);

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
      users,
      recentAudit: recentAudit || [],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});