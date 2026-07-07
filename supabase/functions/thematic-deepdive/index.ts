/**
 * Thematic Deep-Dive edge function.
 *
 * Given a megatrend/theme (e.g. "AI chips", "GLP-1 drugs", "defence
 * electronics"), it:
 *   1. Asks the LLM for a 5-segment value chain of publicly listed
 *      companies (raw materials → components → manufacturers →
 *      distributors → end users), deliberately including small/micro caps.
 *   2. Fans out Yahoo fundamentals + lightweight sentiment for each name.
 *   3. Filters by region + market-cap band and ranks with a composite score
 *      that supports a "Discovery mode" lift for small caps.
 *
 * Returns `{ theme, chain, results, sources }` and caches the response for
 * 24h in `ai_output_cache` keyed on the request tuple.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod";
import { resolveAiAccess, aiDeniedResponse, modelForCap } from "../_shared/ai-access.ts";
import { fetchFundamentals } from "../_shared/fundamentals.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const BodySchema = z.object({
  theme: z.string().min(2).max(120),
  region: z.enum(["all", "na", "eu", "asia"]).optional(),
  size: z.enum(["all", "large", "mid", "small"]).optional(),
  discoveryMode: z.boolean().optional(),
});

const ChainSegment = z.object({
  segment: z.enum(["raw_materials", "components", "manufacturers", "distributors", "end_users"]),
  label: z.string(),
  companies: z.array(
    z.object({
      symbol: z.string(),
      name: z.string().optional(),
      exposure: z.enum(["pure-play", "partial", "adjacent"]),
      thesis: z.string().optional(),
      evidence: z.array(z.string()).optional(),
      exposurePct: z.number().nullable().optional(),
    }),
  ),
});

type Exposure = "pure-play" | "partial" | "adjacent";
const EXPOSURE_BONUS: Record<Exposure, number> = { "pure-play": 25, partial: 12, adjacent: 4 };

function scoreCompany(x: {
  exposure: Exposure;
  revGrowth?: number | null;
  pe?: number | null;
  sentiment?: number | null;
  marketCap?: number | null;
  discoveryMode?: boolean;
}): number {
  const growth = Number.isFinite(x.revGrowth) && (x.revGrowth as number) > -1
    ? Math.max(-0.5, Math.min(1.5, x.revGrowth as number)) * 40
    : 0;
  const value = Number.isFinite(x.pe) && (x.pe as number) > 0 ? Math.min(15, 100 / (x.pe as number)) : 0;
  const sent = Number.isFinite(x.sentiment) ? (x.sentiment as number) * 10 : 0;
  const exposureBonus = EXPOSURE_BONUS[x.exposure];
  let discovery = 0;
  if (x.discoveryMode && Number.isFinite(x.marketCap) && (x.marketCap as number) > 0) {
    const logMcap = Math.log10(x.marketCap as number);
    discovery = Math.max(0, 20 - Math.max(0, logMcap - 8) * 3);
  }
  return Math.round((growth + value + sent + exposureBonus + discovery) * 10) / 10;
}

function regionFromSymbol(sym: string): "na" | "eu" | "asia" | "other" {
  const s = sym.toUpperCase();
  if (!s.includes(".")) return "na";
  const suf = s.split(".").pop() ?? "";
  const eu = new Set(["L", "PA", "AS", "DE", "MI", "MC", "SW", "BR", "LS", "VI", "ST", "HE", "CO", "OL", "IR"]);
  const asia = new Set(["T", "HK", "SS", "SZ", "KS", "KQ", "TW", "TWO", "SI", "BO", "NS", "AX", "NZ"]);
  if (eu.has(suf)) return "eu";
  if (asia.has(suf)) return "asia";
  return "other";
}

function bandFromMarketCap(mcap: number | null | undefined): "large" | "mid" | "small" | "unknown" {
  if (!mcap || !Number.isFinite(mcap)) return "unknown";
  if (mcap >= 10_000_000_000) return "large";
  if (mcap >= 2_000_000_000) return "mid";
  return "small";
}

async function expandChain(theme: string, model: string): Promise<z.infer<typeof ChainSegment>[]> {
  const system = `You are a global equity analyst mapping megatrend value chains.
Given a THEME, produce the full value chain across 5 segments:
  1. raw_materials (miners, chemicals, rare earths)
  2. components (semiconductors, sensors, subsystems)
  3. manufacturers (system OEMs, module makers)
  4. distributors (integrators, service providers, resellers)
  5. end_users (companies whose business benefits from adopting the theme)

For each segment, list 6-12 PUBLICLY LISTED companies with their Yahoo Finance ticker (correct exchange suffix — e.g. ASML.AS, SHEL.L, 6857.T). Include a mix of geographies AND deliberately include small/micro-cap names that mainstream screeners miss.

For each company return: symbol, optional name, exposure ("pure-play" | "partial" | "adjacent"), one-line thesis, exposurePct (0-100 estimated % of revenue tied to this theme, null if unknown), and evidence (1-3 short bullet strings that cite the specific product line, subsidiary, contract, or filing that ties this company to the theme).

Return STRICT JSON: { "segments": [ { "segment": "raw_materials", "label": "Raw materials", "companies": [ {"symbol":"...","name":"...","exposure":"pure-play","exposurePct":75,"thesis":"...","evidence":["...","..."]} ] } ] }`;

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": LOVABLE_API_KEY,
      "X-Lovable-AIG-SDK": "direct-fetch",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Theme: ${theme}` },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const raw = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
  const parsed = z.object({ segments: z.array(ChainSegment).min(1) }).safeParse(raw);
  if (!parsed.success) throw new Error("value chain response failed schema validation");
  return parsed.data.segments;
}

async function fetchSentiment(auth: string, symbol: string): Promise<number | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/analyze-sentiment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ symbol }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const s = Number(j?.weightedScore ?? j?.score);
    return Number.isFinite(s) ? s : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { theme } = parsed.data;
  const region = parsed.data.region ?? "all";
  const size = parsed.data.size ?? "all";
  const discoveryMode = parsed.data.discoveryMode ?? false;

  const auth = req.headers.get("Authorization") ?? `Bearer ${SUPABASE_ANON_KEY}`;
  const access = await resolveAiAccess(auth);
  if (!access.allowed) return aiDeniedResponse(access, corsHeaders);
  const model = modelForCap(access.modelCap, "google/gemini-2.5-flash");

  // Cache check ---------------------------------------------------------
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const cacheKey = `thematic:${theme.toLowerCase()}|${region}|${size}|${discoveryMode ? 1 : 0}`;
  const chainCacheKey = `thematic_chain:${theme.toLowerCase()}`;
  try {
    const { data: cached } = await admin
      .from("ai_output_cache")
      .select("payload, created_at")
      .eq("cache_key", cacheKey)
      .gt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();
    if (cached?.payload) {
      return new Response(JSON.stringify({ ...(cached.payload as Record<string, unknown>), cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.warn("thematic-deepdive cache read failed", e);
  }

  // 1. Value-chain expansion via LLM (with theme-only cache reuse) ------
  let segments: z.infer<typeof ChainSegment>[];
  let chainCached = false;
  try {
    const { data: chainRow } = await admin
      .from("ai_output_cache")
      .select("payload, created_at")
      .eq("cache_key", chainCacheKey)
      .gt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();
    if (chainRow?.payload && Array.isArray((chainRow.payload as { segments?: unknown }).segments)) {
      const parsed = z.object({ segments: z.array(ChainSegment).min(1) }).safeParse(chainRow.payload);
      if (parsed.success) { segments = parsed.data.segments; chainCached = true; }
    }
    if (!chainCached!) {
      segments = await expandChain(theme, model);
      await admin
        .from("ai_output_cache")
        .upsert({ cache_key: chainCacheKey, payload: { segments }, created_at: new Date().toISOString() }, { onConflict: "cache_key" });
    }
  } catch (e) {
    console.error("expandChain failed", e);
    return new Response(JSON.stringify({ error: "value-chain expansion failed", detail: String(e) }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // Assertion for TS: segments is always assigned above (either from cache or expansion) or we've returned.
  segments = segments!;

  // 2. Build unique universe capped at 60 tickers -----------------------
  const candidateMap = new Map<string, { segment: z.infer<typeof ChainSegment>["segment"]; exposure: Exposure; thesis?: string; name?: string; evidence?: string[]; exposurePct?: number | null }>();
  for (const seg of segments) {
    for (const c of seg.companies) {
      const sym = c.symbol.trim().toUpperCase();
      if (!sym || candidateMap.has(sym)) continue;
      candidateMap.set(sym, { segment: seg.segment, exposure: c.exposure, thesis: c.thesis, name: c.name, evidence: c.evidence, exposurePct: c.exposurePct ?? null });
      if (candidateMap.size >= 60) break;
    }
    if (candidateMap.size >= 60) break;
  }

  // 3. Fanout fundamentals + sentiment ---------------------------------
  const symbols = [...candidateMap.keys()];
  const rows: Array<z.infer<typeof ChainSegment>["companies"][number] & { fundamentals: Awaited<ReturnType<typeof fetchFundamentals>>; sentiment: number | null }> = [];
  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5);
    const results = await Promise.all(batch.map(async (sym) => {
      const [f, s] = await Promise.all([
        fetchFundamentals(sym).catch(() => null),
        fetchSentiment(auth, sym).catch(() => null),
      ]);
      const meta = candidateMap.get(sym)!;
      return { symbol: sym, name: meta.name, exposure: meta.exposure, thesis: meta.thesis, evidence: meta.evidence, exposurePct: meta.exposurePct, segment: meta.segment, fundamentals: f, sentiment: s };
    }));
    for (const r of results) rows.push(r as typeof rows[number]);
  }

  // 4. Filter by region + size -----------------------------------------
  const filtered = rows.filter((r) => {
    if (!r.fundamentals) return false;
    const rgn = regionFromSymbol(r.symbol);
    if (region !== "all" && rgn !== region) return false;
    const band = bandFromMarketCap(r.fundamentals.marketCap);
    if (size !== "all" && band !== size) return false;
    return true;
  });

  // 5. Rank -------------------------------------------------------------
  const ranked = filtered.map((r) => {
    const score = scoreCompany({
      exposure: r.exposure,
      revGrowth: r.fundamentals?.revGrowth ?? null,
      pe: r.fundamentals?.pe ?? null,
      sentiment: r.sentiment,
      marketCap: r.fundamentals?.marketCap ?? null,
      discoveryMode,
    });
    return {
      symbol: r.symbol,
      name: r.fundamentals?.name ?? r.name ?? r.symbol,
      segment: r.segment,
      exposure: r.exposure,
      thesis: r.thesis,
      evidence: r.evidence,
      exposurePct: r.exposurePct ?? null,
      region: regionFromSymbol(r.symbol),
      marketCap: r.fundamentals?.marketCap ?? null,
      price: r.fundamentals?.price ?? null,
      currency: r.fundamentals?.currency,
      pe: r.fundamentals?.pe ?? null,
      revGrowth: r.fundamentals?.revGrowth ?? null,
      sentiment: r.sentiment,
      score,
      discovery: discoveryMode && bandFromMarketCap(r.fundamentals?.marketCap) === "small",
    };
  }).sort((a, b) => (b.score !== a.score ? b.score - a.score : a.symbol.localeCompare(b.symbol)));

  const payload = {
    theme,
    region,
    size,
    discoveryMode,
    chain: segments,
    results: ranked,
    sources: [
      { label: "Yahoo Finance quoteSummary", url: "https://finance.yahoo.com" },
      { label: "Vela sentiment aggregator" },
    ],
    chainCached,
    generated_at: new Date().toISOString(),
  };

  // Cache write ---------------------------------------------------------
  try {
    await admin
      .from("ai_output_cache")
      .upsert({ cache_key: cacheKey, payload, created_at: new Date().toISOString() }, { onConflict: "cache_key" });
  } catch (e) {
    console.warn("thematic-deepdive cache write failed", e);
  }

  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});