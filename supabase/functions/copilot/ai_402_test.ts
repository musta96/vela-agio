// Verifies that AI edge functions reject unauthenticated/no-access callers
// with a 402 (or 401/403) response — the cap blocks ONLY AI features.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

function fnUrl(name: string) {
  return `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${name}`;
}

Deno.test("ai-access-status returns denied for anonymous caller", async () => {
  const r = await fetch(fnUrl("ai-access-status"), {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: "{}",
  });
  const body = await r.json();
  assertEquals(r.status, 200, "status endpoint always 200");
  assertEquals(body.allowed, false, "anon must be denied");
  assert(["none", "opt_out"].includes(body.source), `unexpected source: ${body.source}`);
});

Deno.test("copilot AI function blocks anon with 401/402/403 (not 200)", async () => {
  const r = await fetch(fnUrl("copilot"), {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
  const text = await r.text();
  assert(r.status === 402 || r.status === 401 || r.status === 403,
    `expected 401/402/403 for unauth copilot, got ${r.status}: ${text.slice(0, 200)}`);
});