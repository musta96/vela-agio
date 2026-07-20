import { ReactNode } from "react";
import { FeatureGate } from "@/components/FeatureGate";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { Skeleton } from "@/components/ui/skeleton";

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
