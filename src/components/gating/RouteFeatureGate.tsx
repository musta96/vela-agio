import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { FeatureGate } from "@/components/FeatureGate";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { Skeleton } from "@/components/ui/skeleton";
import { featureForPath } from "@/lib/gating/routeFeatureMap";

interface Props {
  /** Feature key from feature_catalog. */
  feature: string;
  children: ReactNode;
}

/**
 * Page-level wrapper around <FeatureGate> for use in App.tsx routes.
 *
 * FAIL CLOSED: if the feature key is missing from feature_catalog (e.g. code
 * deployed before the catalog migration), the route stays locked and shows
 * the upgrade card. This is the safer default — a missing catalog entry
 * must never accidentally hand out a paid feature. Run `bun run check:gating`
 * to catch coverage gaps before merging.
 */
export function RouteFeatureGate({ feature, children }: Props) {
  const gate = useFeatureGate();
  const location = useLocation();

  // ------------------------------------------------------------------
  // Runtime sanity check: the `feature` prop MUST match the canonical
  // feature key registered for the current pathname. This catches the
  // class of bug where a paste-mistake in App.tsx wires (e.g.)
  // `/simulations` to `dealflow.access` and the upgrade card starts
  // showing "Deal flow · Unlocks on Enterprise" on the Simulations page.
  //
  // Behaviour:
  //   - In DEV / test: throw. A mismatch is a coding bug; failing loud
  //     surfaces it in unit tests and dev builds immediately.
  //   - In prod: log an error and let the render continue with the
  //     provided `feature` prop (metadata is still strictly derived
  //     from that prop, so the user never sees another feature's copy).
  // ------------------------------------------------------------------
  const expected = featureForPath(location.pathname);
  if (expected && expected !== feature) {
    const msg =
      `[RouteFeatureGate] mismatch at "${location.pathname}": ` +
      `expected feature key "${expected}" (from ROUTE_FEATURE_MAP) ` +
      `but got "${feature}". Fix the <RouteFeatureGate feature=…> in App.tsx ` +
      `or update src/lib/gating/routeFeatureMap.ts.`;
    if (import.meta.env.DEV || import.meta.env.MODE === "test") {
      throw new Error(msg);
    }
    // eslint-disable-next-line no-console
    console.error(msg);
  }

  // While entitlements/catalog are still loading, render a consistent
  // skeleton rather than flashing either the page or the upgrade card.
  // Once loaded, the decision (unlocked, locked, or fail-closed missing key)
  // is stable.
  if (gate.entitlements.loading || gate.catalog.length === 0) {
    return <RouteFeatureGateSkeleton />;
  }

  const keyKnown = gate.catalog.some((c) => c.key === feature);
  if (!keyKnown && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[RouteFeatureGate] feature key "${feature}" missing from feature_catalog — locking route (fail closed). Add it in a migration.`,
    );
  }

  const unlocked = keyKnown && gate.has(feature);
  if (unlocked) return <>{children}</>;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <FeatureGate feature={feature}>{children}</FeatureGate>
      </div>
    </div>
  );
}

function RouteFeatureGateSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Checking access…"
      className="min-h-[70vh] flex items-center justify-center px-6 py-16"
    >
      <div className="w-full max-w-md space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
        <div className="pt-4">
          <Skeleton className="h-10 w-40" />
        </div>
        <span className="sr-only">Checking access…</span>
      </div>
    </div>
  );
}

export default RouteFeatureGate;
