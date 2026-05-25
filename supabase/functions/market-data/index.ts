import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";

// TTLs in seconds
const TTL = {
  quote: 60,        // 1 min for live quotes
  ohlc_intraday: 60, // intraday OHLC
  ohlc_daily: 60 * 30, // 30 min for daily/weekly bars
  fx: 60 * 10,         // 10 min for FX rates
};

type Action =
  | { action: "quote"; symbols: string[] }
  | { action: "ohlc"; symbol: string; range: string; interval: string }
  | { action: "fx"; pair: string };

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function readCache(key: string) {
  const { data } = await supabase
    .from("market_data_cache")
    .select("payload, expires_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.payload;
}

async function writeCache(
  key: string,
  kind: "quote" | "ohlc" | "fx",
  symbol: string,
  payload: unknown,
  ttlSec: number,
  range?: string,
  interval?: string,
) {
  const expires_at = new Date(Date.now() + ttlSec * 1000).toISOString();
  await supabase.from("market_data_cache").upsert(
    { cache_key: key, kind, symbol, range, interval, payload, fetched_at: new Date().toISOString(), expires_at },
    { onConflict: "cache_key" },
  );
}

async function fetchYahoo(symbol: string, range: string, interval: string) {
  const url = `${YF_BASE}${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: {
      // Yahoo blocks empty UA — pretend to be a regular browser.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "application/json",
    },
  });
  if (res.status === 404) {
    const err: any = new Error(`Yahoo 404 for ${symbol}`);
    err.code = 404;
    throw err;
  }
  if (!res.ok) throw new Error(`Yahoo ${res.status} for ${symbol}`);
  return await res.json();
}

// Italian tickers on Yahoo need a `.MI` suffix. Try once with it.
async function fetchYahooWithFallback(symbol: string, range: string, interval: string) {
  try {
    return await fetchYahoo(symbol, range, interval);
  } catch (e: any) {
    if (e?.code === 404 && !symbol.includes(".") && !symbol.includes("=") && !symbol.includes("^")) {
      return await fetchYahoo(`${symbol}.MI`, range, interval);
    }
    throw e;
  }
}

function parseQuote(symbol: string, json: any) {
  const r = json?.chart?.result?.[0];
  if (!r) return null;
  const m = r.meta;
  const price = m?.regularMarketPrice;
  const prev = m?.chartPreviousClose ?? m?.previousClose;
  if (typeof price !== "number" || typeof prev !== "number" || prev === 0) return null;
  return {
    symbol,
    price,
    previousClose: prev,
    change: ((price - prev) / prev) * 100,
    currency: m?.currency,
    marketState: m?.marketState,
    updatedAt: Date.now(),
  };
}

function parseOHLC(json: any) {
  const r = json?.chart?.result?.[0];
  if (!r) return [];
  const ts: number[] = r.timestamp || [];
  const q = r.indicators?.quote?.[0] || {};
  const opens = q.open || [], highs = q.high || [], lows = q.low || [], closes = q.close || [], vols = q.volume || [];
  const bars: any[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
    if (typeof o === "number" && typeof h === "number" && typeof l === "number" && typeof c === "number") {
      bars.push({ t: ts[i] * 1000, open: o, high: h, low: l, close: c, volume: typeof vols[i] === "number" ? vols[i] : undefined });
    }
  }
  return bars;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  // Require an authenticated user (anon JWT is fine — we just want to attribute usage)
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return bad("Missing auth", 401);
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return bad("Invalid auth", 401);

  let body: Action;
  try { body = await req.json(); } catch { return bad("Invalid JSON"); }

  try {
    if (body.action === "quote") {
      if (!Array.isArray(body.symbols) || body.symbols.length === 0) return bad("symbols required");
      const out: Record<string, any> = {};
      await Promise.all(body.symbols.slice(0, 50).map(async (sym) => {
        const key = `q:${sym}`;
        const cached = await readCache(key);
        if (cached) { out[sym] = cached; return; }
        try {
          const j = await fetchYahooWithFallback(sym, "1d", "1m");
          const q = parseQuote(sym, j);
          if (q) { out[sym] = q; await writeCache(key, "quote", sym, q, TTL.quote); }
        } catch { /* skip */ }
      }));
      return new Response(JSON.stringify({ quotes: out }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (body.action === "ohlc") {
      if (!body.symbol || !body.range || !body.interval) return bad("symbol/range/interval required");
      const key = `o:${body.symbol}:${body.range}:${body.interval}`;
      const cached = await readCache(key);
      if (cached) {
        return new Response(JSON.stringify({ bars: cached, cached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      let bars: any[] = [];
      try {
        const j = await fetchYahooWithFallback(body.symbol, body.range, body.interval);
        bars = parseOHLC(j);
      } catch (e: any) {
        if (e?.code === 404) {
          return new Response(
            JSON.stringify({ bars: [], cached: false, fallback: true, error: "TICKER_NOT_FOUND" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        throw e;
      }
      const ttl = body.interval.endsWith("d") || body.interval.endsWith("wk") || body.interval.endsWith("mo")
        ? TTL.ohlc_daily : TTL.ohlc_intraday;
      await writeCache(key, "ohlc", body.symbol, bars, ttl, body.range, body.interval);
      return new Response(JSON.stringify({ bars, cached: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (body.action === "fx") {
      if (!body.pair) return bad("pair required (e.g. EURUSD)");
      const sym = `${body.pair.toUpperCase()}=X`;
      const key = `fx:${sym}`;
      const cached = await readCache(key);
      if (cached) return new Response(JSON.stringify({ rate: cached, cached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const j = await fetchYahoo(sym, "1d", "1m");
      const q = parseQuote(sym, j);
      if (!q) return bad("FX unavailable", 502);
      const rate = { pair: body.pair.toUpperCase(), rate: q.price, updatedAt: q.updatedAt };
      await writeCache(key, "fx", sym, rate, TTL.fx);
      return new Response(JSON.stringify({ rate, cached: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return bad("Unknown action");
  } catch (e) {
    console.error("market-data error", e);
    return bad((e as Error).message, 502);
  }
});