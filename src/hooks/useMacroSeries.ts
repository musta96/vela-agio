import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MacroPoint { t: string; v: number }
export interface MacroSeries {
  id: string;
  label: string;
  unit: string;
  source: string;
  asOf: number;
  points: MacroPoint[];
  stale?: boolean;
  notCovered?: boolean;
}

export function useMacroSeries(ids: string[]) {
  const [series, setSeries] = useState<Record<string, MacroSeries>>({});
  const [loading, setLoading] = useState(false);
  const key = ids.join(",");
  useEffect(() => {
    let cancelled = false;
    if (!ids.length) return;
    setLoading(true);
    supabase.functions
      .invoke("macro-series", { body: { ids } })
      .then(({ data }) => {
        if (cancelled) return;
        setSeries((data?.series as Record<string, MacroSeries>) ?? {});
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { series, loading };
}