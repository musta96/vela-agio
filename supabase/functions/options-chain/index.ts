/**
 * Options chain proxy.
 *
 * Given `{ symbol, expiration? }`, hits Yahoo's public options endpoint and
 * returns the calls + puts arrays for the requested expiration (or the
 * nearest one), plus the full list of available expirations and the current
 * underlying quote so the client can compute Greeks with Black-Scholes.
 *
 * Yahoo is unauthenticated / best-effort. On any failure we return HTTP 502
 * with a structured error the UI can surface.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";

const BodySchema = z.object({
  symbol: z.string().min(1).max(20),
  expiration: z.number().int().optional(), // unix seconds
});

async function fetchYahooOptions(symbol: string, expiration?: number) {
  const base = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
  const url = expiration ? `${base}?date=${expiration}` : base;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  const j = await r.json();
  const chain = j?.optionChain?.result?.[0];
  if (!chain) throw new Error("no chain returned");
  return chain as {
    underlyingSymbol: string;
    expirationDates: number[];
    strikes: number[];
    quote: { regularMarketPrice: number; currency?: string; longName?: string };
    options: Array<{
      expirationDate: number;
      calls: Array<Record<string, number | string>>;
      puts: Array<Record<string, number | string>>;
    }>;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { symbol, expiration } = parsed.data;
  try {
    const chain = await fetchYahooOptions(symbol.toUpperCase(), expiration);
    const bundle = chain.options?.[0];
    const payload = {
      symbol: chain.underlyingSymbol,
      name: chain.quote?.longName ?? chain.underlyingSymbol,
      spot: chain.quote?.regularMarketPrice ?? null,
      currency: chain.quote?.currency ?? "USD",
      expirations: chain.expirationDates ?? [],
      selectedExpiration: bundle?.expirationDate ?? expiration ?? null,
      strikes: chain.strikes ?? [],
      calls: bundle?.calls ?? [],
      puts: bundle?.puts ?? [],
      generated_at: new Date().toISOString(),
    };
    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "options chain fetch failed", detail: String(e) }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});