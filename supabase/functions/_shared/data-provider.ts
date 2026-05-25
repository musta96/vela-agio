// Server-side helper: read user-stored data-provider API keys via keys-vault.
// Lets analyses (sentiment, technical, fundamental, deep, briefing) prefer the
// user's BYO key when available and fall back to the platform default.
//
// Usage:
//   const key = await getUserDataKey(authHeader, 'FINNHUB_API_KEY');
//   if (key) { /* call Finnhub with key */ } else { /* free fallback */ }

const CACHE = new Map<string, { value: string | null; at: number }>();
const TTL_MS = 60_000;

export async function getUserDataKey(authHeader: string | null, provider: string): Promise<string | null> {
  if (!authHeader) return null;
  const cacheKey = `${authHeader.slice(-20)}:${provider}`;
  const hit = CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const url = Deno.env.get('SUPABASE_URL');
  if (!url) return null;
  try {
    const r = await fetch(`${url}/functions/v1/keys-vault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ action: 'get', provider }),
    });
    if (!r.ok) { CACHE.set(cacheKey, { value: null, at: Date.now() }); return null; }
    const j = await r.json();
    const value: string | null = j?.value ?? null;
    CACHE.set(cacheKey, { value, at: Date.now() });
    return value;
  } catch {
    return null;
  }
}

/** Fetch multiple keys at once. Returns a map keyed by provider id. */
export async function getUserDataKeys(authHeader: string | null, providers: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  await Promise.all(providers.map(async p => { out[p] = await getUserDataKey(authHeader, p); }));
  return out;
}