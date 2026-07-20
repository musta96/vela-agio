/**
 * PLAN_FEATURES — single source of truth for tier entitlements.
 *
 * The runtime source of entitlements is the DB (`subscription_plans`, resolved
 * through `useEntitlements` / `has_role`). This map mirrors the same catalog
 * so the UI can render the pricing table, run client-side gates, and answer
 * "which tier unlocks feature X?" without re-hitting the network.
 *
 * Copy rules (see brand voice): sentence case, no em dashes, avoid the words
 * "unlock", "leverage", "navigate".
 */

export type PlanSlug = "explorer" | "plus" | "pro" | "enterprise";

export type PlanFeatures = {
  ai_questions_per_day: number | null; // null = unlimited
  live_data: boolean;
  portfolio_sync: boolean;
  alerts: boolean;
  backtesting: boolean;
  compliance_tools: boolean;
  report_export: boolean;
  api_access: boolean;
  advisor_seats: number; // 0 = no advisor seats
};

export type PlanDefinition = {
  slug: PlanSlug;
  name: string;
  audience: string;
  priceMonthly: number; // euros per month, billed monthly
  priceAnnualMonthly: number; // euros per month equivalent when billed annually
  priceAnnualTotal: number; // euros charged once per year
  cta: string;
  ctaHref: string;
  highlighted?: boolean;
  contactSales?: boolean;
  /**
   * Marks the free "Explorer" fallback tier. Upgrade.tsx uses this to render
   * the free-tier CTA without hardcoding the "explorer" slug. Exactly one
   * plan in PLAN_FEATURES should carry this flag.
   */
  explorer?: boolean;
  features: PlanFeatures;
  /** Marketing checklist shown on the pricing card. */
  featureList: string[];
  /** Stripe lookup keys, present only for self-serve paid tiers. */
  lookupKey?: { monthly: string; annual: string };
};

export const PLAN_FEATURES: Record<PlanSlug, PlanDefinition> = {
  explorer: {
    slug: "explorer",
    name: "Explorer",
    audience: "For curious investors getting started",
    priceMonthly: 0,
    priceAnnualMonthly: 0,
    priceAnnualTotal: 0,
    cta: "Start free",
    ctaHref: "/auth",
    explorer: true,
    features: {
      ai_questions_per_day: 5,
      live_data: false,
      portfolio_sync: false,
      alerts: false,
      backtesting: false,
      compliance_tools: false,
      report_export: false,
      api_access: false,
      advisor_seats: 0,
    },
    featureList: [
      "Watchlist",
      "Basic stock and ETF pages with delayed market data",
      "Limited AI research: 5 questions per day",
      "Educational content and the blog",
      "No portfolio sync, no live data, no alerts",
    ],
  },
  plus: {
    slug: "plus",
    name: "Plus",
    audience: "For active retail investors",
    priceMonthly: 12,
    priceAnnualMonthly: 9,
    priceAnnualTotal: 108,
    cta: "Choose Plus",
    ctaHref: "/plans",
    features: {
      ai_questions_per_day: 100,
      live_data: true,
      portfolio_sync: true,
      alerts: true,
      backtesting: false,
      compliance_tools: false,
      report_export: false,
      api_access: false,
      advisor_seats: 0,
    },
    featureList: [
      "Everything in Explorer",
      "Live EU and US market data",
      "Portfolio tracking with read-only broker connect (Plaid / SnapTrade)",
      "Generous AI research: 100 questions per day",
      "Sentiment and news summaries",
      "Smart alerts on price, signal and events",
    ],
    lookupKey: { monthly: "plus_monthly", annual: "plus_annual" },
  },
  pro: {
    slug: "pro",
    name: "Pro",
    audience: "For serious investors and analysts",
    priceMonthly: 29,
    priceAnnualMonthly: 24,
    priceAnnualTotal: 288,
    cta: "Choose Pro",
    ctaHref: "/plans",
    highlighted: true,
    features: {
      ai_questions_per_day: null,
      live_data: true,
      portfolio_sync: true,
      alerts: true,
      backtesting: true,
      compliance_tools: true,
      report_export: true,
      api_access: false,
      advisor_seats: 0,
    },
    featureList: [
      "Everything in Plus",
      "Backtesting and portfolio optimizer",
      "MiFID II suitability checks and KID handling",
      "Research report generation and PDF export",
      "Tax and performance reports",
      "Priority AI with higher limits and a faster model",
    ],
    lookupKey: { monthly: "pro_monthly", annual: "pro_annual" },
  },
  enterprise: {
    slug: "enterprise",
    name: "Enterprise",
    audience: "For advisor teams and firms",
    priceMonthly: 149,
    priceAnnualMonthly: 125,
    priceAnnualTotal: 1500,
    cta: "Contact sales",
    ctaHref: "/contact-sales?source=pricing_enterprise",
    contactSales: true,
    features: {
      ai_questions_per_day: null,
      live_data: true,
      portfolio_sync: true,
      alerts: true,
      backtesting: true,
      compliance_tools: true,
      report_export: true,
      api_access: true,
      advisor_seats: 3,
    },
    featureList: [
      "Everything in Pro",
      "Multi-client advisor seats (3 included, add more)",
      "Client-ready compliance and suitability documents",
      "Bulk export and team management",
      "API access",
      "Priority support",
    ],
  },
};

export const PLAN_ORDER: PlanSlug[] = ["explorer", "plus", "pro", "enterprise"];

/** Ordered list, useful for iteration in tables/cards. */
export const PLAN_LIST: PlanDefinition[] = PLAN_ORDER.map((s) => PLAN_FEATURES[s]);

/** Lowest tier that satisfies a given feature predicate — powers upgrade prompts. */
export function requiredTierFor(
  predicate: (f: PlanFeatures) => boolean,
): PlanSlug | null {
  for (const slug of PLAN_ORDER) {
    if (predicate(PLAN_FEATURES[slug].features)) return slug;
  }
  return null;
}

/** True when `current` includes at least what `required` provides. */
export function tierAtLeast(current: PlanSlug, required: PlanSlug): boolean {
  return PLAN_ORDER.indexOf(current) >= PLAN_ORDER.indexOf(required);
}

/** Normalize any legacy plan slug to one of the four current tiers. */
export function normalizePlanSlug(input: string | null | undefined): PlanSlug {
  const s = (input ?? "").toLowerCase();
  if (s === "plus") return "plus";
  if (s === "pro") return "pro";
  if (s === "enterprise" || s === "advisor" || s === "elite") return "enterprise";
  return "explorer";
}