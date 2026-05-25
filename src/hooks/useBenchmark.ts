import { useEffect, useState } from "react";
import type { OHLCBar } from "@/lib/technicalIndicators";
import { supabase } from "@/integrations/supabase/client";

/** Default benchmark by market. */
export function benchmarkFor(market?: string): { symbol: string; label: string } {
  if (!market) return { symbol: "^GSPC", label: "S&P 500" };
  if (market === "FTSE MIB") return { symbol: "FTSEMIB.MI", label: "FTSE MIB" };
  if (market === "Europe") return { symbol: "^STOXX50E", label: "EURO STOXX 50" };
  if (market === "NASDAQ") return { symbol: "^IXIC", label: "NASDAQ" };
  return { symbol: "^GSPC", label: "S&P 500" };
}

export function useBenchmarkBars(symbol: string | null, range = "1y", interval = "1d") {
  const [bars, setBars] = useState<OHLCBar[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!symbol) { setBars([]); return; }
    setLoading(true);
    supabase.functions
      .invoke("market-data", { body: { action: "ohlc", symbol, range, interval } })
      .then(({ data }) => {
        if (!cancelled && data?.bars) setBars(data.bars as OHLCBar[]);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [symbol, range, interval]);
  return { bars, loading };
}