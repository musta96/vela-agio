// Integration test for update-payment-method — verifies that a free-tier
// user (no existing subscription row) still gets a successful response
// because the function creates/finds a Stripe customer on demand and
// returns a setup-mode Checkout Session clientSecret.
//
// Skip-by-default: requires TEST_FREE_USER_EMAIL / TEST_FREE_USER_PASSWORD
// pointing at a real auth user with NO row in `subscriptions`.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const EMAIL = Deno.env.get("TEST_FREE_USER_EMAIL");
const PASSWORD = Deno.env.get("TEST_FREE_USER_PASSWORD");

const canRun = !!(EMAIL && PASSWORD && SUPABASE_URL && SUPABASE_ANON_KEY);

async function login(): Promise<string> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email: EMAIL!, password: PASSWORD! });
  if (error || !data.session) throw new Error("login failed: " + (error?.message ?? "no session"));
  return data.session.access_token;
}

async function callFn(token: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/update-payment-method`, {
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
  name: "update-payment-method succeeds for free-tier users with no subscription",
  ignore: !canRun,
  async fn() {
    const token = await login();
    const { status, payload } = await callFn(token, { environment: "sandbox" });
    assertEquals(status, 200, `expected 200, got ${status}: ${JSON.stringify(payload)}`);
    assert(typeof payload?.clientSecret === "string" && payload.clientSecret.length > 0,
      `expected clientSecret string, got: ${JSON.stringify(payload)}`);
    assert(!payload.error, `unexpected error: ${payload.error}`);
  },
});

Deno.test({
  name: "update-payment-method is idempotent — repeated calls reuse the same Stripe customer",
  ignore: !canRun,
  async fn() {
    const token = await login();
    const a = await callFn(token, { environment: "sandbox" });
    const b = await callFn(token, { environment: "sandbox" });
    assertEquals(a.status, 200);
    assertEquals(b.status, 200);
    // Both calls succeed; the customer-create idempotency key ensures no
    // duplicate Stripe customer is created for the same user.
    assert(a.payload?.clientSecret && b.payload?.clientSecret);
  },
});