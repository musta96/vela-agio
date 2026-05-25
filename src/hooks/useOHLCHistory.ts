import { useEffect, useState } from "react";
import type { OHLCBar } from "@/lib/technicalIndicators";
import { supabase } from "@/integrations/supabase/client";

export type OHLCRange = "1M" | "3M" | "6M" | "YTD" | "1Y" | "2Y" | "5Y";

const RANGE_MAP: Record<OHLCRange, { range: string; interval: string }> = {
  "1M": { range: "1mo", interval: "1d" },
  "3M": { range: "3mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  YTD: { range: "ytd", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  "2Y": { range: "2y", interval: "1d" },
  "5Y": { range: "5y", interval: "1wk" },
};

async function fetchOHLC(symbol: string, range: OHLCRange): Promise<OHLCBar[]> {
  const { range: r, interval } = RANGE_MAP[range];
  const { data, error } = await supabase.functions.invoke("market-data", {
    body: { action: "ohlc", symbol, range: r, interval },
  });
  if (error || !data?.bars) return [];
  return data.bars as OHLCBar[];
}

export function useOHLCHistory(symbol: string | null, range: OHLCRange) {
  const [bars, setBars] = useState<OHLCBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!symbol) {
      setBars([]);
      return;
    }
    setLoading(true);
    setError(null);
    fetchOHLC(symbol, range)
      .then((b) => {
        if (cancelled) return;
        setBars(b);
        if (b.length === 0) setError("No data available for this symbol");
      })
      .catch(() => !cancelled && setError("Failed to load chart data"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  return { bars, loading, error };
}