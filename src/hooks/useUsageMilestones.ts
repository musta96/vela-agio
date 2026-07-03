import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Lightweight usage counters used to trigger contextual onboarding hints.
 * Values are approximate — a small stale window is fine here because hints
 * are one-shot nudges, not gates.
 */
export type UsageMilestones = {
  loading: boolean;
  signalsRun: number;
  watchlistCount: number;
  portfolioCount: number;
};

export function useUsageMilestones(): UsageMilestones {
  const { user } = useAuth();
  const [state, setState] = useState<UsageMilestones>({
    loading: true,
    signalsRun: 0,
    watchlistCount: 0,
    portfolioCount: 0,
  });

  useEffect(() => {
    if (!user) {
      setState({ loading: false, signalsRun: 0, watchlistCount: 0, portfolioCount: 0 });
      return;
    }
    let cancelled = false;
    (async () => {
      const [signals, watchlist, portfolio] = await Promise.all([
        supabase
          .from("ai_event_log")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("event_type", "onboarding_signal_revealed"),
        supabase
          .from("watchlist_items")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("portfolio_holdings")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);
      if (cancelled) return;
      setState({
        loading: false,
        signalsRun: signals.count ?? 0,
        watchlistCount: watchlist.count ?? 0,
        portfolioCount: portfolio.count ?? 0,
      });
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return state;
}