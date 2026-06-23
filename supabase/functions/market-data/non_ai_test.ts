// Verifies that a non-AI edge function (market-data) is NOT affected by the
// AI 402 gate — paper trading and the rest of the app keep working even
// when the user has no AI access.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

function fnUrl(name: string) {
  return `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${name}`;
}

Deno.test("market-data (non-AI) is reachable without AI access — no 402", async () => {
  const r = await fetch(fnUrl("market-data"), {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ action: "quote", symbols: ["AAPL"] }),
  });
  const text = await r.text();
  assert(r.status !== 402,
    `non-AI function must not return 402 (AI gate). status=${r.status} body=${text.slice(0, 200)}`);
});

Deno.test("paper-trading Data API is not affected by the AI 402 gate", async () => {
  // Paper trading reads/writes paper_trades & paper_cash via the Data API
  // directly. The AI 402 lives in edge functions only, so REST access to a
  // non-AI table must never return 402.
  const r = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/paper_trades?select=id&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  await r.text();
  assert(r.status !== 402, `Data API must not return 402 for paper_trades; got ${r.status}`);
});