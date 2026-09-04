import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FundProfileData {
  symbol: string;
  isin?: string | null;
  quoteType?: string;
  asOf?: string;
  currency?: string | null;
  error?: string;
  message?: string;
  profile?: {
    name: string;
    exchange: string | null;
    family: string | null;
    category: string | null;
    legalType: string | null;
    inceptionDate: string | null;
    benchmark: string | null;
    description: string | null;
    website: string | null;
    phone: string | null;
    managers: string[];
  };
  keyFacts?: Record<string, number | null>;
  holdings?: {
    count: number;
    top: { symbol: string | null; name: string | null; weight: number | null }[];
    sectorWeights: { name: string; weight: number | null }[];
    bondRatings: { name: string; weight: number | null }[];
    assetAllocation: Record<string, number | null>;
    equityStats: Record<string, number | null>;
    bondStats: { duration: number | null; maturity: number | null; creditQuality: string | null };
  };
  performance?: {
    trailing: Record<string, number | null>;
    trailingCategory: Record<string, number | null>;
    annual: { year: string | null; fund: number | null; category: number | null }[];
  };
  risk?: {
    period: string | null; alpha: number | null; beta: number | null; meanAnnualReturn: number | null;
    rSquared: number | null; stdDev: number | null; sharpeRatio: number | null; treynorRatio: number | null;
  }[];
  fees?: Record<string, unknown> & { category?: Record<string, number | null> };
  distributions?: { date: string; amount: number }[];
  splits?: { date: string; ratio: string }[];
}

/**
 * Loads the full ETF / fund data sheet (key facts, holdings, performance,
 * risk statistics, fees and distributions) from the backend. Accepts a
 * ticker or an ISIN — mutual funds are resolved server-side.
 */
export function useFundProfile(symbol: string | undefined) {
  const [data, setData] = useState<FundProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("fund-profile", {
        body: { symbol },
      });
      if (err) throw err;
      setData(res as FundProfileData);
    } catch (e) {
      setError((e as Error)?.message ?? "Could not load fund data");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, reload: load };
}
