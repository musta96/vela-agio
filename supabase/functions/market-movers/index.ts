import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

/**
 * Market movers (top gainers / losers / most actives).
 *
 * Two modes:
 *  1. scope=index  → request body { scope: "index", symbols: string[] }
 *     Fetches a real-time quote batch for the given constituents and ranks
 *     locally. Use this when the caller already knows the universe (FTSE MIB,
 *     S&P 500, etc.).
 *  2. scope=global → request body { scope: "global", screener: "day_gainers" | "day_losers" | "most_actives", region?: string }
 *     Hits Yahoo's predefined screener API.
 *
 * No API key required — Yahoo public endpoints via direct fetch.
 */

type Body =
  | { scope: "index"; symbols: string[]; limit?: number }
  | { scope: "global"; screener: "day_gainers" | "day_losers" | "most_actives"; region?: string; limit?: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    const limit = Math.min(50, Math.max(1, (body as any).limit || 20));

    if (body.scope === "index") {
      const symbols = (body.symbols || []).filter(Boolean).slice(0, 100);
      if (!symbols.length) return json({ movers: [] });
      const movers = await fetchQuotes(symbols);
      return json({ movers });
    }

    if (body.scope === "global") {
      const screener = body.screener || "day_gainers";
      const region = body.region || "us";
      const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&lang=en-US&region=${encodeURIComponent(region)}&scrIds=${encodeURIComponent(screener)}&count=${limit}`;
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) return json({ movers: [], error: `yahoo ${r.status}` });
      const j = await r.json();
      const rows = (j?.finance?.result?.[0]?.quotes as any[]) || [];
      const movers = rows.map((q) => ({
        symbol: q.symbol,
        name: q.shortName || q.longName || q.symbol,
        price: q.regularMarketPrice?.raw ?? q.regularMarketPrice,
        change: q.regularMarketChange?.raw ?? q.regularMarketChange,
        changePercent: q.regularMarketChangePercent?.raw ?? q.regularMarketChangePercent,
        volume: q.regularMarketVolume?.raw ?? q.regularMarketVolume,
        marketCap: q.marketCap?.raw ?? q.marketCap,
        currency: q.currency,
        exchange: q.fullExchangeName || q.exchange,
      }));
      return json({ movers });
    }

    return json({ error: "invalid scope" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

// Yahoo v7 quote, with allorigins.win fallback (Yahoo increasingly blocks direct
// server-to-server calls without a crumb cookie).
async function fetchQuotes(symbols: string[]) {
  const target = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
  const sources = [
    target,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://corsproxy.io/?${encodeURIComponent(target)}`,
  ];
  for (const url of sources) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36" } });
      if (!r.ok) continue;
      const j = await r.json();
      const rows = (j?.quoteResponse?.result as any[]) || [];
      if (!rows.length) continue;
      return rows
        .filter((q) => typeof q.regularMarketChangePercent === "number")
        .map((q) => ({
          symbol: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          price: q.regularMarketPrice,
          change: q.regularMarketChange,
          changePercent: q.regularMarketChangePercent,
          volume: q.regularMarketVolume,
          marketCap: q.marketCap,
          currency: q.currency,
          exchange: q.fullExchangeName || q.exchange,
        }));
    } catch (_e) { /* try next */ }
  }
  // last-ditch per-symbol chart fallback (slower, may be empty)
  const out: any[] = [];
  for (const s of symbols.slice(0, 30)) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=2d&interval=1d`);
      if (!r.ok) continue;
      const j = await r.json();
      const m = j?.chart?.result?.[0]?.meta;
      if (!m) continue;
      const price = m.regularMarketPrice ?? m.previousClose;
      const prev = m.chartPreviousClose ?? m.previousClose;
      if (price == null || prev == null) continue;
      const change = price - prev;
      out.push({
        symbol: s, name: m.shortName || s,
        price, change, changePercent: (change / prev) * 100,
        volume: m.regularMarketVolume, currency: m.currency,
        exchange: m.fullExchangeName || m.exchangeName,
      });
    } catch (_e) { /* skip */ }
  }
  return out;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}