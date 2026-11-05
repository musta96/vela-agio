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
  /**
   * How the headline price is charged. `per_account` = one subscription for the
   * whole workspace/firm (seats included in the price); `per_seat` = the price
   * multiplies by the number of seats. Every surface that shows a price must
   * render it through `formatPlanPrice` / `planPriceCaption` so the model can
   * never drift between pages.
   */
  billingModel: "per_account" | "per_seat";
  /** Seats bundled into the headline price (per_account plans). */
  seatsIncluded?: number;
  /** How extra seats are obtained when the bundle is exhausted. */
  extraSeats?: "contact_sales" | "self_serve" | "none";
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
    billingModel: "per_account",
    seatsIncluded: 1,
    extraSeats: "none",
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
    billingModel: "per_account",
    seatsIncluded: 1,
    extraSeats: "none",
    features: {
      ai_questions_per_day: 100,
      live_data: true,
      portfolio_sync: true,
      alerts: true,
      backtesting: true,
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
    billingModel: "per_account",
    seatsIncluded: 1,
    extraSeats: "none",
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
    cta: "Choose Enterprise",
    ctaHref: "/upgrade?plan=enterprise",
    // Enterprise is billed once per firm, not per seat: €149/month includes
    // 3 advisor seats. Additional seats are handled by sales.
    billingModel: "per_account",
    seatsIncluded: 3,
    extraSeats: "contact_sales",
    contactSales: false,
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
      "3 advisor seats included in the firm subscription (extra seats via sales)",
      "Team management with seat invitations",
      "Client-ready compliance and suitability documents",
      "Bulk export",
      "API access",
      "Priority support",
    ],
    lookupKey: { monthly: "enterprise_monthly", annual: "enterprise_annual" },
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
// ---------------------------------------------------------------------------
// Price rendering — the only place prices become strings.
// ---------------------------------------------------------------------------

/** Headline price, e.g. "€149/mo" or "Free". */
export function formatPlanPrice(
  plan: PlanDefinition,
  cycle: "monthly" | "annual" = "monthly",
): string {
  const value = cycle === "annual" ? plan.priceAnnualMonthly : plan.priceMonthly;
  if (value === 0) return "Free";
  return `\u20ac${value}/mo`;
}

/**
 * The line that must always sit next to the headline price so the billing
 * model is unambiguous ("per seat" vs "per firm, N seats included").
 */
export function planPriceCaption(plan: PlanDefinition): string {
  if (plan.priceMonthly === 0) return "Free forever";
  if (plan.billingModel === "per_seat") return "per seat / month";
  const seats = plan.seatsIncluded ?? 1;
  if (seats > 1) {
    return plan.extraSeats === "contact_sales"
      ? `per firm / month · ${seats} seats included, extra seats via sales`
      : `per firm / month · ${seats} seats included`;
  }
  return "per user / month";
}
