import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";

/**
 * Single source of truth for the user's net worth.
 *
 * Loads every `net_worth_accounts` row, applies live FX so every value is
 * expressed in the user's base currency, computes live valuation for
 * portfolio-linked entries, and exposes assets / liabilities / net totals
 * plus a per-category breakdown.
 *
 * Used by both the Dashboard tile and the /net-worth page so the two numbers
 * always agree.
 */

export type NWAccountLite = {
  id: string;
  category: string;
  currency: string;
  manual_value: number | null;
  is_liability: boolean;
  include_in_total: boolean;
  linked_portfolio_ids: string[] | null;
};

type Holding = { portfolio_id: string | null; symbol: string; shares: number; avg_price: number; currency: string };

const FX_TTL_MS = 10 * 60 * 1000;
const fxCache: Record<string, { rate: number; ts: number }> = {};

async function fetchFx(pair: string): Promise<number | null> {
  const cached = fxCache[pair];
  if (cached && Date.now() - cached.ts < FX_TTL_MS) return cached.rate;
  try {
    const { data, error } = await supabase.functions.invoke("market-data", { body: { action: "fx", pair } });
    const rate = (data as any)?.rate?.rate;
    if (error || typeof rate !== "number" || !isFinite(rate)) return null;
    fxCache[pair] = { rate, ts: Date.now() };
    return rate;
  } catch {
    return null;
  }
}

/** Convert `amount` from `from` ccy to `base` ccy. Tries direct pair, then inverse, then USD-bridge. */
async function convert(amount: number, from: string, base: string): Promise<number> {
  if (!amount) return 0;
  const f = (from || base).toUpperCase();
  const b = (base || "EUR").toUpperCase();
  if (f === b) return amount;
  const direct = await fetchFx(`${f}${b}`);
  if (direct) return amount * direct;
  const inverse = await fetchFx(`${b}${f}`);
  if (inverse) return amount / inverse;
  // USD bridge
  if (f !== "USD" && b !== "USD") {
    const toUsd = await fetchFx(`${f}USD`);
    const fromUsd = await fetchFx(`USD${b}`);
    if (toUsd && fromUsd) return amount * toUsd * fromUsd;
  }
  return amount; // fall back to raw — better than zero
}

export function useNetWorthTotal(baseCurrency = "EUR") {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<NWAccountLite[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [converted, setConverted] = useState<{ total: number; assets: number; liabilities: number; byCategory: Record<string, number> }>({
    total: 0, assets: 0, liabilities: 0, byCategory: {},
  });

  // Load accounts + holdings
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [a, h] = await Promise.all([
        (supabase as any).from("net_worth_accounts").select("id,category,currency,manual_value,is_liability,include_in_total,linked_portfolio_ids"),
        (supabase as any).from("portfolio_holdings").select("portfolio_id,symbol,shares,avg_price,currency"),
      ]);
      if (cancelled) return;
      setAccounts((a.data as NWAccountLite[]) || []);
      setHoldings((h.data as Holding[]) || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const liveSymbols = useMemo(() => Array.from(new Set(holdings.map((h) => h.symbol))), [holdings]);
  const { quotes } = useLiveQuotes(liveSymbols, 60_000);

  const holdingsByPortfolio = useMemo(() => {
    const m: Record<string, Holding[]> = {};
    for (const h of holdings) (m[h.portfolio_id || "_legacy"] ||= []).push(h);
    return m;
  }, [holdings]);

  // Per-account raw value (in account currency)
  const rawValueOf = (a: NWAccountLite): number => {
    if (a.linked_portfolio_ids && a.linked_portfolio_ids.length) {
      let t = 0;
      for (const pid of a.linked_portfolio_ids) {
        for (const h of holdingsByPortfolio[pid] || []) {
          const px = quotes[h.symbol]?.price ?? h.avg_price ?? 0;
          t += (h.shares || 0) * (px || 0);
        }
      }
      return t;
    }
    return Number(a.manual_value) || 0;
  };

  // Recompute converted totals whenever inputs change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let assets = 0, liabilities = 0;
      const byCategory: Record<string, number> = {};
      for (const a of accounts) {
        if (!a.include_in_total) continue;
        const raw = rawValueOf(a);
        const v = await convert(raw, a.currency || baseCurrency, baseCurrency);
        if (a.is_liability || a.category === "liabilities") liabilities += Math.abs(v);
        else { assets += v; byCategory[a.category] = (byCategory[a.category] || 0) + v; }
      }
      if (cancelled) return;
      setConverted({ total: assets - liabilities, assets, liabilities, byCategory });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, holdingsByPortfolio, quotes, baseCurrency]);

  return {
    loading,
    currency: baseCurrency,
    total: converted.total,
    assets: converted.assets,
    liabilities: converted.liabilities,
    byCategory: converted.byCategory,
    accountCount: accounts.length,
    /** Per-account value in BASE currency — async resolved via convert() */
    convertValue: (amount: number, from: string) => convert(amount, from, baseCurrency),
    rawValueOf,
  };
}