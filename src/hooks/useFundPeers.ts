import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FundProfileData } from "./useFundProfile";

export interface PeerMetrics {
  symbol: string;
  name: string;
  currency: string | null;
  isin: string | null;
  ucits: boolean | null;
  distribution: string | null;
  ter: number | null;
  size: number | null;
  oneYear: number | null;
  threeYear: number | null;
  fiveYear: number | null;
  velaScore: number | null;
  riskScore: number | null;
  morningstar: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);

export function toMetrics(d: FundProfileData): PeerMetrics {
  const t = (d.performance?.trailing ?? {}) as Record<string, number | null>;
  const kf = (d.keyFacts ?? {}) as Record<string, number | null>;
  return {
    symbol: d.symbol,
    name: d.profile?.name ?? d.symbol,
    currency: d.currency ?? null,
    isin: d.identifiers?.isin ?? d.isin ?? null,
    ucits: d.identifiers?.ucits ?? null,
    distribution: d.identifiers?.distribution ?? null,
    ter: num(kf.ter),
    size: num(kf.totalAssets),
    oneYear: num(t.oneYear ?? t.oneYearReturn),
    threeYear: num(t.threeYear),
    fiveYear: num(t.fiveYear),
    velaScore: num(d.velaScore?.finalScore),
    riskScore: num(d.velaScore?.riskScore),
    morningstar: num(d.ratings?.morningstarOverall),
  };
}

/** Loads compact comparison metrics for a list of peer tickers. */
export function useFundPeers(symbols: string[], enabled = true) {
  const [peers, setPeers] = useState<PeerMetrics[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = symbols.join(",");
  const ran = useRef<string>("");

  const load = useCallback(async () => {
    if (!symbols.length) { setPeers([]); return; }
    setLoading(true);
    setError(null);
    const out: PeerMetrics[] = [];
    try {
      // Small batches keep the backend and the browser responsive.
      for (let i = 0; i < symbols.length; i += 3) {
        const batch = symbols.slice(i, i + 3);
        const results = await Promise.all(
          batch.map(async (s) => {
            try {
              const { data, error: err } = await supabase.functions.invoke("fund-profile", { body: { symbol: s } });
              if (err || !data || (data as FundProfileData).error) return null;
              return toMetrics(data as FundProfileData);
            } catch { return null; }
          }),
        );
        for (const r of results) if (r) out.push(r);
      }
      setPeers(out);
      if (!out.length) setError("No comparable vehicles returned data.");
    } catch (e) {
      setError((e as Error)?.message ?? "Could not load comparable funds");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!enabled || !key || ran.current === key) return;
    ran.current = key;
    void load();
  }, [enabled, key, load]);

  return { peers, loading, error, reload: load };
}
