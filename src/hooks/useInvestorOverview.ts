import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { usePortfolios } from "./usePortfolios";
import { usePortfolio, type PositionMetrics } from "./usePortfolio";
import { useLiveQuotes } from "./useLiveQuotes";

export interface CashRow {
  cash: number;
  starting_cash: number;
  currency: string;
}

export interface TradeRow {
  id: string;
  symbol: string;
  name: string | null;
  side: string;
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  executed_at: string;
  notes: string | null;
}

export interface PaperPosition {
  symbol: string;
  name: string;
  qty: number;
  costBasis: number;
  avgPrice: number;
  livePrice: number | null;
  marketValue: number;
  unrealisedPnL: number;
  unrealisedPnLPct: number | null;
  currency: string;
}

/**
 * One reconciled investor view for the active portfolio:
 *   holdings (real book) + paper positions + cash + P&L.
 *
 * Subscribes to realtime changes on `paper_trades`, `paper_cash` and
 * `portfolio_holdings`, so the numbers move the moment a trade is placed —
 * from this tab, another tab, or the native app.
 */
export function useInvestorOverview() {
  const { user } = useAuth();
  const { active, activeId, primary } = usePortfolios();
  const portfolioId = activeId ?? primary?.id ?? null;
  const book = usePortfolio();

  const [cash, setCash] = useState<CashRow | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loadingCash, setLoadingCash] = useState(false);

  const loadCashAndTrades = useCallback(async () => {
    if (!user || !portfolioId) {
      setCash(null);
      setTrades([]);
      return;
    }
    setLoadingCash(true);
    const [{ data: cashRow }, { data: tradeRows }] = await Promise.all([
      (supabase as any).from("paper_cash").select("cash,starting_cash,currency").eq("portfolio_id", portfolioId).maybeSingle(),
      (supabase as any)
        .from("paper_trades")
        .select("id,symbol,name,side,quantity,price,fees,currency,executed_at,notes")
        .eq("portfolio_id", portfolioId)
        .order("executed_at", { ascending: false })
        .limit(200),
    ]);
    setCash((cashRow as CashRow) ?? null);
    setTrades((tradeRows as TradeRow[]) ?? []);
    setLoadingCash(false);
  }, [user?.id, portfolioId]);

  useEffect(() => { void loadCashAndTrades(); }, [loadCashAndTrades]);

  // Live wiring: any insert/update on trades, cash or holdings re-pulls the view.
  useEffect(() => {
    if (!user || !portfolioId) return;
    const channel = supabase
      .channel(`investor-overview-${portfolioId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "paper_trades", filter: `portfolio_id=eq.${portfolioId}` }, () => {
        void loadCashAndTrades();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "paper_cash", filter: `portfolio_id=eq.${portfolioId}` }, () => {
        void loadCashAndTrades();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "portfolio_holdings", filter: `portfolio_id=eq.${portfolioId}` }, () => {
        void book.refresh();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // book.refresh is stable per portfolio; intentionally excluded to avoid resubscribe loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, portfolioId, loadCashAndTrades]);

  // Paper positions derived from the trade tape (oldest → newest).
  const paperRaw = useMemo(() => {
    const map = new Map<string, { symbol: string; name: string; qty: number; cost: number; currency: string }>();
    for (const t of [...trades].reverse()) {
      const cur = map.get(t.symbol) || { symbol: t.symbol, name: t.name || t.symbol, qty: 0, cost: 0, currency: t.currency };
      if (t.side === "buy") {
        cur.cost += t.quantity * t.price;
        cur.qty += t.quantity;
      } else {
        if (cur.qty > 0) cur.cost -= (cur.cost / cur.qty) * Math.min(cur.qty, t.quantity);
        cur.qty -= t.quantity;
      }
      map.set(t.symbol, cur);
    }
    return Array.from(map.values()).filter((p) => Math.abs(p.qty) > 1e-9);
  }, [trades]);

  const paperSymbols = useMemo(() => paperRaw.map((p) => p.symbol), [paperRaw]);
  const { quotes } = useLiveQuotes(paperSymbols, 30_000);

  const paperPositions = useMemo<PaperPosition[]>(
    () =>
      paperRaw.map((p) => {
        const q = quotes[p.symbol]?.price;
        const livePrice = q != null && Number.isFinite(q) && q > 0 ? Number(q) : null;
        const price = livePrice ?? (p.qty !== 0 ? p.cost / p.qty : 0);
        const marketValue = price * p.qty;
        const unrealisedPnL = marketValue - p.cost;
        return {
          symbol: p.symbol,
          name: p.name,
          qty: p.qty,
          costBasis: p.cost,
          avgPrice: p.qty !== 0 ? p.cost / p.qty : 0,
          livePrice,
          marketValue,
          unrealisedPnL,
          unrealisedPnLPct: p.cost > 0 ? (unrealisedPnL / p.cost) * 100 : null,
          currency: p.currency,
        };
      }),
    [paperRaw, quotes],
  );

  const cashBalance = cash?.cash ?? 0;
  const startingCash = cash?.starting_cash ?? 0;
  const paperValue = paperPositions.reduce((s, p) => s + p.marketValue, 0);
  const paperCost = paperPositions.reduce((s, p) => s + p.costBasis, 0);
  const paperPnL = paperValue - paperCost;

  const investedValue = book.marketValue + paperValue;
  const totalValue = investedValue + cashBalance;
  const totalCost = book.costBasis + paperCost;
  const unrealisedPnL = book.unrealisedPnL + paperPnL;
  const unrealisedPnLPct = totalCost > 0 ? (unrealisedPnL / totalCost) * 100 : 0;

  const currency = active?.base_currency || cash?.currency || "EUR";

  return {
    portfolio: active,
    currency,
    positions: book.positions as PositionMetrics[],
    paperPositions,
    trades,
    cashBalance,
    startingCash,
    hasCashAccount: !!cash,
    investedValue,
    totalValue,
    totalCost,
    unrealisedPnL,
    unrealisedPnLPct,
    dayPnL: book.dayPnL,
    dayPnLPct: book.dayPnLPct,
    cashWeight: totalValue > 0 ? (cashBalance / totalValue) * 100 : 0,
    loading: book.loading || loadingCash,
    error: book.error,
    refresh: async () => {
      await Promise.all([book.refresh(), loadCashAndTrades()]);
    },
  };
}
