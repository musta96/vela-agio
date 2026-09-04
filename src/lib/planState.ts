/**
 * planState — the single source of truth for "what plan is this user on?".
 *
 * Rule: `my_entitlements()` (exposed through `useEntitlements`) decides plan
 * identity, tier, features and AI access. The Stripe `subscriptions` row is
 * *only* used for billing metadata (renewal dates, portal access, invoices).
 * A user can hold a paid tier without a Stripe row (manual/owner-granted plan
 * or an environment mismatch), so no component may infer the plan from the
 * subscription row on its own.
 */

export type EntitlementSource = "subscription" | "beta" | "free" | "anonymous";

export interface EntitlementsLike {
  tier: string;
  planSlug: string | null;
  planName: string | null;
  featureKeys: Set<string>;
  betaActive: boolean;
  source: EntitlementSource;
  limits?: {
    maxPortfolios: number | null;
    maxPositionsPerPortfolio: number | null;
    maxWatchlist: number | null;
    maxAiQuestionsPerMonth: number | null;
  };
  loading?: boolean;
}

export interface SubscriptionLike {
  id: string;
  status: string;
  price_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  stripe_customer_id: string | null;
}

export interface PlanRowLike {
  id: string;
  slug: string | null;
  name: string;
  tier: string | null;
  monthly_price_cents: number | null;
  yearly_price_cents: number | null;
  ai_monthly_quota: number | null;
  stripe_monthly_price_id: string | null;
  stripe_yearly_price_id: string | null;
}

/** Feature keys that grant AI access. Any of them means AI is available. */
export const AI_FEATURE_KEYS = [
  "ai.copilot",
  "ai.unlimited_questions",
  "ai.research",
  "ai.reports",
];

export interface PlanState {
  loading: boolean;
  /** Canonical tier from my_entitlements (free | plus | pro | enterprise | …). */
  tier: string;
  planSlug: string | null;
  /** Display name: entitlement plan name, falling back to the catalog row. */
  planName: string;
  source: EntitlementSource;
  /** Paid tier of any origin (Stripe subscription or manually granted). */
  isPaid: boolean;
  /** Access comes only from the beta_tester role. */
  isBetaOnly: boolean;
  /** Paid plan *and* beta role — beta only adds features. */
  betaBonus: boolean;
  isFree: boolean;
  featureCount: number;
  has: (key: string) => boolean;
  /** AI availability derived from entitlements, never from a credit probe. */
  aiEnabled: boolean;
  aiQuestionsPerMonth: number | null;
  /** Catalog row matching the entitlement plan (for price/quota display). */
  planRow: PlanRowLike | null;
  /** Billing metadata — present only with a real Stripe subscription. */
  billing: {
    hasSubscription: boolean;
    hasStripeCustomer: boolean;
    status: string | null;
    renewsAt: string | null;
    startedAt: string | null;
    cancelAtPeriodEnd: boolean;
    cycle: "monthly" | "yearly" | null;
  };
}

function matchPlanRow(
  ent: EntitlementsLike,
  sub: SubscriptionLike | null,
  plans: PlanRowLike[],
): PlanRowLike | null {
  if (!plans.length) return null;
  const slug = (ent.planSlug ?? "").toLowerCase();
  const tier = (ent.tier ?? "").toLowerCase();
  return (
    plans.find((p) => (p.slug ?? "").toLowerCase() === slug && !!slug) ??
    plans.find((p) => (p.tier ?? "").toLowerCase() === tier && !!tier) ??
    (sub?.price_id
      ? plans.find((p) => p.stripe_monthly_price_id === sub.price_id || p.stripe_yearly_price_id === sub.price_id) ?? null
      : null)
  );
}

export function resolvePlanState(input: {
  ent: EntitlementsLike;
  sub: SubscriptionLike | null;
  plans: PlanRowLike[];
  loading?: boolean;
}): PlanState {
  const { ent, sub, plans } = input;
  const tier = (ent.tier || "free").toLowerCase();
  const isBetaOnly = ent.source === "beta";
  const isPaid = ent.source === "subscription" || (tier !== "free" && !isBetaOnly && ent.source !== "anonymous");
  const betaBonus = isPaid && ent.betaActive;
  const planRow = matchPlanRow(ent, sub, plans);

  const subActive = !!sub && ["active", "trialing", "past_due"].includes(sub.status);
  const aiQuestions = ent.limits?.maxAiQuestionsPerMonth ?? null;
  const aiEnabled =
    isBetaOnly ||
    AI_FEATURE_KEYS.some((k) => ent.featureKeys.has(k)) ||
    aiQuestions == null ||
    aiQuestions > 0;

  return {
    loading: !!input.loading || !!ent.loading,
    tier,
    planSlug: ent.planSlug ?? planRow?.slug ?? null,
    planName: ent.planName ?? planRow?.name ?? (isBetaOnly ? "Beta tester" : "Explorer (Free)"),
    source: ent.source,
    isPaid,
    isBetaOnly,
    betaBonus,
    isFree: !isPaid && !isBetaOnly,
    featureCount: ent.featureKeys.size,
    has: (key: string) => ent.featureKeys.has(key),
    aiEnabled,
    aiQuestionsPerMonth: aiQuestions,
    planRow,
    billing: {
      hasSubscription: subActive,
      hasStripeCustomer: !!sub?.stripe_customer_id,
      status: sub?.status ?? null,
      renewsAt: subActive ? sub!.current_period_end : null,
      startedAt: subActive ? sub!.current_period_start : null,
      cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
      cycle: sub?.price_id && planRow
        ? sub.price_id === planRow.stripe_yearly_price_id ? "yearly" : "monthly"
        : null,
    },
  };
}
