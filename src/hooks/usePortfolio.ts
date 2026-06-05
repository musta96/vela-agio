import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { usePortfolios } from "./usePortfolios";
import { useLiveQuotes } from "./useLiveQuotes";

export interface Holding {
  symbol: string;
  name: string | null;
  shares: number;
  avg_price: number;
  currency: string;
}

export interface PositionMetrics {
  holding: Holding;
  livePrice: number | null;
  /** Price used for valuation: live price, else avg_price fallback. Always finite. */
  effectivePrice: number;
  hasLivePrice: boolean;
  marketValue: number;
  costBasis: number;
  unrealisedPnL: number;
  unrealisedPnLPct: number | null; // null when no live price
  dayPnL: number;
  dayPnLPct: number | null;
}

export interface UsePortfolioResult {
  holdings: Holding[];
  positions: PositionMetrics[];
  /** Σ shares × (livePrice ?? avg_price) — single source of truth. */
  marketValue: number;
  /** Σ shares × avg_price */
  costBasis: number;
  unrealisedPnL: number;
  unrealisedPnLPct: number;
  dayPnL: number;
  dayPnLPct: number;
  winners: PositionMetrics[];
  losers: PositionMetrics[];
  flat: PositionMetrics[];
  noPrice: PositionMetrics[];
  hasAnyLivePrice: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Single source of truth for the active portfolio's holdings + valuation.
 * Every page that displays "total value", "P&L", or winner/loser counts MUST
 * consume this hook so the numbers always reconcile.
 *
 * Convention:
 *   marketValue = Σ shares × livePrice (falls back to avg_price when no quote)
 *   costBasis   = Σ shares × avg_price
 *
 * `noPrice` positions are bucketed separately so the UI can render "no live price"
 * rather than a fake 0% return.
 */
export function usePortfolio(): UsePortfolioResult {
  const { user } = useAuth();
  const { primary, activeId } = usePortfolios();
  const portfolioId = primary?.id ?? activeId ?? null;

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setHoldings([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const q = portfolioId
        ? supabase
            .from("portfolio_holdings")
            .select("symbol,name,shares,avg_price,currency")
            .eq("portfolio_id", portfolioId)
        : supabase
            .from("portfolio_holdings")
            .select("symbol,name,shares,avg_price,currency")
            .eq("user_id", user.id);
      const { data, error: err } = await q;
      if (err) throw err;
      setHoldings(
        (data ?? []).map((r: any) => ({
          symbol: String(r.symbol),
          name: r.name ?? null,
          shares: Number(r.shares) || 0,
          avg_price: Number(r.avg_price) || 0,
          currency: r.currency || "EUR",
        })),
      );
    } catch (e: any) {
      setError(e?.message || "Failed to load holdings");
      setHoldings([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, portfolioId]);

  useEffect(() => {
    load();
  }, [load]);

  const symbols = useMemo(
    () => Array.from(new Set(holdings.map((h) => h.symbol))).filter(Boolean),
    [holdings],
  );
  const { quotes } = useLiveQuotes(symbols, 30000);

  const positions = useMemo<PositionMetrics[]>(() => {
    return holdings.map((h) => {
      const q = quotes[h.symbol];
      const livePrice = q?.price != null && Number.isFinite(q.price) ? Number(q.price) : null;
      const hasLivePrice = livePrice != null && livePrice > 0;
      const effectivePrice = hasLivePrice ? (livePrice as number) : Number(h.avg_price) || 0;
      const marketValue = h.shares * effectivePrice;
      const costBasis = h.shares * (Number(h.avg_price) || 0);
      const unrealisedPnL = marketValue - costBasis;
      const unrealisedPnLPct = hasLivePrice && costBasis > 0 ? (unrealisedPnL / costBasis) * 100 : null;
      const prevClose = hasLivePrice && q?.previousClose ? Number(q.previousClose) : null;
      const dayPnL = hasLivePrice && prevClose ? h.shares * ((livePrice as number) - prevClose) : 0;
      const dayPnLPct = hasLivePrice && prevClose && prevClose > 0
        ? (((livePrice as number) - prevClose) / prevClose) * 100
        : null;
      return {
        holding: h,
        livePrice,
        effectivePrice,
        hasLivePrice,
        marketValue,
        costBasis,
        unrealisedPnL,
        unrealisedPnLPct,
        dayPnL,
        dayPnLPct,
      };
    });
  }, [holdings, quotes]);

  const totals = useMemo(() => {
    let marketValue = 0;
    let costBasis = 0;
    let dayPnL = 0;
    let prevValue = 0;
    let hasAnyLivePrice = false;
    for (const p of positions) {
      marketValue += p.marketValue;
      costBasis += p.costBasis;
      if (p.hasLivePrice) {
        hasAnyLivePrice = true;
        dayPnL += p.dayPnL;
        const prev = p.livePrice != null ? p.livePrice - (p.dayPnLPct != null && p.livePrice ? (p.dayPnL / p.holding.shares || 0) : 0) : 0;
        // simpler: recompute prevValue from previousClose via dayPnL
        prevValue += p.marketValue - p.dayPnL;
      } else {
        prevValue += p.marketValue;
      }
    }
    const unrealisedPnL = marketValue - costBasis;
    const unrealisedPnLPct = costBasis > 0 ? (unrealisedPnL / costBasis) * 100 : 0;
    const dayPnLPct = prevValue > 0 ? (dayPnL / prevValue) * 100 : 0;
    return { marketValue, costBasis, unrealisedPnL, unrealisedPnLPct, dayPnL, dayPnLPct, hasAnyLivePrice };
  }, [positions]);

  const winners = useMemo(() => positions.filter((p) => p.hasLivePrice && p.unrealisedPnL > 0), [positions]);
  const losers = useMemo(() => positions.filter((p) => p.hasLivePrice && p.unrealisedPnL < 0), [positions]);
  const flat = useMemo(() => positions.filter((p) => p.hasLivePrice && p.unrealisedPnL === 0), [positions]);
  const noPrice = useMemo(() => positions.filter((p) => !p.hasLivePrice), [positions]);

  return {
    holdings,
    positions,
    marketValue: totals.marketValue,
    costBasis: totals.costBasis,
    unrealisedPnL: totals.unrealisedPnL,
    unrealisedPnLPct: totals.unrealisedPnLPct,
    dayPnL: totals.dayPnL,
    dayPnLPct: totals.dayPnLPct,
    winners,
    losers,
    flat,
    noPrice,
    hasAnyLivePrice: totals.hasAnyLivePrice,
    loading,
    error,
    refresh: load,
  };
}