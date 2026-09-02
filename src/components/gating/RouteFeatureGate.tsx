import { Component, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { Skeleton } from "@/components/ui/skeleton";
import { featureForPath } from "@/lib/gating/routeFeatureMap";
import { recordGatingMismatch } from "@/lib/gating/telemetry";
import { RouteLockedScreen } from "@/components/gating/RouteLockedScreen";

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
  return (
    <RouteFeatureGateErrorBoundary>
      <RouteFeatureGateInner feature={feature}>{children}</RouteFeatureGateInner>
    </RouteFeatureGateErrorBoundary>
  );
}

function RouteFeatureGateInner({ feature, children }: Props) {
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
  //   - Always: record structured telemetry via `recordGatingMismatch`
  //     so observability wiring can monitor cross-page leakage in prod.
  //   - In DEV / test: throw. A mismatch is a coding bug; failing loud
  //     surfaces it in unit tests and dev builds immediately. The
  //     surrounding <RouteFeatureGateErrorBoundary> in prod turns the
  //     throw into a friendly fallback instead of a white screen — but
  //     in dev/test the throw is still visible via test frameworks.
  //   - In prod: after recording telemetry, we render a safe fallback
  //     UI ("Access check unavailable") rather than continuing with a
  //     possibly-wrong feature key. This is a superset of the previous
  //     behaviour (which continued rendering silently).
  // ------------------------------------------------------------------
  const expected = featureForPath(location.pathname);
  if (expected && expected !== feature) {
    recordGatingMismatch({
      pathname: location.pathname,
      expectedFeature: expected,
      receivedFeature: feature,
    });
    const msg =
      `[RouteFeatureGate] mismatch at "${location.pathname}": ` +
      `expected feature key "${expected}" (from ROUTE_FEATURE_MAP) ` +
      `but got "${feature}". Fix the <RouteFeatureGate feature=…> in App.tsx ` +
      `or update src/lib/gating/routeFeatureMap.ts.`;
    if (import.meta.env.DEV || import.meta.env.MODE === "test") {
      throw new Error(msg);
    }
    return <RouteFeatureGateFallback reason="mismatch" />;
  }

  // Ungated routes do not need entitlement or catalog data. This also keeps
  // shared wrappers usable on ordinary pages when the catalog is unavailable.
  if (!expected) return <>{children}</>;

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

  // Route-level lock: render a full marketing-style upgrade screen instead
  // of a small inline card. The user reached this page intentionally
  // (sidebar navigation now lets locked items through), so we owe them a
  // real explanation of what's behind the paywall and a first-class CTA.
  return <RouteLockedScreen feature={feature} />;
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

/**
 * User-facing fallback shown when the gate cannot make a safe decision
 * (e.g. an internal invariant failed at runtime in production). This
 * intentionally does NOT reveal internal diagnostics — the details are
 * captured by telemetry — and gives the user a clear, non-technical
 * recovery path.
 */
export function RouteFeatureGateFallback({ reason }: { reason?: string }) {
  return (
    <div
      role="alert"
      className="min-h-[70vh] flex items-center justify-center px-6 py-16"
      data-gate-fallback={reason ?? "error"}
    >
      <div className="w-full max-w-md space-y-4 text-center">
        <h2 className="text-xl font-semibold">This page is temporarily unavailable</h2>
        <p className="text-sm text-muted-foreground">
          We couldn’t verify access to this feature. Please refresh the page or
          head back to your dashboard while we look into it.
        </p>
        <div className="flex items-center justify-center gap-2 pt-2">
          <a
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Go to dashboard
          </a>
          <button
            type="button"
            onClick={() => { if (typeof window !== "undefined") window.location.reload(); }}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Error boundary that turns any unexpected render error inside the gate
 * (including the sanity-check throw when it escapes in production edge
 * paths, or a downstream `<FeatureGate>` crash) into a friendly fallback
 * instead of a white screen.
 *
 * In dev/test we intentionally re-throw so tests can still assert the
 * exact error via `expect(() => render(...)).toThrow(...)`.
 */
class RouteFeatureGateErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    // Structured signal — telemetry for the mismatch case is already
    // recorded before the throw; this covers other unexpected errors.
    // eslint-disable-next-line no-console
    console.error("[RouteFeatureGate] render error", error);
    if (import.meta.env.DEV || import.meta.env.MODE === "test") {
      // Re-surface for test frameworks / dev overlay.
      throw error as Error;
    }
  }
  render() {
    if (this.state.hasError) return <RouteFeatureGateFallback reason="error" />;
    return this.props.children;
  }
}

export default RouteFeatureGate;
