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

/**
 * Drop bars that are clearly bad ticks: non-finite/non-positive prices, or a
 * close that deviates from the local median by more than 20x. Upstream
 * providers occasionally emit glitch bars (e.g. a volume value spliced into
 * the close array) which blow up the chart's vertical axis.
 */
export function sanitizeBars(bars: OHLCBar[]): OHLCBar[] {
  const valid = bars.filter(
    (b) =>
      Number.isFinite(b.close) && b.close > 0 &&
      Number.isFinite(b.open) && Number.isFinite(b.high) && Number.isFinite(b.low) &&
      b.high >= b.low,
  );
  if (valid.length < 5) return valid;
  const closes = valid.map((b) => b.close);
  const sorted = [...closes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!(median > 0)) return valid;
  return valid.filter((b, i) => {
    const prev = closes[i - 1] ?? median;
    const next = closes[i + 1] ?? median;
    const local = (prev + next) / 2 || median;
    const ratio = b.close / local;
    return ratio > 1 / 20 && ratio < 20;
  });
}

/** Compact axis labels: 771957396 -> "772M", 240000 -> "240K", 127.44 -> "127.44". */
export function compactAxisTick(v: number): string {
  if (!Number.isFinite(v)) return "";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toPrecision(3)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toPrecision(3)}M`;
  if (abs >= 1e5) return `${Math.round(v / 1e3)}K`;
  if (abs >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

async function fetchOHLC(symbol: string, range: OHLCRange): Promise<OHLCBar[]> {
  const { range: r, interval } = RANGE_MAP[range];
  const { data, error } = await supabase.functions.invoke("market-data", {
    body: { action: "ohlc", symbol, range: r, interval },
  });
  if (error || !data?.bars) return [];
  return sanitizeBars(data.bars as OHLCBar[]);
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
