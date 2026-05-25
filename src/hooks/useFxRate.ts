import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FxRate {
  pair: string;
  rate: number;
  updatedAt: number;
}

/**
 * Live FX rate via the `market-data` edge function.
 * Pair format: "EURUSD", "USDJPY", "GBPEUR", etc.
 */
export function useFxRate(pair: string | null, intervalMs = 10 * 60 * 1000) {
  const [rate, setRate] = useState<FxRate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!pair) { setRate(null); return; }
    const load = async () => {
      setLoading(true); setError(null);
      const { data, error } = await supabase.functions.invoke("market-data", {
        body: { action: "fx", pair },
      });
      if (cancelled) return;
      if (error || !data?.rate) setError("FX unavailable");
      else setRate(data.rate as FxRate);
      setLoading(false);
    };
    load();
    const id = window.setInterval(load, intervalMs);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [pair, intervalMs]);

  return { rate, loading, error };
}