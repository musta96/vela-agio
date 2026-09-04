import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LiveQuote {
  symbol: string;
  price: number;
  change: number; // percent
  previousClose: number;
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
  return data.quotes as Record<string, LiveQuote>;
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