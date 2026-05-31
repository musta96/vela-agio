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
const QUOTE_CACHE = new Map<string, { at: number; value: any }>();
const CACHE_TTL_MS = 60_000;
const PER_FETCH_TIMEOUT_MS = 3500;

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchQuotes(symbols: string[]) {
  // Yahoo v7 quote now returns 401 for unauthenticated server calls. Use the
  // public chart endpoint in parallel — works for every symbol, no crumb needed.
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36";
  async function one(s: string) {
    const cached = QUOTE_CACHE.get(s);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
    // range=2d so the chart's first bar is yesterday and `previousClose` from
    // meta is the correct prior-session official close. Using a longer range
    // (5d) makes Yahoo populate `chartPreviousClose` with a value from ~6 days
    // ago, which would skew the "change" / "changePercent" we compute below.
    const direct = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=2d&interval=1d`;
    const urls = [direct, `https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`];
    for (const url of urls) {
      try {
        const r = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, PER_FETCH_TIMEOUT_MS);
        if (!r.ok) continue;
        const j = await r.json();
        const m = j?.chart?.result?.[0]?.meta;
        if (!m) continue;
        const price = m.regularMarketPrice ?? m.previousClose;
        // Prefer the OFFICIAL prior-session close (`previousClose`). Fall back
        // to `chartPreviousClose` only if the official one is missing.
        const prev = m.previousClose ?? m.chartPreviousClose;
        if (price == null || prev == null) continue;
        const change = price - prev;
        const value = {
          symbol: s,
          name: m.shortName || m.longName || s,
          price,
          change,
          changePercent: prev ? (change / prev) * 100 : 0,
          volume: m.regularMarketVolume,
          currency: m.currency,
          exchange: m.fullExchangeName || m.exchangeName,
        };
        QUOTE_CACHE.set(s, { at: Date.now(), value });
        return value;
      } catch (_e) { /* try next */ }
    }
    return null;
  }
  // Fire all requests concurrently — the per-fetch timeout caps total latency
  // at ~3.5s + slowest fallback, and the in-memory cache makes repeats instant.
  const capped = symbols.slice(0, 120);
  const results = await Promise.all(capped.map(one));
  return results.filter(Boolean);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}