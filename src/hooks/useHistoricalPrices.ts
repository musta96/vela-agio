import { useEffect, useState } from "react";

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

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";

const buildUrl = (symbol: string, range: HistoryRange) => {
  const { range: r, interval } = RANGE_MAP[range];
  const target = `${YF_BASE}${encodeURIComponent(symbol)}?interval=${interval}&range=${r}`;
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
};

async function fetchHistory(symbol: string, range: HistoryRange): Promise<PriceBar[]> {
  try {
    const res = await fetch(buildUrl(symbol, range));
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];
    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    const bars: PriceBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (typeof c === "number" && !isNaN(c)) {
        bars.push({ t: timestamps[i] * 1000, close: c });
      }
    }
    return bars;
  } catch {
    return [];
  }
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