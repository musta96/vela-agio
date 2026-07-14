// Buyback Analyzer fundamentals proxy.
//
// The client used to call `query1.finance.yahoo.com` through a free public
// CORS proxy (allorigins.win) which was rate-limited and often blocked,
// producing "Failed to load fundamentals." This edge function fetches the
// same Yahoo `quoteSummary` payload server-side with the crumb/cookie flow
// Yahoo now requires, so the browser never has to touch a third-party proxy.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const MODULES = [
  "cashflowStatementHistory",
  "incomeStatementHistory",
  "defaultKeyStatistics",
  "summaryDetail",
  "price",
  "financialData",
].join(",");

let cachedCrumb: { crumb: string; cookie: string; at: number } | null = null;

async function getCrumb(): Promise<{ crumb: string; cookie: string }> {
  if (cachedCrumb && Date.now() - cachedCrumb.at < 30 * 60 * 1000) {
    return { crumb: cachedCrumb.crumb, cookie: cachedCrumb.cookie };
  }
  const setCookies: string[] = [];
  const r1 = await fetch("https://fc.yahoo.com/", {
    headers: { "User-Agent": UA, Accept: "text/html" },
    redirect: "manual",
  }).catch(() => null);
  if (r1) {
    const sc = r1.headers.get("set-cookie");
    if (sc) setCookies.push(sc);
  }
  const r2 = await fetch("https://finance.yahoo.com/", {
    headers: { "User-Agent": UA, Accept: "text/html" },
    redirect: "manual",
  });
  const sc2 = r2.headers.get("set-cookie");
  if (sc2) setCookies.push(sc2);

  const cookiePairs: string[] = [];
  for (const raw of setCookies) {
    const parts = raw.split(/,(?=\s*[A-Za-z0-9_-]+=)/);
    for (const p of parts) {
      const kv = p.split(";")[0].trim();
      if (kv && kv.includes("=")) cookiePairs.push(kv);
    }
  }
  const cookie = cookiePairs.join("; ");

  const r3 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Accept: "text/plain", Cookie: cookie },
  });
  if (!r3.ok) throw new Error(`getcrumb ${r3.status}`);
  const crumb = (await r3.text()).trim();
  if (!crumb || crumb.length < 4) throw new Error("empty crumb");
  cachedCrumb = { crumb, cookie, at: Date.now() };
  return { crumb, cookie };
}

async function fetchQuoteSummary(symbol: string) {
  const { crumb, cookie } = await getCrumb();
  const url = (c: string) =>
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${MODULES}&crumb=${encodeURIComponent(c)}`;
  let r = await fetch(url(crumb), {
    headers: { "User-Agent": UA, Accept: "application/json", Cookie: cookie },
  });
  if (r.status === 401 || r.status === 403) {
    cachedCrumb = null;
    const fresh = await getCrumb();
    r = await fetch(url(fresh.crumb), {
      headers: { "User-Agent": UA, Accept: "application/json", Cookie: fresh.cookie },
    });
  }
  if (!r.ok) throw new Error(`Yahoo quoteSummary ${r.status}`);
  const j = await r.json();
  return j?.quoteSummary?.result?.[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let body: { symbol?: string };
  try { body = await req.json(); } catch { body = {}; }
  const symbol = (body.symbol ?? "").toString().trim().toUpperCase();
  if (!symbol || symbol.length > 20) {
    return new Response(JSON.stringify({ error: "symbol required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const result = await fetchQuoteSummary(symbol);
    if (!result) {
      return new Response(JSON.stringify({ error: "not_covered" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("buyback-fundamentals failed", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});