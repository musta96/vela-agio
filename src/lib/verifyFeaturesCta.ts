/**
 * Dev-time guard: scans the DOM for links pointing to /features and warns
 * if any of them are missing the analytics binding contract
 * (data-track="landing_features_cta_click"). This lets us catch new CTAs
 * added over time that forgot to wire the tracker.
 *
 * Safe in production (no throw) — just logs a console.warn when a CTA is
 * unbound so QA/telemetry pipelines flag the drift.
 */
export function verifyFeaturesCtaBindings(scopeLabel = "unknown") {
  if (typeof document === "undefined") return;
  // Defer to after paint so React has committed the tree.
  requestAnimationFrame(() => {
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        'a[href="/features"], a[href$="/features"]'
      )
    );
    const missing = links.filter(
      (el) => el.getAttribute("data-track") !== "landing_features_cta_click"
    );
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[features-cta] ${missing.length} "/features" CTA(s) in "${scopeLabel}" are missing analytics binding ` +
          `(expected data-track="landing_features_cta_click"). Elements:`,
        missing
      );
    }
  });
}