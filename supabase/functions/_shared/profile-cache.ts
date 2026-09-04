// Small server-side cache for slow upstream fundamentals calls.
// Backed by `market_data_cache` (service-role only) so every user of the same
// ticker shares one upstream fetch instead of hammering Yahoo per page view.

import { createClient } from "npm:@supabase/supabase-js@2";

function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getCached<T>(cacheKey: string): Promise<T | null> {
  const db = admin();
  if (!db) return null;
  try {
    const { data } = await db
      .from("market_data_cache")
      .select("payload, expires_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (!data?.payload) return null;
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
    return data.payload as T;
  } catch {
    return null;
  }
}

export async function setCached(
  cacheKey: string,
  kind: string,
  symbol: string,
  payload: unknown,
  ttlSeconds: number,
): Promise<void> {
  const db = admin();
  if (!db) return;
  try {
    await db.from("market_data_cache").upsert({
      cache_key: cacheKey,
      kind,
      symbol,
      payload,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    }, { onConflict: "cache_key" });
  } catch {
    // cache failures must never break the response
  }
}
