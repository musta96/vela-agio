import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type HistoryRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "YTD";

const RANGE_MAP: Record<HistoryRange, { range: string; interval: string }> = {
  "1W": { range: "5d", interval: "30m" },
  "1M": { range: "1mo", interval: "1d" },
  "3M": { range: "3mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1wk" },
  YTD: { range: "ytd", interval: "1d" },
};

export interface PriceBar {
  t: number; // ms
  close: number;
}

async function fetchHistory(symbol: string, range: HistoryRange): Promise<PriceBar[]> {
  const { range: r, interval } = RANGE_MAP[range];
  const { data, error } = await supabase.functions.invoke("market-data", {
    body: { action: "ohlc", symbol, range: r, interval },
  });
  if (error || !Array.isArray(data?.bars)) return [];
  return (data.bars as Array<{ t: number; close: number }>).map((b) => ({ t: b.t, close: b.close }));
}

export interface SymbolHistory {
  symbol: string;
  bars: PriceBar[];
}

export function useHistoricalPrices(symbols: string[], range: HistoryRange) {
  const [data, setData] = useState<Record<string, PriceBar[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = symbols.join(",") + "|" + range;

  useEffect(() => {
    let cancelled = false;
    if (symbols.length === 0) {
      setData({});
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all(symbols.map((s) => fetchHistory(s, range).then((bars) => [s, bars] as const)))
      .then((results) => {
        if (cancelled) return;
        const next: Record<string, PriceBar[]> = {};
        let any = false;
        results.forEach(([s, bars]) => {
          next[s] = bars;
          if (bars.length) any = true;
        });
        setData(next);
        if (!any) setError("No historical data available");
      })
      .catch(() => !cancelled && setError("Failed to load historical data"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error };
}