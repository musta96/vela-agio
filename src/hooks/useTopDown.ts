import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { OHLCBar } from "@/lib/technicalIndicators";

export interface TopDownConfig {
  label: string;      // display, e.g. "1W"
  range: string;      // Yahoo range
  interval: string;   // Yahoo interval
}

export const DEFAULT_TOP_DOWN: TopDownConfig[] = [
  { label: "1W",  range: "5y",  interval: "1wk" },
  { label: "1D",  range: "1y",  interval: "1d" },
  { label: "1H",  range: "1mo", interval: "1h" },
  { label: "15m", range: "5d",  interval: "15m" },
];

export interface TopDownFrame {
  cfg: TopDownConfig;
  bars: OHLCBar[];
  error?: string;
}

async function fetchBars(symbol: string, cfg: TopDownConfig): Promise<OHLCBar[]> {
  const { data, error } = await supabase.functions.invoke("market-data", {
    body: { action: "ohlc", symbol, range: cfg.range, interval: cfg.interval },
  });
  if (error || !data?.bars) return [];
  return data.bars as OHLCBar[];
}

export function useTopDown(symbol: string | null, configs: TopDownConfig[] = DEFAULT_TOP_DOWN) {
  const [frames, setFrames] = useState<TopDownFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) { setFrames([]); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(configs.map(async (cfg) => {
      try {
        const bars = await fetchBars(symbol, cfg);
        return { cfg, bars } as TopDownFrame;
      } catch (e) {
        return { cfg, bars: [], error: e instanceof Error ? e.message : "failed" };
      }
    })).then((res) => {
      if (cancelled) return;
      setFrames(res);
      if (res.every((f) => f.bars.length === 0)) setError("No data available across timeframes");
    }).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [symbol, JSON.stringify(configs)]);

  return { frames, loading, error };
}
