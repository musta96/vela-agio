// Options-flow snapshot (Yahoo Finance options chain).
// Returns aggregate call/put volume, put/call ratio, unusual OI hot strikes,
// and a rough "sweep vs block" classification based on volume vs open interest.
// Public, cached in memory for 60s to avoid hammering Yahoo.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface FlowSnapshot {
  symbol: string;
  expiration: number | null;
  putCallRatio: number;
  callVolume: number;
  putVolume: number;
  callOI: number;
  putOI: number;
  bias: "bullish" | "bearish" | "neutral";
  hotStrikes: Array<{
    strike: number;
    kind: "call" | "put";
    volume: number;
    openInterest: number;
    vOverOI: number;
    classification: "sweep-like" | "block-like" | "normal";
  }>;
  fetchedAt: number;
}

const cache = new Map<string, { at: number; data: FlowSnapshot }>();
const TTL = 60_000;

async function loadOptions(symbol: string): Promise<FlowSnapshot | null> {
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  const j = await res.json();
  const chain = j?.optionChain?.result?.[0];
  if (!chain) return null;
  const opts = chain.options?.[0];
  if (!opts) return null;
  const calls: any[] = opts.calls || [];
  const puts: any[] = opts.puts || [];
  const sum = (arr: any[], k: string) => arr.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const callVolume = sum(calls, "volume");
  const putVolume = sum(puts, "volume");
  const callOI = sum(calls, "openInterest");
  const putOI = sum(puts, "openInterest");
  const pcr = callVolume > 0 ? putVolume / callVolume : 0;

  const classify = (v: number, oi: number) => {
    if (v > 0 && oi > 0 && v / oi > 2) return "sweep-like" as const;
    if (v > 5000 && v / (oi || 1) < 0.5) return "block-like" as const;
    return "normal" as const;
  };
  const flatten = [
    ...calls.map((r) => ({
      strike: Number(r.strike) || 0, kind: "call" as const,
      volume: Number(r.volume) || 0, openInterest: Number(r.openInterest) || 0,
    })),
    ...puts.map((r) => ({
      strike: Number(r.strike) || 0, kind: "put" as const,
      volume: Number(r.volume) || 0, openInterest: Number(r.openInterest) || 0,
    })),
  ]
    .map((r) => ({
      ...r,
      vOverOI: r.openInterest > 0 ? r.volume / r.openInterest : (r.volume > 0 ? Infinity : 0),
      classification: classify(r.volume, r.openInterest),
    }))
    .filter((r) => r.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);

  const bias: FlowSnapshot["bias"] =
    pcr > 1.2 ? "bearish" : pcr < 0.7 ? "bullish" : "neutral";

  return {
    symbol,
    expiration: opts.expirationDate ? opts.expirationDate * 1000 : null,
    putCallRatio: pcr,
    callVolume, putVolume, callOI, putOI,
    bias,
    hotStrikes: flatten,
    fetchedAt: Date.now(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const symbol = (body.symbol || url.searchParams.get("symbol") || "").toString().trim().toUpperCase();
    if (!symbol) return new Response(JSON.stringify({ error: "symbol required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const now = Date.now();
    const hit = cache.get(symbol);
    if (hit && now - hit.at < TTL) {
      return new Response(JSON.stringify(hit.data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const snap = await loadOptions(symbol);
    if (!snap) {
      return new Response(JSON.stringify({ error: "no_options_data", symbol }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    cache.set(symbol, { at: now, data: snap });
    return new Response(JSON.stringify(snap), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});