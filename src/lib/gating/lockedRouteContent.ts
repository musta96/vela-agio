/**
 * Centralized marketing copy for locked-route upgrade screens.
 *
 * Non-engineers can tune headlines, benefits and CTAs per feature key
 * (and, when relevant, per required plan) without touching the
 * `RouteLockedScreen` component. Everything is optional — the screen
 * falls back to catalog metadata + generic copy when an entry is missing.
 *
 * Keys must match `feature_catalog.key` values (see
 * `src/lib/gating/routeFeatureMap.ts`).
 */

export interface LockedBenefit {
  icon?: "zap" | "trend" | "shield" | "spark" | "clock" | "star";
  title: string;
  body: string;
}

export interface LockedTestimonial {
  quote: string;
  author: string;
}

export interface LockedRouteCopy {
  /** Overrides the "Unlock {featureName}" hero title. */
  headline?: string;
  /** Overrides the catalog description under the hero. */
  subhead?: string;
  /** Overrides the primary CTA label. */
  primaryCta?: string;
  /** Overrides the "See what's inside" secondary CTA label. */
  secondaryCta?: string;
  /** Replaces the 3 benefit tiles when provided (exactly 3 recommended). */
  benefits?: LockedBenefit[];
  /** Replaces the sidebar testimonial. */
  testimonial?: LockedTestimonial;
  /** Small headline stat trio on the right card. */
  stats?: { value: string; label: string }[];
  /** Optional per-plan overrides — narrower than the feature default. */
  perPlan?: Partial<Record<string, Partial<LockedRouteCopy>>>;
}

/** Copy applied when no feature-specific entry exists. */
export const DEFAULT_LOCKED_COPY: Required<
  Pick<LockedRouteCopy, "benefits" | "testimonial" | "stats" | "primaryCta" | "secondaryCta">
> = {
  primaryCta: "Upgrade",
  secondaryCta: "See what's inside",
  benefits: [
    {
      icon: "zap",
      title: "Institutional depth",
      body: "Purpose-built quant models, event studies and risk engines usually reserved for desks.",
    },
    {
      icon: "trend",
      title: "Actionable in minutes",
      body: "Skip the setup — Vela wires your portfolio into the model and returns decisions, not homework.",
    },
    {
      icon: "shield",
      title: "Backed by your data",
      body: "Every recommendation is auditable, sourced, and grounded in your own holdings and tolerance.",
    },
  ],
  testimonial: {
    quote:
      "Vela turned three afternoons of spreadsheet work into a five-minute decision. The advanced analytics paid for the whole year on the first rebalance.",
    author: "Active investor, private beta",
  },
  stats: [
    { value: "5×", label: "Faster decisions" },
    { value: "24/7", label: "AI copilot" },
    { value: "0€", label: "Setup" },
  ],
};

/**
 * Per-feature-key overrides. Add entries here to tune messaging without
 * editing component code. Anything you omit is inherited from the default.
 */
export const LOCKED_ROUTE_COPY: Record<string, LockedRouteCopy> = {
  "portfolio.doctor": {
    headline: "Diagnose your portfolio in minutes",
    subhead:
      "An always-on advisor that pinpoints concentration, drawdown and tax drag — then hands you a fix.",
    benefits: [
      { icon: "shield", title: "Risk x-ray", body: "See hidden factor bets, correlation clusters and drawdown paths." },
      { icon: "trend", title: "Personalized fixes", body: "Concrete rebalance and hedge suggestions, ranked by impact." },
      { icon: "spark", title: "Second opinion", body: "AI-reviewed vs. your goals, horizon and tolerance." },
    ],
  },
  "tax.harvest": {
    headline: "Turn losses into refunds",
    subhead:
      "Automated wash-sale-safe tax-loss harvesting across every account, on your calendar.",
    benefits: [
      { icon: "zap", title: "Wash-sale safe", body: "Every candidate lot is screened against your other holdings." },
      { icon: "trend", title: "Higher after-tax returns", body: "Locked-in losses reduce this year's tax bill." },
      { icon: "shield", title: "Auditable", body: "Full trail of proposed and executed lots, ready to export." },
    ],
  },
  "portfolio.optimizer": {
    headline: "Efficient-frontier weights, without the spreadsheet",
    subhead: "Mean-variance, risk-parity and Black-Litterman — solved on your holdings.",
  },
  "portfolio.rebalance": {
    headline: "Rebalance without the arithmetic",
    subhead: "Turnkey trade lists that respect drift bands, tax lots and cash targets.",
  },
  "portfolio.stress_test": {
    headline: "Stress-test before the market does",
    subhead: "Rerun 2008, 2020, and custom shocks against your live portfolio.",
  },
  "portfolio.simulations": {
    headline: "See the distribution, not just the point estimate",
    subhead: "Monte Carlo, bootstrap and scenario analysis for your allocation.",
  },
  "quant.alpha": {
    headline: "Systematic edges, already engineered",
    subhead: "Factor scores, cross-sectional signals and regime-aware sleeves.",
  },
  "ai.sentiment": {
    headline: "Read the tape and the timeline",
    subhead: "News, filings and social sentiment merged into one score per name.",
  },
  "ai.backtests": {
    headline: "Backtest ideas at conversation speed",
    subhead: "Describe a strategy in English — get costs, slippage and walk-forward stats back.",
  },
  "strategy.proposal_builder": {
    headline: "Draft a strategy the desk would sign off on",
    subhead: "A guided builder that composes signals, sizing and risk into a testable strategy.",
  },
  "research.event_study": {
    headline: "Isolate the alpha around events",
    subhead: "Earnings, splits, guidance — measure the abnormal return your way.",
  },
  "enterprise.api": {
    headline: "Program against your portfolio",
    subhead: "Vela's data, models and workflows exposed as a first-class API.",
    primaryCta: "Talk to sales",
  },
  "dealflow.access": {
    headline: "A private pipeline for private opportunities",
    subhead: "Curated deal flow with underwriting, memos and IC-ready packets.",
  },
};

/** Resolve the effective copy for a `(featureKey, planSlug)` pair. */
export function resolveLockedCopy(
  featureKey: string,
  planSlug?: string | null,
): LockedRouteCopy {
  const base = LOCKED_ROUTE_COPY[featureKey] ?? {};
  const perPlan = planSlug ? base.perPlan?.[planSlug] ?? {} : {};
  return { ...base, ...perPlan };
}