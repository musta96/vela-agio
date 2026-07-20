/**
 * Single source of truth for "new" feature badges shown in the sidebar.
 *
 * - Register a feature by URL + the date it launched.
 * - Only the N most recently added, still-fresh entries are surfaced.
 * - Anything older than TTL days auto-expires and no longer renders,
 *   even if it's still in the registry.
 *
 * To highlight a new feature: add one entry to NEW_BADGE_REGISTRY.
 * No component code needs to change.
 */

export const NEW_BADGE_MAX = 3;
export const NEW_BADGE_TTL_DAYS = 45;

type BadgeEntry = {
  /** Route the badge belongs to. Must match the sidebar item's `url`. */
  url: string;
  /** ISO date (YYYY-MM-DD) when the feature was launched. */
  addedAt: string;
};

// Ordered newest-first by intent; the resolver re-sorts defensively.
export const NEW_BADGE_REGISTRY: BadgeEntry[] = [
  { url: "/strategy-lab", addedAt: "2026-07-10" },
  { url: "/dividends", addedAt: "2026-07-05" },
  { url: "/ai-scanner", addedAt: "2026-07-01" },
];

export function getActiveNewBadgeUrls(now: Date = new Date()): Set<string> {
  const ttlMs = NEW_BADGE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = now.getTime() - ttlMs;
  const fresh = NEW_BADGE_REGISTRY
    .filter((e) => {
      const t = new Date(e.addedAt).getTime();
      return Number.isFinite(t) && t >= cutoff && t <= now.getTime();
    })
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
    .slice(0, NEW_BADGE_MAX);
  return new Set(fresh.map((e) => e.url));
}