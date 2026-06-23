// Integration tests for the owner-console edge function — verifies GDPR
// data-minimisation gating on `user_detail`:
//   1. PII is hidden by default (no portfolios/holdings/brokers in response).
//   2. Reveal request without a documented reason ≥5 chars is rejected (400).
//   3. A valid reveal returns the gated PII AND writes a `pii_access` row to
//      the incident_log audit trail.
//
// Skip-by-default: requires OWNER_EMAIL / OWNER_PASSWORD env vars for a real
// owner/admin login plus TEST_TARGET_USER_ID to point at the account whose
// detail is fetched. Run via the run-tests tool.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL");
const OWNER_PASSWORD = Deno.env.get("OWNER_PASSWORD");
const TARGET_USER_ID = Deno.env.get("TEST_TARGET_USER_ID");

const canRun = !!(OWNER_EMAIL && OWNER_PASSWORD && TARGET_USER_ID && SUPABASE_URL && SUPABASE_ANON_KEY);

async function ownerToken(): Promise<string> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email: OWNER_EMAIL!, password: OWNER_PASSWORD! });
  if (error || !data.session) throw new Error("owner login failed: " + (error?.message ?? "no session"));
  return data.session.access_token;
}

async function callOwnerConsole(token: string, body: Record<string, unknown>): Promise<{ status: number; payload: any }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/owner-console`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: res.status, payload };
}

Deno.test({
  name: "user_detail hides financial PII by default",
  ignore: !canRun,
  async fn() {
    const token = await ownerToken();
    const { status, payload } = await callOwnerConsole(token, { action: "user_detail", user_id: TARGET_USER_ID });
    assertEquals(status, 200);
    assertEquals(payload.pii_revealed, false);
    assertEquals(payload.pii_reveal, null);
    for (const sensitive of ["portfolios", "holdings", "brokers", "net_worth", "signals", "orders"]) {
      assert(!(sensitive in payload), `expected '${sensitive}' to be hidden by default, got: ${JSON.stringify(payload[sensitive])}`);
    }
    // Non-PII account meta still loads so support can identify the account.
    assert("profile" in payload);
    assert("auth" in payload);
    assert("consents" in payload);
    assert("roles" in payload);
  },
});

Deno.test({
  name: "user_detail rejects reveal_pii without a documented reason",
  ignore: !canRun,
  async fn() {
    const token = await ownerToken();
    const tooShort = await callOwnerConsole(token, { action: "user_detail", user_id: TARGET_USER_ID, reveal_pii: true, reason: "x" });
    assertEquals(tooShort.status, 400);
    assert(String(tooShort.payload?.error || "").toLowerCase().includes("reason"));

    const missing = await callOwnerConsole(token, { action: "user_detail", user_id: TARGET_USER_ID, reveal_pii: true });
    assertEquals(missing.status, 400);
  },
});

Deno.test({
  name: "user_detail reveals PII with a valid reason and writes an audit entry",
  ignore: !canRun,
  async fn() {
    const token = await ownerToken();
    const reason = `integration-test reveal at ${new Date().toISOString()}`;
    const { status, payload } = await callOwnerConsole(token, {
      action: "user_detail",
      user_id: TARGET_USER_ID,
      reveal_pii: true,
      reason,
    });
    assertEquals(status, 200);
    assertEquals(payload.pii_revealed, true);
    assertEquals(payload.pii_reveal?.reason, reason);
    for (const sensitive of ["portfolios", "holdings", "brokers", "net_worth", "signals", "orders"]) {
      assert(sensitive in payload, `expected '${sensitive}' to be present after reveal`);
    }

    // Confirm the audit trail was written by reading the incident_log via the
    // default load action (owner-console GET-equivalent payload).
    const load = await callOwnerConsole(token, { action: "load" });
    assertEquals(load.status, 200);
    const incidents: any[] = load.payload?.incidents ?? [];
    const match = incidents.find((i) => i.category === "pii_access" && i.reason === reason);
    assert(match, `expected an incident_log entry with category=pii_access and reason='${reason}' — got categories: ${incidents.slice(0, 5).map((i) => i.category).join(",")}`);
  },
});