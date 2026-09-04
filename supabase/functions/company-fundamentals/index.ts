// Server-side fundamentals + peer comparison for any listed instrument.
//
// Replaces the browser-side calls that went through the public CORS proxy
// (api.allorigins.win): those were slow, rate-limited and frequently failed
// outright for non-US listings. Everything here runs with a cached Yahoo
// cookie/crumb session, in parallel, behind a shared 30-minute cache.
//
//   POST { action: "quoteSummary", symbol, modules: [...] }
//   POST { action: "peers", symbol }

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { fetchQuoteSummary } from "../_shared/fundamentals.ts";
import { getCached, setCached } from "../_shared/profile-cache.ts";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const PEER_MODULES = ["price", "summaryDetail", "defaultKeyStatistics", "financialData"];

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "object" && typeof (v as { raw?: number }).raw === "number") {
    const r = (v as { raw: number }).raw;
    return isFinite(r) ? r : null;
  }
  return null;
}

/** Peer universe from Yahoo's own "people also watch" recommendations. */
async function discoverPeers(symbol: string): Promise<string[]> {
  for (const host of ["query2", "query1"]) {
    try {
      const r = await fetch(
        `https://${host}.finance.yahoo.com/v6/finance/recommendationsbysymbol/${encodeURIComponent(symbol)}`,
        { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
      );
      if (!r.ok) continue;
      const j = await r.json();
      const syms: string[] = (j?.finance?.result?.[0]?.recommendedSymbols ?? [])
        .map((x: { symbol?: string }) => x?.symbol)
        .filter(Boolean);
      if (syms.length) return syms.slice(0, 6);
    } catch {
      // try next host
    }
  }
  return [];
}

async function peerRow(symbol: string) {
  const r = await fetchQuoteSummary(symbol, PEER_MODULES).catch(() => null);
  if (!r) return null;
  const p = r.price ?? {}, sd = r.summaryDetail ?? {}, ks = r.defaultKeyStatistics ?? {}, fd = r.financialData ?? {};
  return {
    symbol,
    name: p.longName || p.shortName || symbol,
    currency: p.currency ?? sd.currency ?? null,
    pe: num(sd.trailingPE),
    forwardPe: num(sd.forwardPE) ?? num(ks.forwardPE),
    evEbitda: num(ks.enterpriseToEbitda),
    pb: num(ks.priceToBook),
    revGrowth: num(fd.revenueGrowth),
    grossMargin: num(fd.grossMargins),
    operatingMargin: num(fd.operatingMargins),
    roe: num(fd.returnOnEquity),
    netDebtEbitda: (() => {
      const debt = num(fd.totalDebt), cash = num(fd.totalCash), ebitda = num(fd.ebitda);
      if (debt == null || ebitda == null || ebitda === 0) return null;
      return (debt - (cash ?? 0)) / ebitda;
    })(),
    dividendYield: num(sd.dividendYield),
    mcap: num(p.marketCap) ?? num(sd.marketCap),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const symbol = String(body.symbol ?? "").trim();
    if (!symbol) return json({ error: "symbol required" }, 400);
    const action = String(body.action ?? "quoteSummary");

    if (action === "peers") {
      const key = `peers:${symbol.toUpperCase()}`;
      const hit = await getCached<unknown>(key);
      if (hit) return json({ ...(hit as object), cached: true });

      const peerSyms = await discoverPeers(symbol);
      const syms = Array.from(new Set([symbol, ...peerSyms])).slice(0, 7);
      // Parallel, not sequential: the old client version fetched one at a time.
      const settled = await Promise.all(syms.map((s) => peerRow(s).catch(() => null)));
      const rows = settled.filter(Boolean);
      const payload = { symbol, rows, asOf: new Date().toISOString() };
      if (rows.length) await setCached(key, "peers", symbol, payload, 60 * 60);
      return json(payload);
    }

    const modules: string[] = Array.isArray(body.modules) && body.modules.length
      ? body.modules.map(String)
      : ["price", "summaryDetail", "defaultKeyStatistics", "financialData"];
    const key = `qs:${symbol.toUpperCase()}:${modules.slice().sort().join(",")}`;
    const hit = await getCached<unknown>(key);
    if (hit) return json({ symbol, result: hit, cached: true });

    const result = await fetchQuoteSummary(symbol, modules);
    if (!result) return json({ symbol, result: null, error: "NO_FUNDAMENTALS_SOURCE" }, 200);
    await setCached(key, "quoteSummary", symbol, result, 30 * 60);
    return json({ symbol, result });
  } catch (e) {
    console.error("company-fundamentals error", e);
    return json({ error: (e as Error)?.message ?? "Internal error" }, 500);
  }
});
