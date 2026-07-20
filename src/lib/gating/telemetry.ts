/**
 * Runtime telemetry for feature-gating anomalies.
 *
 * Currently records **gating mismatches** — situations where a rendered
 * route's `RouteFeatureGate feature=…` prop disagrees with the canonical
 * key registered for that pathname in `ROUTE_FEATURE_MAP`. These are the
 * "Deal flow copy showing on /simulations" class of bugs; we throw on
 * them in dev/test, but in production we want structured signal instead
 * of a hard crash.
 *
 * Design goals:
 *  - Zero required dependencies. The module is safe to import from any
 *    render path.
 *  - Deduplicated so a mismatched route re-render doesn't spam the sink.
 *  - Subscribable so tests (and real observability wiring) can inspect
 *    or forward events without patching `console`.
 */

export interface GatingMismatchEvent {
  pathname: string;
  /** Canonical feature key registered for `pathname` in ROUTE_FEATURE_MAP. */
  expectedFeature: string;
  /** Feature key actually passed to <RouteFeatureGate feature=…>. */
  receivedFeature: string;
  timestamp: number;
}

type Listener = (ev: GatingMismatchEvent) => void;

const listeners = new Set<Listener>();
const seen = new Map<string, number>();
const DEDUPE_MS = 60_000;
const RECENT_MAX = 50;
const recent: GatingMismatchEvent[] = [];

/** Subscribe to gating-mismatch events. Returns an unsubscribe function. */
export function onGatingMismatch(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Record a gating mismatch. Deduped per `(pathname, expected, received)`
 * key inside a 60s window so hot re-renders don't drown the sink.
 */
export function recordGatingMismatch(input: Omit<GatingMismatchEvent, "timestamp">): void {
  const key = `${input.pathname}|${input.expectedFeature}|${input.receivedFeature}`;
  const now = Date.now();
  const last = seen.get(key) ?? 0;
  if (now - last < DEDUPE_MS) return;
  seen.set(key, now);

  const event: GatingMismatchEvent = { ...input, timestamp: now };
  recent.push(event);
  if (recent.length > RECENT_MAX) recent.splice(0, recent.length - RECENT_MAX);

  // Fan out to listeners — never let a bad listener take down the caller.
  for (const l of listeners) {
    try { l(event); } catch { /* ignore */ }
  }

  // Structured console signal so production browsers still surface it.
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.error("[gating.mismatch]", event);
  }

  // Emit a DOM event so external observability wiring (Sentry breadcrumbs,
  // Datadog RUM actions, custom analytics) can subscribe without importing
  // this module.
  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    try {
      window.dispatchEvent(new CustomEvent("vela:gating-mismatch", { detail: event }));
    } catch { /* ignore */ }
  }
}

/** Read the recent (deduped) mismatch buffer. Useful for admin dashboards. */
export function getRecentGatingMismatches(): readonly GatingMismatchEvent[] {
  return recent.slice();
}

/** Test-only helper to reset dedupe + recent buffers between cases. */
export function __resetGatingTelemetryForTests(): void {
  seen.clear();
  recent.length = 0;
  listeners.clear();
}