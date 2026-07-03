import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Entitlements = {
  tier: string;          // 'free' | 'plus' | 'pro' | 'elite' | 'advisor' | 'enterprise'
  planSlug: string | null;
  planName: string | null;
  featureKeys: Set<string>;
  /** True when the signed-in user has the `beta_tester` role. Beta access
   *  only *adds* feature keys on top of any paid subscription — it never
   *  downgrades the user's real plan. */
  betaActive: boolean;
  /** Where the entitlement comes from: 'subscription' (paid), 'beta'
   *  (beta role with no paid sub), 'free' (no sub, no role), or 'anonymous'. */
  source: "subscription" | "beta" | "free" | "anonymous";
  /** Numeric caps for the current plan. `null` means unlimited. */
  limits: {
    maxPortfolios: number | null;
    maxPositionsPerPortfolio: number | null;
    maxWatchlist: number | null;
    maxAiQuestionsPerMonth: number | null;
  };
};

const EMPTY: Entitlements = {
  tier: "free", planSlug: null, planName: null, featureKeys: new Set(),
  betaActive: false, source: "free",
  limits: { maxPortfolios: 1, maxPositionsPerPortfolio: 10, maxWatchlist: 5, maxAiQuestionsPerMonth: 5 },
};

const CACHE_KEY = "vela.entitlements.v1";
const CACHE_TTL_MS = 5 * 60_000; // 5 min — refreshed in background anyway

type CachedShape = {
  userId: string;
  ts: number;
  tier: string;
  planSlug: string | null;
  planName: string | null;
  featureKeys: string[];
  betaActive?: boolean;
  source?: Entitlements["source"];
  limits?: Entitlements["limits"];
};

function readCache(userId: string): Entitlements | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedShape;
    if (parsed.userId !== userId) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return {
      tier: parsed.tier,
      planSlug: parsed.planSlug,
      planName: parsed.planName,
      featureKeys: new Set(parsed.featureKeys),
      betaActive: !!parsed.betaActive,
      source: parsed.source ?? "free",
      limits: parsed.limits ?? EMPTY.limits,
    };
  } catch { return null; }
}

function writeCache(userId: string, ent: Entitlements) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        userId, ts: Date.now(),
        tier: ent.tier, planSlug: ent.planSlug, planName: ent.planName,
        featureKeys: Array.from(ent.featureKeys),
          betaActive: ent.betaActive, source: ent.source,
          limits: ent.limits,
      } satisfies CachedShape),
    );
  } catch { /* noop */ }
}

/**
 * Returns the signed-in user's effective tier + the set of feature keys
 * unlocked by their currently-active subscription plan. Falls back to
 * the `free` tier with no feature_keys when there is no active sub.
 * Hydrates synchronously from sessionStorage so route changes don't flicker.
 */
export function useEntitlements() {
  const { user } = useAuth();
  // Hydrate from cache on first render so <FeatureGate> doesn't flash.
  const initialUserId = user?.id ?? null;
  const initial = initialUserId ? readCache(initialUserId) : null;
  const [ent, setEnt] = useState<Entitlements>(initial ?? EMPTY);
  const [loading, setLoading] = useState(!initial);
  const hydratedFromCache = useRef(!!initial);

  const refresh = useCallback(async () => {
    if (!user) { setEnt(EMPTY); setLoading(false); return; }
    if (!hydratedFromCache.current) setLoading(true);
    try {
      const { data, error } = await supabase.rpc("my_entitlements");
      if (error) throw error;
      const row = (data as any[])?.[0];
      const next: Entitlements = row
        ? {
            tier: row.tier ?? "free",
            planSlug: row.plan_slug ?? null,
            planName: row.plan_name ?? null,
            featureKeys: new Set<string>(row.feature_keys ?? []),
            betaActive: !!row.beta_active,
            source: (row.source as Entitlements["source"]) ?? "free",
            limits: {
              maxPortfolios: row.max_portfolios ?? null,
              maxPositionsPerPortfolio: row.max_positions_per_portfolio ?? null,
              maxWatchlist: row.max_watchlist ?? null,
              maxAiQuestionsPerMonth: row.max_ai_questions_per_month ?? null,
            },
          }
        : EMPTY;
      setEnt(next);
      writeCache(user.id, next);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[useEntitlements] failed", e);
      // Keep cached value rather than blanking the UI on transient errors.
      if (!hydratedFromCache.current) setEnt(EMPTY);
    } finally {
      setLoading(false);
      hydratedFromCache.current = false;
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Refresh on subscription changes (webhook → realtime).
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`ent-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  const has = useCallback((key: string) => ent.featureKeys.has(key), [ent]);
  return { ...ent, loading, refresh, has };
}