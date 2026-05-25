import { useEffect, useState } from "react";
import type { OHLCBar } from "@/lib/technicalIndicators";

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

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";

const buildUrl = (symbol: string, range: OHLCRange) => {
  const { range: r, interval } = RANGE_MAP[range];
  const target = `${YF_BASE}${encodeURIComponent(symbol)}?interval=${interval}&range=${r}`;
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
};

async function fetchOHLC(symbol: string, range: OHLCRange): Promise<OHLCBar[]> {
  try {
    const res = await fetch(buildUrl(symbol, range));
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];
    const ts: number[] = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const opens: (number | null)[] = q.open || [];
    const highs: (number | null)[] = q.high || [];
    const lows: (number | null)[] = q.low || [];
    const closes: (number | null)[] = q.close || [];
    const volumes: (number | null)[] = q.volume || [];
    const bars: OHLCBar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = opens[i],
        h = highs[i],
        l = lows[i],
        c = closes[i];
      if (
        typeof o === "number" &&
        typeof h === "number" &&
        typeof l === "number" &&
        typeof c === "number"
      ) {
        bars.push({
          t: ts[i] * 1000,
          open: o,
          high: h,
          low: l,
          close: c,
          volume: typeof volumes[i] === "number" ? (volumes[i] as number) : undefined,
        });
      }
    }
    return bars;
  } catch {
    return [];
  }
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