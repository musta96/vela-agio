import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlements } from "@/hooks/useEntitlements";
import type { UpgradePromptState } from "@/components/UpgradeDialog";

export type FeatureCatalogRow = {
  key: string;
  name: string;
  description: string | null;
  category: string;
  sort_order: number;
};

let _catalogCache: FeatureCatalogRow[] | null = null;
let _plansCache: { slug: string; name: string; sort_order: number; feature_keys: string[] }[] | null = null;

/**
 * Combines the feature catalog, the user's entitlements, and a shared
 * upgrade-prompt state. Components call `require(featureKey)` before
 * doing something gated — if the user lacks access we surface the
 * upgrade dialog (rendered by <UpgradeDialog />).
 */
export function useFeatureGate() {
  const entitlements = useEntitlements();
  const [catalog, setCatalog] = useState<FeatureCatalogRow[]>(_catalogCache ?? []);
  const [plans, setPlans] = useState(_plansCache ?? []);
  const [prompt, setPrompt] = useState<UpgradePromptState>({ open: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!_catalogCache) {
        const { data } = await supabase
          .from("feature_catalog")
          .select("key,name,description,category,sort_order")
          .order("sort_order", { ascending: true });
        _catalogCache = (data as any[]) ?? [];
      }
      if (!_plansCache) {
        const { data } = await supabase
          .from("subscription_plans")
          .select("slug,name,sort_order,feature_keys")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        _plansCache = (data as any[]) ?? [];
      }
      if (cancelled) return;
      setCatalog(_catalogCache!);
      setPlans(_plansCache!);
    })();
    return () => { cancelled = true; };
  }, []);

  const has = useCallback(
    (key: string) => entitlements.featureKeys.has(key),
    [entitlements.featureKeys],
  );

  /** Find the cheapest active plan that unlocks `key`. */
  const lowestPlanFor = useCallback((key: string) => {
    return plans.find(p => (p.feature_keys ?? []).includes(key)) ?? null;
  }, [plans]);

  const promptUpgrade = useCallback((key: string) => {
    const meta = catalog.find(c => c.key === key);
    const target = lowestPlanFor(key);
    setPrompt({
      open: true,
      featureKey: key,
      featureName: meta?.name,
      featureDescription: meta?.description ?? undefined,
      requiredPlanName: target?.name ?? null,
      requiredPlanSlug: target?.slug ?? null,
      currentPlanName: entitlements.planName,
    });
  }, [catalog, lowestPlanFor, entitlements.planName]);

  /** Returns true if the user can use the feature; otherwise opens the upgrade dialog and returns false. */
  const require = useCallback((key: string) => {
    if (entitlements.featureKeys.has(key)) return true;
    promptUpgrade(key);
    return false;
  }, [entitlements.featureKeys, promptUpgrade]);

  return { entitlements, catalog, plans, has, require, promptUpgrade, prompt, setPrompt };
}