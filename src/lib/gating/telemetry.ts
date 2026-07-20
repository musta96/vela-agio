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
const RECENT_MAX = 50;
const recent: GatingMismatchEvent[] = [];

/**
 * Runtime configuration. All values are tunable via
 * `configureGatingTelemetry` so tests can pin them deterministically and
 * production deploys can dial volume up or down without a code change.
 *
 *  - `dedupeMs`  — collapse identical `(pathname, expected, received)`
 *    tuples fired within this window into a single event. Protects against
 *    a mismatched route re-rendering hundreds of times per second.
 *  - `maxEventsPerWindow` / `rateWindowMs` — a fixed-window rate limit
 *    applied *after* dedupe. Even a large burst of distinct mismatches
 *    (e.g. every gated route leaking at once after a bad deploy) can't
 *    exceed this budget, so the sink stays useful.
 *  - `sampleRate` — probabilistic sampler in `[0, 1]`. `1` forwards
 *    everything that survives dedupe + rate limit; lower values keep the
 *    signal statistically representative while cutting volume further.
 *  - `random` — seam for deterministic sampling in tests.
 */
interface TelemetryConfig {
  dedupeMs: number;
  maxEventsPerWindow: number;
  rateWindowMs: number;
  sampleRate: number;
  random: () => number;
}
const DEFAULT_CONFIG: TelemetryConfig = {
  dedupeMs: 60_000,
  maxEventsPerWindow: 20,
  rateWindowMs: 60_000,
  sampleRate: 1,
  random: Math.random,
};
let config: TelemetryConfig = { ...DEFAULT_CONFIG };

let windowStart = 0;
let windowCount = 0;
/** Counters exposed for observability + tests. Total *records* attempted,
 * how many were suppressed by each stage, and how many finally emitted. */
const counters = {
  attempted: 0,
  suppressedByDedupe: 0,
  suppressedBySample: 0,
  suppressedByRateLimit: 0,
  emitted: 0,
};

/**
 * Override telemetry knobs at runtime. Pass a partial config; unspecified
 * fields retain their previous value. Call with no args (or reset via
 * `__resetGatingTelemetryForTests`) to return to defaults.
 */
export function configureGatingTelemetry(patch: Partial<TelemetryConfig>): void {
  config = { ...config, ...patch };
}

/** Read-only snapshot of internal counters — useful for admin dashboards
 * and load-test assertions. */
export function getGatingTelemetryCounters(): Readonly<typeof counters> {
  return { ...counters };
}

/** Subscribe to gating-mismatch events. Returns an unsubscribe function. */
export function onGatingMismatch(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Record a gating mismatch. The pipeline is:
 *
 *   attempt → dedupe → sampling → rate limit → emit
 *
 * Dedupe is the strongest filter (drops perfect repeats within
 * `dedupeMs`). Sampling then reduces surviving volume statistically.
 * Finally a fixed-window rate limit caps the absolute number of events
 * that can escape per window regardless of dedupe/sampling — the ceiling
 * that keeps the sink usable during an incident.
 */
export function recordGatingMismatch(input: Omit<GatingMismatchEvent, "timestamp">): void {
  counters.attempted += 1;
  const key = `${input.pathname}|${input.expectedFeature}|${input.receivedFeature}`;
  const now = Date.now();
  const last = seen.get(key) ?? 0;
  if (now - last < config.dedupeMs) {
    counters.suppressedByDedupe += 1;
    return;
  }
  seen.set(key, now);

  // Probabilistic sampler. `1` is a fast path so tests without a seeded
  // RNG stay deterministic.
  if (config.sampleRate < 1 && config.random() >= config.sampleRate) {
    counters.suppressedBySample += 1;
    return;
  }

  // Fixed-window rate limit. Reset the window lazily on the first event
  // that arrives after `rateWindowMs` has elapsed since the window began.
  if (now - windowStart >= config.rateWindowMs) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= config.maxEventsPerWindow) {
    counters.suppressedByRateLimit += 1;
    return;
  }
  windowCount += 1;
  counters.emitted += 1;

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
  windowStart = 0;
  windowCount = 0;
  counters.attempted = 0;
  counters.suppressedByDedupe = 0;
  counters.suppressedBySample = 0;
  counters.suppressedByRateLimit = 0;
  counters.emitted = 0;
  config = { ...DEFAULT_CONFIG };
}