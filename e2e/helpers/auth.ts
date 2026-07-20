import { Page, request } from "@playwright/test";

/**
 * Sign a Playwright page in as a real Supabase user by calling the
 * password-grant token endpoint and dropping the returned session into
 * localStorage where @supabase/supabase-js expects it (`sb-<ref>-auth-token`).
 *
 * Requires VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to be set —
 * both already exist in .env for the running dev server, so CI just needs to
 * expose them alongside the E2E_* account secrets.
 */
export async function signInViaApi(page: Page, email: string, password: string) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anon) {
    throw new Error(
      "signInViaApi: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY must be set for gating e2e tests",
    );
  }
  const ref = new URL(supabaseUrl).host.split(".")[0];
  const ctx = await request.newContext();
  const res = await ctx.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anon, "Content-Type": "application/json" },
    data: { email, password },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`signInViaApi: sign-in failed for ${email}: ${res.status()} ${body}`);
  }
  const session = await res.json();
  // Anchor to the app origin so localStorage lands on the right key namespace.
  await page.goto("/");
  await page.evaluate(
    ({ key, val }) => window.localStorage.setItem(key, val),
    { key: `sb-${ref}-auth-token`, val: JSON.stringify(session) },
  );
}