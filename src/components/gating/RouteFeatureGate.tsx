import { ReactNode } from "react";
import { FeatureGate } from "@/components/FeatureGate";
import { useFeatureGate } from "@/hooks/useFeatureGate";

interface Props {
  /** Feature key from feature_catalog. */
  feature: string;
  children: ReactNode;
}

/**
 * Page-level wrapper around <FeatureGate> for use in App.tsx routes.
 *
 * Fails open when `feature` is not present in the loaded feature_catalog:
 * a key that exists in code but not yet in the DB must never lock a page
 * for every user (e.g. deploy lands before the catalog migration runs).
 */
export function RouteFeatureGate({ feature, children }: Props) {
  const gate = useFeatureGate();

  const catalogLoaded = gate.catalog.length > 0;
  const keyUnknown = catalogLoaded && !gate.catalog.some((c) => c.key === feature);
  if (keyUnknown) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[RouteFeatureGate] feature key "${feature}" missing from feature_catalog — rendering unlocked`);
    }
    return <>{children}</>;
  }

  const unlocked = !gate.entitlements.loading && gate.has(feature);
  if (unlocked) return <>{children}</>;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <FeatureGate feature={feature}>{children}</FeatureGate>
      </div>
    </div>
  );
}

export default RouteFeatureGate;
