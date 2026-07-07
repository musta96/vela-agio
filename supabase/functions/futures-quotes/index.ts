/**
 * Futures viewer feed.
 *
 * Returns live quotes for a curated set of major commodity + index
 * continuous futures (Yahoo `=F` symbols). No auth required.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { fetchQuoteOrNull } from "../_shared/quote-providers.ts";

export interface FuturesContract {
  symbol: string;         // Yahoo symbol, e.g. "CL=F"
  label: string;          // display name
  category: "energy" | "metals" | "agri" | "index" | "rates" | "fx";
  exchange: string;
  contractSize: string;
  tickSize: string;
  currency: string;
  hedgeUseCase: string;   // short 1-liner: what this contract hedges
}

export const FUTURES_UNIVERSE: FuturesContract[] = [
  // energy
  { symbol: "CL=F", label: "WTI Crude Oil", category: "energy", exchange: "NYMEX", contractSize: "1,000 bbl", tickSize: "$0.01 = $10", currency: "USD", hedgeUseCase: "Oil price risk, energy stocks" },
  { symbol: "BZ=F", label: "Brent Crude", category: "energy", exchange: "ICE", contractSize: "1,000 bbl", tickSize: "$0.01 = $10", currency: "USD", hedgeUseCase: "EU energy prices, refiners" },
  { symbol: "NG=F", label: "Natural Gas", category: "energy", exchange: "NYMEX", contractSize: "10,000 MMBtu", tickSize: "$0.001 = $10", currency: "USD", hedgeUseCase: "Gas prices, utilities" },
  // metals
  { symbol: "GC=F", label: "Gold", category: "metals", exchange: "COMEX", contractSize: "100 oz", tickSize: "$0.10 = $10", currency: "USD", hedgeUseCase: "Inflation, USD weakness, safe-haven" },
  { symbol: "SI=F", label: "Silver", category: "metals", exchange: "COMEX", contractSize: "5,000 oz", tickSize: "$0.005 = $25", currency: "USD", hedgeUseCase: "Precious-metal exposure, industrial demand" },
  { symbol: "HG=F", label: "Copper", category: "metals", exchange: "COMEX", contractSize: "25,000 lb", tickSize: "$0.0005 = $12.50", currency: "USD", hedgeUseCase: "Global growth, industrial cycle" },
  // agri
  { symbol: "ZC=F", label: "Corn", category: "agri", exchange: "CBOT", contractSize: "5,000 bu", tickSize: "1/4c = $12.50", currency: "USD", hedgeUseCase: "Food-inflation, agri stocks" },
  { symbol: "ZS=F", label: "Soybeans", category: "agri", exchange: "CBOT", contractSize: "5,000 bu", tickSize: "1/4c = $12.50", currency: "USD", hedgeUseCase: "Feed & biofuel supply chain" },
  // index
  { symbol: "ES=F", label: "E-mini S&P 500", category: "index", exchange: "CME", contractSize: "$50 × index", tickSize: "0.25 = $12.50", currency: "USD", hedgeUseCase: "US large-cap equity beta" },
  { symbol: "NQ=F", label: "E-mini Nasdaq 100", category: "index", exchange: "CME", contractSize: "$20 × index", tickSize: "0.25 = $5", currency: "USD", hedgeUseCase: "US tech / growth beta" },
  { symbol: "YM=F", label: "E-mini Dow", category: "index", exchange: "CBOT", contractSize: "$5 × index", tickSize: "1 = $5", currency: "USD", hedgeUseCase: "US blue-chip beta" },
  { symbol: "RTY=F", label: "E-mini Russell 2000", category: "index", exchange: "CME", contractSize: "$50 × index", tickSize: "0.10 = $5", currency: "USD", hedgeUseCase: "US small-cap beta" },
  { symbol: "VX=F", label: "VIX (front)", category: "index", exchange: "CFE", contractSize: "$1,000 × index", tickSize: "0.05 = $50", currency: "USD", hedgeUseCase: "Tail-risk / volatility spike hedge" },
  // rates
  { symbol: "ZN=F", label: "10Y US Treasury", category: "rates", exchange: "CBOT", contractSize: "$100,000 face", tickSize: "1/64 = $15.625", currency: "USD", hedgeUseCase: "Duration / rate risk" },
  // fx
  { symbol: "6E=F", label: "Euro FX", category: "fx", exchange: "CME", contractSize: "€125,000", tickSize: "0.00005 = $6.25", currency: "USD", hedgeUseCase: "EUR/USD exposure" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
  const rows = await Promise.all(FUTURES_UNIVERSE.map(async (c) => {
    const q = await fetchQuoteOrNull(c.symbol);
    return {
      ...c,
      price: q?.price ?? null,
      changePct: q?.changePct ?? null,
      previousClose: q?.previousClose ?? null,
      updatedAt: q?.updatedAt ?? null,
    };
  }));
  return new Response(JSON.stringify({ contracts: rows, generated_at: new Date().toISOString() }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});