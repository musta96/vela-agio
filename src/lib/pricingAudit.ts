/**
 * Pricing / upgrade CTA audit — the canonical registry of every "upgrade"
 * entry point in the app, plus helpers that map (plan slug, cadence) to
 * the exact Stripe price lookup key that must be sent to `create-checkout`.
 *
 * `src/components/__tests__/pricingAudit.test.tsx` walks this registry
 * to guarantee no rogue links go to `/upgrade`, `/plans-billing`, or the
 * wrong price id — every upgrade path routes to `/pricing`.
 */

import { PLAN_FEATURES, type PlanSlug } from "@/lib/planFeatures";

export type UpgradeCadence = "monthly" | "annual";

export const UPGRADE_ROUTE = "/pricing" as const;

/**
 * Every registered upgrade entry point in the app. When adding a new
 * "Upgrade" surface, add it here. The audit test asserts each surface
 * resolves to `UPGRADE_ROUTE` (or opens the shared UpgradeModal).
 */
export type UpgradeEntry = {
  id: string;
  /** Where the CTA lives — for humans reading test failures. */
  location: string;
  /** Whether it navigates to `/pricing` or opens the shared modal in-place. */
  kind: "route" | "modal";
  /** For "route" entries: the URL the CTA points at. Must equal UPGRADE_ROUTE. */
  href?: string;
};

export const AUDIT_UPGRADE_ENTRIES: UpgradeEntry[] = [
  { id: "sidebar-plans-billing", location: "AppSidebar → Plans & billing", kind: "route", href: "/plans-billing" },
  { id: "ai-credits-badge",      location: "AiCreditsBadge", kind: "route", href: UPGRADE_ROUTE },
  { id: "ai-briefing",           location: "AIBriefing paywall", kind: "route", href: UPGRADE_ROUTE },
  { id: "copilot-out-of-credits",location: "CopilotChat empty credits", kind: "route", href: UPGRADE_ROUTE },
  { id: "feature-gate",          location: "FeatureGate hard lock", kind: "route", href: UPGRADE_ROUTE },
  { id: "locked-preview",        location: "LockedPreview CTA", kind: "route", href: UPGRADE_ROUTE },
  { id: "limit-reached",         location: "LimitReachedCTA", kind: "route", href: UPGRADE_ROUTE },
  { id: "ai-access-card",        location: "Settings → AIAccessCard", kind: "route", href: UPGRADE_ROUTE },
  { id: "past-due-banner",       location: "PastDueBanner", kind: "route", href: UPGRADE_ROUTE },
  { id: "settings-usage",        location: "Settings usage card", kind: "route", href: UPGRADE_ROUTE },
  { id: "features-page",         location: "Features → footer CTA", kind: "route", href: UPGRADE_ROUTE },
  { id: "ai-usage-history",      location: "AiUsageHistory paused notice", kind: "route", href: UPGRADE_ROUTE },
  { id: "feature-gate-modal",    location: "FeatureGate inline modal", kind: "modal" },
  { id: "upgrade-dialog",        location: "UpgradeDialog contextual paywall", kind: "modal" },
];

/** Resolve the Stripe price lookup key for a (slug, cadence) pair. */
export function getExpectedPriceId(slug: PlanSlug, cadence: UpgradeCadence): string | null {
  const def = PLAN_FEATURES[slug];
  if (!def.lookupKey) return null;
  return def.lookupKey[cadence];
}

/**
 * Snapshot of every self-serve tier and its price ids across cadences —
 * the audit test asserts against this to catch silent drift in
 * `PLAN_FEATURES`.
 */
export const PRICE_ID_SNAPSHOT: Record<string, { monthly: string | null; annual: string | null }> = {
  explorer:   { monthly: getExpectedPriceId("explorer", "monthly"),   annual: getExpectedPriceId("explorer", "annual") },
  plus:       { monthly: getExpectedPriceId("plus", "monthly"),       annual: getExpectedPriceId("plus", "annual") },
  pro:        { monthly: getExpectedPriceId("pro", "monthly"),        annual: getExpectedPriceId("pro", "annual") },
  enterprise: { monthly: getExpectedPriceId("enterprise", "monthly"), annual: getExpectedPriceId("enterprise", "annual") },
};

/** True when a URL string points at a legacy upgrade destination. */
export function isLegacyUpgradeRoute(href: string): boolean {
  const clean = href.split("?")[0].split("#")[0];
  return clean === "/upgrade";
}