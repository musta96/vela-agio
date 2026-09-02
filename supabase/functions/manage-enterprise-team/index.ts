import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Enterprise seat management.
 *
 * Every mutation is authorised here rather than in the client: the caller's
 * JWT decides which firm they act on, the firm's `seat_limit` is enforced
 * server-side, and invitation tokens are only ever stored as SHA-256 hashes
 * so a leaked table dump cannot be replayed to claim a seat.
 */

const ROLES = new Set(["firm_admin", "advisor", "analyst", "viewer"]);
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Tier for the caller, read from the plan catalogue rather than the client. */
async function planSlugFor(db: ReturnType<typeof admin>, userId: string): Promise<string> {
  const { data } = await db.from("profiles").select("plan").eq("user_id", userId).maybeSingle();
  return String((data as any)?.plan ?? "explorer").toLowerCase();
}

function isEnterprise(plan: string) {
  return plan === "enterprise" || plan === "advisor" || plan === "elite";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const db = admin();
    const { data: claimsRes } = await db.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claimsRes?.claims?.sub as string | undefined;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String((body as any)?.action ?? "");

    // ---- Accepting an invitation is the one action open to any signed-in
    // user: the token itself is the proof, and seat limits are re-checked.
    if (action === "accept_invite") {
      const token = String((body as any)?.token ?? "");
      if (!token) return json({ error: "Missing token" }, 400);
      const hash = await sha256(token);
      const { data: invite } = await db
        .from("enterprise_invitations").select("*").eq("token_hash", hash).maybeSingle();
      if (!invite) return json({ error: "This invitation is not valid." }, 404);
      if ((invite as any).accepted_at) return json({ error: "This invitation was already used." }, 409);
      if (new Date((invite as any).expires_at).getTime() < Date.now()) {
        return json({ error: "This invitation has expired." }, 410);
      }

      const firmId = (invite as any).firm_id;
      const { data: firm } = await db
        .from("enterprise_firms").select("seat_limit").eq("id", firmId).maybeSingle();
      const { count } = await db
        .from("enterprise_memberships").select("id", { count: "exact", head: true }).eq("firm_id", firmId);
      if ((count ?? 0) >= Number((firm as any)?.seat_limit ?? 3)) {
        return json({ error: "This firm has no seats left." }, 409);
      }

      await db.from("enterprise_memberships").upsert(
        { firm_id: firmId, user_id: userId, role: (invite as any).role },
        { onConflict: "firm_id,user_id" },
      );
      await db.from("enterprise_invitations")
        .update({ accepted_at: new Date().toISOString() }).eq("id", (invite as any).id);
      return json({ ok: true, firm_id: firmId });
    }

    // ---- Everything below acts on the caller's own firm.
    const plan = await planSlugFor(db, userId);

    const { data: ownedFirm } = await db
      .from("enterprise_firms").select("*").eq("owner_user_id", userId).maybeSingle();

    if (action === "get_team") {
      // Membership-only callers see the firm they belong to, read-only.
      let firm = ownedFirm as any;
      if (!firm) {
        const { data: membership } = await db
          .from("enterprise_memberships").select("firm_id").eq("user_id", userId).maybeSingle();
        if (membership) {
          const { data: f } = await db
            .from("enterprise_firms").select("*").eq("id", (membership as any).firm_id).maybeSingle();
          firm = f;
        }
      }
      // Provision a firm on first visit for Enterprise owners only.
      if (!firm && isEnterprise(plan)) {
        const { data: created } = await db.from("enterprise_firms")
          .insert({ owner_user_id: userId, seat_limit: 3 }).select("*").maybeSingle();
        firm = created;
        if (firm) {
          await db.from("enterprise_memberships")
            .insert({ firm_id: (firm as any).id, user_id: userId, role: "firm_admin" });
        }
      }
      if (!firm) return json({ firm: null, members: [], invitations: [], is_owner: false, plan });

      const isOwner = (firm as any).owner_user_id === userId;
      const [{ data: members }, { data: invitations }] = await Promise.all([
        db.from("enterprise_memberships").select("*").eq("firm_id", (firm as any).id).order("created_at"),
        isOwner
          ? db.from("enterprise_invitations").select("id,email,role,expires_at,accepted_at,created_at")
              .eq("firm_id", (firm as any).id).order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
      ]);

      // Resolve emails + plans for display without exposing the auth table.
      const enriched = [] as any[];
      for (const m of members ?? []) {
        const { data: au } = await db.auth.admin.getUserById((m as any).user_id);
        const { data: prof } = await db.from("profiles")
          .select("plan,subscription_status").eq("user_id", (m as any).user_id).maybeSingle();
        enriched.push({
          ...m,
          email: au?.user?.email ?? null,
          plan: (prof as any)?.plan ?? "explorer",
          subscription_status: (prof as any)?.subscription_status ?? null,
        });
      }
      return json({ firm, members: enriched, invitations: invitations ?? [], is_owner: isOwner, plan });
    }

    // Remaining actions mutate seats and require firm ownership.
    if (!ownedFirm) return json({ error: "You do not manage an Enterprise firm." }, 403);
    if (!isEnterprise(plan)) return json({ error: "An active Enterprise plan is required." }, 403);
    const firmId = (ownedFirm as any).id;

    if (action === "rename_firm") {
      const name = String((body as any)?.name ?? "").trim().slice(0, 120);
      if (!name) return json({ error: "Firm name is required." }, 400);
      await db.from("enterprise_firms").update({ name }).eq("id", firmId);
      return json({ ok: true });
    }

    if (action === "invite") {
      const email = String((body as any)?.email ?? "").trim().toLowerCase();
      const role = String((body as any)?.role ?? "advisor");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
      if (!ROLES.has(role)) return json({ error: "Unknown role." }, 400);

      const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
        db.from("enterprise_memberships").select("id", { count: "exact", head: true }).eq("firm_id", firmId),
        db.from("enterprise_invitations").select("id", { count: "exact", head: true })
          .eq("firm_id", firmId).is("accepted_at", null).gt("expires_at", new Date().toISOString()),
      ]);
      const used = (memberCount ?? 0) + (pendingCount ?? 0);
      if (used >= Number((ownedFirm as any).seat_limit ?? 3)) {
        return json({ error: "All seats are in use. Remove a member or add seats first." }, 409);
      }

      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      await db.from("enterprise_invitations").insert({
        firm_id: firmId,
        email,
        role,
        token_hash: await sha256(token),
        expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
        invited_by: userId,
      });
      // The raw token is returned exactly once, to the inviting owner.
      return json({ ok: true, token });
    }

    if (action === "revoke_invite") {
      const id = String((body as any)?.invitation_id ?? "");
      if (!id) return json({ error: "Missing invitation." }, 400);
      await db.from("enterprise_invitations").delete().eq("id", id).eq("firm_id", firmId);
      return json({ ok: true });
    }

    if (action === "remove_member") {
      const targetId = String((body as any)?.user_id ?? "");
      if (!targetId) return json({ error: "Missing member." }, 400);
      if (targetId === userId) return json({ error: "You cannot remove yourself from your own firm." }, 400);
      await db.from("enterprise_memberships").delete().eq("firm_id", firmId).eq("user_id", targetId);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[manage-enterprise-team]", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
