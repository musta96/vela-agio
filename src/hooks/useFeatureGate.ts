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

export type PlanRow = {
  slug: string;
  name: string;
  sort_order: number;
  feature_keys: string[];
  price_label?: string | null;
  price_period?: string | null;
  monthly_price_cents?: number | null;
  yearly_price_cents?: number | null;
};

let _catalogCache: FeatureCatalogRow[] | null = null;
let _plansCache: PlanRow[] | null = null;
const _catalogListeners = new Set<() => void>();

/** Force every mounted hook instance to drop & refetch its catalog cache. */
export function invalidateFeatureCatalogCache() {
  _catalogCache = null;
  _plansCache = null;
  _catalogListeners.forEach((fn) => fn());
}

const BLOCK_LOG_DEDUPE_MS = 5 * 60_000;
const _blockSeen = new Map<string, number>();

async function logBlock(args: {
  featureKey: string;
  tier: string;
  planSlug: string | null;
}) {
  // Per-session dedupe so navigating in/out of a page doesn't spam the log.
  const now = Date.now();
  const last = _blockSeen.get(args.featureKey) ?? 0;
  if (now - last < BLOCK_LOG_DEDUPE_MS) return;
  _blockSeen.set(args.featureKey, now);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("feature_gate_blocks").insert({
      user_id: user.id,
      feature_key: args.featureKey,
      current_tier: args.tier,
      current_plan_slug: args.planSlug,
      page_path: typeof window !== "undefined" ? window.location.pathname : null,
    });
  } catch {
    // best-effort
  }
}

/**
 * Combines the feature catalog, the user's entitlements, and a shared
 * upgrade-prompt state. Components call `require(featureKey)` before
 * doing something gated — if the user lacks access we surface the
 * upgrade dialog (rendered by <UpgradeDialog />).
 */
export function useFeatureGate() {
  const entitlements = useEntitlements();
  const [catalog, setCatalog] = useState<FeatureCatalogRow[]>(_catalogCache ?? []);
  const [plans, setPlans] = useState<PlanRow[]>(_plansCache ?? []);
  const [prompt, setPrompt] = useState<UpgradePromptState>({ open: false });

  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      setCatalog(_catalogCache ?? []);
      setPlans(_plansCache ?? []);
    };
    _catalogListeners.add(reload);
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
          .select("slug,name,sort_order,feature_keys,price_label,price_period,monthly_price_cents,yearly_price_cents")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        _plansCache = (data as any[]) ?? [];
      }
      if (cancelled) return;
      setCatalog(_catalogCache!);
      setPlans(_plansCache!);
    })();
    return () => { cancelled = true; _catalogListeners.delete(reload); };
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
    // Audit: user was blocked from this feature.
    void logBlock({
      featureKey: key,
      tier: entitlements.tier,
      planSlug: entitlements.planSlug,
    });
    setPrompt({
      open: true,
      featureKey: key,
      featureName: meta?.name,
      featureDescription: meta?.description ?? undefined,
      requiredPlanName: target?.name ?? null,
      requiredPlanSlug: target?.slug ?? null,
      requiredPlanPrice: target?.price_label ?? (target?.monthly_price_cents != null
        ? `€${Math.round((target.monthly_price_cents || 0) / 100)}/mo`
        : null),
      currentPlanName: entitlements.planName,
      currentTier: entitlements.tier,
    });
  }, [catalog, lowestPlanFor, entitlements.planName, entitlements.tier, entitlements.planSlug]);

  /** Returns true if the user can use the feature; otherwise opens the upgrade dialog and returns false. */
  const require = useCallback((key: string) => {
    if (entitlements.featureKeys.has(key)) return true;
    promptUpgrade(key);
    return false;
  }, [entitlements.featureKeys, promptUpgrade]);

  return { entitlements, catalog, plans, has, require, promptUpgrade, prompt, setPrompt };
}