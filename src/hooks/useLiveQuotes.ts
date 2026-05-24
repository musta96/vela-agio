import { useEffect, useRef, useState } from "react";

export interface LiveQuote {
  symbol: string;
  price: number;
  change: number; // percent
  previousClose: number;
  currency?: string;
  marketState?: string;
  updatedAt: number;
}

// Yahoo Finance chart endpoint via a public CORS proxy.
// FTSE MIB tickers use the ".MI" suffix on Yahoo Finance.
const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";

const buildUrl = (symbol: string) => {
  const target = `${YF_BASE}${encodeURIComponent(symbol)}?interval=1m&range=1d`;
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
};

async function fetchQuote(symbol: string): Promise<LiveQuote | null> {
  try {
    const res = await fetch(buildUrl(symbol));
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? meta.previousClose;
    if (typeof price !== "number" || typeof prev !== "number" || prev === 0) return null;
    return {
      symbol,
      price,
      previousClose: prev,
      change: ((price - prev) / prev) * 100,
      currency: meta.currency,
      marketState: meta.marketState,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
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
      const results = await Promise.all(symbols.map(fetchQuote));
      if (!mountedRef.current) return;
      const next: Record<string, LiveQuote> = {};
      let okCount = 0;
      results.forEach((q, i) => {
        if (q) {
          next[symbols[i]] = q;
          okCount++;
        }
      });
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