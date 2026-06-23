import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Entitlements = {
  tier: string;          // 'free' | 'plus' | 'pro' | 'elite' | 'advisor' | 'enterprise'
  planSlug: string | null;
  planName: string | null;
  featureKeys: Set<string>;
};

const EMPTY: Entitlements = { tier: "free", planSlug: null, planName: null, featureKeys: new Set() };

/**
 * Returns the signed-in user's effective tier + the set of feature keys
 * unlocked by their currently-active subscription plan. Falls back to
 * the `free` tier with no feature_keys when there is no active sub.
 */
export function useEntitlements() {
  const { user } = useAuth();
  const [ent, setEnt] = useState<Entitlements>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setEnt(EMPTY); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("my_entitlements");
      if (error) throw error;
      const row = (data as any[])?.[0];
      setEnt(
        row
          ? {
              tier: row.tier ?? "free",
              planSlug: row.plan_slug ?? null,
              planName: row.plan_name ?? null,
              featureKeys: new Set<string>(row.feature_keys ?? []),
            }
          : EMPTY,
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[useEntitlements] failed", e);
      setEnt(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Refresh on subscription changes (webhook → realtime).
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`ent-${user.id}`)
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