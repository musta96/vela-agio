import { getMacroSeries } from "../_shared/providers.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TTL_SEC = 60 * 60 * 12; // daily-ish

async function readCache(key: string) {
  const { data } = await supabase
    .from("market_data_cache")
    .select("payload, expires_at, fetched_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (!data) return null;
  return data;
}

async function writeCache(key: string, payload: unknown) {
  await supabase.from("market_data_cache").upsert(
    {
      cache_key: key,
      kind: "macro",
      symbol: key,
      payload,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + TTL_SEC * 1000).toISOString(),
    },
    { onConflict: "cache_key" },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { ids?: string[] } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const ids = Array.isArray(body.ids) ? body.ids.slice(0, 20) : [];
  if (!ids.length) {
    return new Response(JSON.stringify({ error: "ids required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const out: Record<string, unknown> = {};
  await Promise.all(ids.map(async (id) => {
    const key = `macro:${id}`;
    const cached = await readCache(key);
    const fresh = cached && new Date(cached.expires_at).getTime() > Date.now();
    if (fresh) { out[id] = { ...(cached.payload as object), source: "cache" }; return; }
    try {
      const series = await getMacroSeries(id);
      if (series.points.length || series.notCovered) {
        out[id] = series;
        if (!series.notCovered) await writeCache(key, series);
      } else if (cached) {
        // serve stale with badge
        out[id] = { ...(cached.payload as object), stale: true, source: "cache" };
      } else {
        out[id] = series;
      }
    } catch (e) {
      if (cached) {
        out[id] = { ...(cached.payload as object), stale: true, source: "cache" };
      } else {
        out[id] = { id, label: id, unit: "", source: "cache", asOf: Date.now(), points: [], notCovered: true, error: (e as Error).message };
      }
    }
  }));

  return new Response(JSON.stringify({ series: out }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});