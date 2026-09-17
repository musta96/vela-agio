import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LiveQuote {
  symbol: string;
  price?: number;
  change: number; // percent
  previousClose?: number;
  currency?: string;
  marketState?: string;
  updatedAt: number;
  source?: string;
  asOf?: number;
  stale?: boolean;
  quoteType?: string;
}

// Quotes are fetched via our `market-data` edge function which proxies Yahoo
// Finance server-side (no public CORS proxy) and caches results.
async function fetchQuotes(symbols: string[]): Promise<Record<string, LiveQuote>> {
  const { data, error } = await supabase.functions.invoke("market-data", {
    body: { action: "quote", symbols },
  });
  if (error || !data?.quotes) return {};
  const rawQuotes = data.quotes;
  if (typeof rawQuotes !== "object" || rawQuotes === null || Array.isArray(rawQuotes)) return {};

  const normalized: Record<string, LiveQuote> = {};
  for (const [symbol, raw] of Object.entries(rawQuotes as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const quote = raw as Record<string, unknown>;
    const finiteNumber = (value: unknown, fallback = 0) =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    // Missing/invalid prices stay `undefined` so downstream `?? fallback` works.
    const optionalNumber = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) ? value : undefined;
    normalized[symbol] = {
      symbol: typeof quote.symbol === "string" ? quote.symbol : symbol,
      price: optionalNumber(quote.price),
      change: finiteNumber(quote.change),
      previousClose: optionalNumber(quote.previousClose),
      currency: typeof quote.currency === "string" ? quote.currency : undefined,
      marketState: typeof quote.marketState === "string" ? quote.marketState : undefined,
      updatedAt: finiteNumber(quote.updatedAt, Date.now()),
      source: typeof quote.source === "string" ? quote.source : undefined,
      asOf: typeof quote.asOf === "number" && Number.isFinite(quote.asOf) ? quote.asOf : undefined,
      stale: typeof quote.stale === "boolean" ? quote.stale : undefined,
      quoteType: typeof quote.quoteType === "string" ? quote.quoteType : undefined,
    };
  }
  return normalized;
}

export interface UseLiveQuotesResult {
  quotes: Record<string, LiveQuote>;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  refresh: () => void;
}

export function useLiveQuotes(symbols: string[], intervalMs = 30000): UseLiveQuotesResult {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const symbolsKey = symbols.join(",");
  const mountedRef = useRef(true);

  const load = async () => {
    if (symbols.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchQuotes(symbols);
      if (!mountedRef.current) return;
      const okCount = Object.keys(next).length;
      setQuotes((prev) => ({ ...prev, ...next }));
      setLastUpdated(Date.now());
      if (okCount === 0) setError("Unable to load live prices");
    } catch (e) {
      setError("Live prices unavailable");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    load();
    const id = window.setInterval(load, intervalMs);
    return () => {
      mountedRef.current = false;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, intervalMs]);

  return { quotes, loading, error, lastUpdated, refresh: load };
}