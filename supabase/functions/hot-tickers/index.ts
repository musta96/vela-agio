import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const FALLBACK = [
  { sym: "AAPL", name: "Apple" },
  { sym: "TSLA", name: "Tesla" },
  { sym: "NVDA", name: "NVIDIA" },
];

type Entry = { day: string; tickers: { sym: string; name: string }[]; expiresAt: number };
let cache: Entry | null = null;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // UTC day
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const day = todayKey();
  const now = Date.now();
  if (cache && cache.day === day && cache.expiresAt > now) {
    return new Response(
      JSON.stringify({ tickers: cache.tickers, day, cached: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } },
    );
  }

  let tickers = FALLBACK;
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("sentiment_history")
      .select("symbol")
      .gte("created_at", since)
      .limit(500);
    if (data?.length) {
      const counts = new Map<string, number>();
      for (const r of data as { symbol: string | null }[]) {
        const s = (r.symbol || "").toUpperCase();
        if (!s) continue;
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([sym]) => ({ sym, name: sym }));
      if (top.length >= 3) tickers = top;
    }
  } catch (e) {
    console.error("[hot-tickers] fallback due to", e);
  }

  // Cache until end of UTC day
  const endOfDay = new Date();
  endOfDay.setUTCHours(23, 59, 59, 999);
  cache = { day, tickers, expiresAt: endOfDay.getTime() };

  return new Response(
    JSON.stringify({ tickers, day, cached: false }),
    { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } },
  );
});