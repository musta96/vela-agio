import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type StatementRow = { period: string; values: Record<string, number | null> };

export interface CompanyProfileData {
  symbol: string;
  asOf?: string;
  currency?: string | null;
  financialCurrency?: string | null;
  error?: string;
  message?: string;
  profile?: {
    name: string;
    exchange: string | null;
    sector: string | null;
    industry: string | null;
    country: string | null;
    website: string | null;
    employees: number | null;
    description: string | null;
  };
  indicators?: Record<string, number | string | null>;
  events?: {
    nextEarnings: string | null;
    earningsWindow: string[] | null;
    exDividendDate: string | null;
    dividendDate: string | null;
    earningsHistory: { quarter: string | null; epsActual: number | null; epsEstimate: number | null; surprisePercent: number | null }[];
    estimates: { period: string; endDate: string | null; epsAvg: number | null; revenueAvg: number | null; growth: number | null }[];
  };
  statements?: {
    annual: { income: StatementRow[]; balance: StatementRow[]; cash: StatementRow[] };
    quarterly: { income: StatementRow[]; balance: StatementRow[]; cash: StatementRow[] };
  };
  dividends?: { date: string; amount: number }[];
  splits?: { date: string; ratio: string }[];
}

/**
 * Loads the full company data sheet (indicators, calendar events, dividends
 * and financial statements) from the backend. Coverage is worldwide; when a
 * listing has no fundamentals provider the payload carries an explicit
 * `error: "NO_FUNDAMENTALS_SOURCE"` instead of silently showing nothing.
 */
export function useCompanyProfile(symbol: string | undefined) {
  const [data, setData] = useState<CompanyProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("company-profile", {
        body: { symbol },
      });
      if (err) throw err;
      setData(res as CompanyProfileData);
    } catch (e) {
      setError((e as Error)?.message || "Company data unavailable");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, reload: load };
}
