import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { LiveQuote } from "@/hooks/useLiveQuotes";
import { classifyInstrument, type InstrumentKind } from "@/lib/instrumentType";

export interface WatchInsight {
  symbol: string;
  kind: InstrumentKind;
  velaScore: number | null;
  velaGrade: string | null;
  riskScore: number | null;
  riskLabel: string | null;
  morningstar: number | null;
  category: string | null;
  loading: boolean;
}

export interface SnapshotPoint {
  capturedOn: string;
  price: number | null;
  velaScore: number | null;
  morningstar: number | null;
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

/**
 * Enriches watchlist rows with the proprietary Vela score / risk score and the
 * external Morningstar rating (ETFs & funds), and keeps a daily snapshot per
 * user so price, rating and score movements are visible over time.
 */
export function useWatchlistInsights(
  items: { symbol: string; name: string; type?: string | null }[],
  quotes: Record<string, LiveQuote>,
) {
  const { user } = useAuth();
  const [insights, setInsights] = useState<Record<string, WatchInsight>>({});
  const [history, setHistory] = useState<Record<string, SnapshotPoint[]>>({});
  const fetched = useRef<Set<string>>(new Set());
  const snapshotted = useRef<Set<string>>(new Set());

  const rows = useMemo(
    () => items.map((i) => ({
      ...i,
      kind: classifyInstrument(i.type ?? quotes[i.symbol]?.quoteType, i.symbol, i.name),
    })),
    [items, quotes],
  );

  // 1. Score/rating lookup for funds & ETFs (sequential, cached per symbol).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const row of rows) {
        if (cancelled) return;
        if (fetched.current.has(row.symbol)) continue;
        fetched.current.add(row.symbol);
        if (row.kind !== "etf" && row.kind !== "fund") {
          setInsights((p) => ({
            ...p,
            [row.symbol]: { symbol: row.symbol, kind: row.kind, velaScore: null, velaGrade: null, riskScore: null, riskLabel: null, morningstar: null, category: null, loading: false },
          }));
          continue;
        }
        setInsights((p) => ({
          ...p,
          [row.symbol]: { symbol: row.symbol, kind: row.kind, velaScore: null, velaGrade: null, riskScore: null, riskLabel: null, morningstar: null, category: null, loading: true },
        }));
        try {
          const { data } = await supabase.functions.invoke("fund-profile", { body: { symbol: row.symbol } });
          if (cancelled) return;
          setInsights((p) => ({
            ...p,
            [row.symbol]: {
              symbol: row.symbol,
              kind: row.kind,
              velaScore: data?.velaScore?.finalScore ?? null,
              velaGrade: data?.velaScore?.grade ?? null,
              riskScore: data?.velaScore?.riskScore ?? null,
              riskLabel: data?.velaScore?.riskLabel ?? null,
              morningstar: data?.ratings?.morningstarOverall ?? null,
              category: data?.ratings?.morningstarCategory ?? null,
              loading: false,
            },
          }));
        } catch {
          if (cancelled) return;
          setInsights((p) => ({
            ...p,
            [row.symbol]: { symbol: row.symbol, kind: row.kind, velaScore: null, velaGrade: null, riskScore: null, riskLabel: null, morningstar: null, category: null, loading: false },
          }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [rows]);

  // 2. Load stored history for the tracked symbols.
  const loadHistory = useCallback(async () => {
    if (!user || rows.length === 0) return;
    const { data } = await supabase
      .from("watchlist_snapshots")
      .select("symbol,captured_on,price,vela_score,morningstar_rating")
      .in("symbol", rows.map((r) => r.symbol))
      .order("captured_on", { ascending: true });
    if (!data) return;
    const grouped: Record<string, SnapshotPoint[]> = {};
    for (const r of data) {
      (grouped[r.symbol] ??= []).push({
        capturedOn: r.captured_on as string,
        price: r.price != null ? Number(r.price) : null,
        velaScore: r.vela_score != null ? Number(r.vela_score) : null,
        morningstar: r.morningstar_rating != null ? Number(r.morningstar_rating) : null,
      });
    }
    setHistory(grouped);
  }, [user, rows]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // 3. Record today's snapshot once per symbol per day.
  useEffect(() => {
    if (!user) return;
    const day = todayUtc();
    const pending = rows
      .filter((r) => quotes[r.symbol] && !snapshotted.current.has(`${r.symbol}:${day}`))
      .map((r) => {
        snapshotted.current.add(`${r.symbol}:${day}`);
        const ins = insights[r.symbol];
        const q = quotes[r.symbol];
        return {
          user_id: user.id,
          symbol: r.symbol,
          captured_on: day,
          price: q.price,
          currency: q.currency ?? null,
          change_pct: q.change ?? null,
          vela_score: ins?.velaScore ?? null,
          vela_risk_score: ins?.riskScore ?? null,
          morningstar_rating: ins?.morningstar ?? null,
          instrument_type: r.kind,
        };
      });
    if (!pending.length) return;
    void supabase
      .from("watchlist_snapshots")
      .upsert(pending, { onConflict: "user_id,symbol,captured_on" })
      .then(() => loadHistory());
  }, [user, rows, quotes, insights, loadHistory]);

  return { insights, history, rows, reloadHistory: loadHistory };
}
