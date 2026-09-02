/**
 * Canonical mapping of gated routes → feature keys.
 *
 * Single source of truth for the "what feature does this path require?"
 * question. Used by:
 *
 *  - `RouteFeatureGate` as a runtime sanity check to detect cross-page
 *    leakage (e.g. `dealflow.access` metadata rendering on `/simulations`).
 *  - Automated tests that enumerate Pro-gated routes without duplicating
 *    the list.
 *
 * Keep in sync with `App.tsx`. The `check:gating` script also enforces
 * that every entry here has a matching `feature_catalog` row.
 */
export const ROUTE_FEATURE_MAP: Record<string, string> = {
  "/sentiment": "ai.sentiment",
  "/backtest": "ai.backtests",
  "/strategy-lab": "strategy.proposal_builder",
  "/risk": "portfolio.stress_test",
  "/simulations": "portfolio.simulations",
  "/event-study": "research.event_study",
  "/tax-harvest": "tax.harvest",
  "/api": "enterprise.api",
  "/optimizer": "portfolio.optimizer",
  "/rebalance": "portfolio.rebalance",
  "/quant": "quant.alpha",
  "/dealflow": "dealflow.access",
  "/advisor": "portfolio.doctor",
  "/enterprise/team": "enterprise.team_management",
};

/** Return the canonical feature key for a pathname, or `null` when the
 * route is not gated. Matches on exact path first, then falls back to
 * `startsWith` so nested URLs (e.g. `/rebalance/plan/123`) still resolve. */
export function featureForPath(pathname: string): string | null {
  if (pathname in ROUTE_FEATURE_MAP) return ROUTE_FEATURE_MAP[pathname];
  for (const [route, key] of Object.entries(ROUTE_FEATURE_MAP)) {
    if (pathname.startsWith(route + "/")) return key;
  }
  return null;
}

/**
 * Feature-scoped metadata used to render the upgrade card.
 *
 * IMPORTANT: this helper is pure and must derive every field strictly
 * from the `feature` argument. It is the single point where the upgrade
 * card resolves its name/description/target-plan, so any bug that would
 * cause one page (e.g. `/simulations`) to render another feature's
 * copy (e.g. Deal Flow's) has to originate here — which makes it easy
 * to unit-test against cross-page leakage.
 */
export interface CatalogEntry {
  key: string;
  name?: string | null;
  description?: string | null;
}
export interface PlanEntry {
  slug?: string | null;
  name?: string | null;
  price_label?: string | null;
  feature_keys?: string[] | null;
}
export interface GateMeta {
  feature: string;
  name: string;
  description: string | null;
  targetPlan: {
    slug: string | null;
    name: string | null;
    priceLabel: string | null;
  } | null;
}

export function deriveGateMeta(
  feature: string,
  catalog: readonly CatalogEntry[],
  plans: readonly PlanEntry[],
): GateMeta {
  const entry = catalog.find((c) => c.key === feature) ?? null;
  const plan = plans.find((p) => (p.feature_keys ?? []).includes(feature)) ?? null;
  return {
    feature,
    name: entry?.name ?? "Premium feature",
    description: entry?.description ?? null,
    targetPlan: plan
      ? { slug: plan.slug ?? null, name: plan.name ?? null, priceLabel: plan.price_label ?? null }
      : null,
  };
}