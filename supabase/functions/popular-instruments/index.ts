import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Aggregated, anonymized rankings of instruments on the platform:
 *  - most_owned : how many distinct users hold each symbol (portfolio_holdings)
 *  - most_bought: net buys in the last 7 days (paper_trades, side=buy)
 *  - most_sold  : net sells in the last 7 days (paper_trades, side=sell)
 *
 * Read-only, returns only symbol + count. No user-identifiable data leaves
 * the function.
 */

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const metric = (body?.metric || "most_owned") as "most_owned" | "most_bought" | "most_sold";
    const limit = Math.min(20, Math.max(1, body?.limit || 10));

    if (metric === "most_owned") {
      const { data, error } = await supabase
        .from("portfolio_holdings")
        .select("symbol, user_id")
        .limit(5000);
      if (error) return json({ items: [], error: error.message });
      const counts = new Map<string, Set<string>>();
      for (const row of data ?? []) {
        const s = (row as any).symbol as string;
        const u = (row as any).user_id as string;
        if (!s) continue;
        if (!counts.has(s)) counts.set(s, new Set());
        counts.get(s)!.add(u);
      }
      const items = [...counts.entries()]
        .map(([symbol, set]) => ({ symbol, count: set.size }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
      return json({ items });
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const side = metric === "most_bought" ? "buy" : "sell";
    const { data, error } = await supabase
      .from("paper_trades")
      .select("symbol")
      .eq("side", side)
      .gte("created_at", since)
      .limit(5000);
    if (error) return json({ items: [], error: error.message });
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const s = (row as any).symbol as string;
      if (!s) continue;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const items = [...counts.entries()]
      .map(([symbol, count]) => ({ symbol, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    return json({ items });
  } catch (e) {
    return json({ items: [], error: String(e) }, 500);
  }
});