// POST /functions/v1/grant-advisory-consent
// Authenticated. Mediates creation of advisory_consents rows so the granted_to
// principal cannot be set to an arbitrary client-supplied UUID. Verifies that:
//   1. The caller is the user_id (consent owner)
//   2. The granted_to user actually holds an admin/compliance/support role
//   3. Scope is on the whitelist
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_SCOPE = new Set(["portfolio_read", "net_worth_read", "full"]);
const STAFF_ROLES = ["admin", "compliance", "support"] as const;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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
  const userId = userRes.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const grantedTo = String(body.granted_to ?? "").trim();
  const scope = String(body.scope ?? "").trim();
  const mandateRefRaw = body.mandate_ref;
  const mandateRef =
    typeof mandateRefRaw === "string" && mandateRefRaw.trim().length > 0
      ? mandateRefRaw.trim().slice(0, 120)
      : null;
  const expiresAtRaw = body.expires_at;
  const expiresAt =
    typeof expiresAtRaw === "string" && expiresAtRaw.length > 0 ? expiresAtRaw : null;

  if (!UUID_RE.test(grantedTo)) return json({ error: "invalid_granted_to" }, 400);
  if (grantedTo === userId) return json({ error: "cannot_grant_to_self" }, 400);
  if (!ALLOWED_SCOPE.has(scope)) return json({ error: "invalid_scope" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Verify granted_to is an actual staff member with one of the allowed roles.
  const { data: rolesRows, error: rolesErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", grantedTo)
    .in("role", STAFF_ROLES as unknown as string[]);

  if (rolesErr) return json({ error: "role_lookup_failed" }, 500);
  if (!rolesRows || rolesRows.length === 0) {
    return json({ error: "granted_to_not_staff" }, 403);
  }

  const { data: inserted, error: insertErr } = await admin
    .from("advisory_consents")
    .insert({
      user_id: userId,
      granted_to: grantedTo,
      scope,
      mandate_ref: mandateRef,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertErr) return json({ error: insertErr.message }, 400);

  return json({ ok: true, id: inserted.id });
});
