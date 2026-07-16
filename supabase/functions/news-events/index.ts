// Recent news headlines for a symbol, via Finnhub if the API key is available.
// Returns compact list of {publishedAt, title, url, source, sentiment} for use in the news-event backtest.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const POSITIVE = ["beat", "beats", "surge", "surges", "record", "upgrade", "buyback", "raises", "raised", "strong", "wins", "acquires", "approval", "growth"];
const NEGATIVE = ["miss", "misses", "cut", "cuts", "downgrade", "downgraded", "warns", "warning", "probe", "lawsuit", "recall", "fraud", "weak", "loss", "layoff"];

function scoreHeadline(t: string): number {
  const s = t.toLowerCase();
  let n = 0;
  for (const w of POSITIVE) if (s.includes(w)) n += 1;
  for (const w of NEGATIVE) if (s.includes(w)) n -= 1;
  return Math.max(-3, Math.min(3, n));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const symbol = (body.symbol || url.searchParams.get("symbol") || "").toString().trim().toUpperCase();
    if (!symbol) return new Response(JSON.stringify({ error: "symbol required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const days = Math.max(1, Math.min(90, Number(body.days ?? url.searchParams.get("days") ?? 30)));

    const token = Deno.env.get("FINNHUB_API_KEY");
    if (!token) {
      return new Response(JSON.stringify({ symbol, items: [], error: "finnhub_not_configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 3600 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const feedUrl = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(from)}&to=${fmt(to)}&token=${token}`;
    const res = await fetch(feedUrl);
    if (!res.ok) return new Response(JSON.stringify({ symbol, items: [], error: `finnhub_${res.status}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const raw = await res.json();
    const items = (Array.isArray(raw) ? raw : []).slice(0, 60).map((r: any) => {
      const title = String(r.headline ?? r.title ?? "");
      return {
        publishedAt: (Number(r.datetime) || 0) * 1000,
        title,
        url: r.url ?? null,
        source: r.source ?? null,
        sentiment: scoreHeadline(title),
      };
    }).filter((i: any) => i.publishedAt > 0);
    return new Response(JSON.stringify({ symbol, items }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});