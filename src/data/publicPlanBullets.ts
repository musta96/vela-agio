import type { PlanSlug } from "@/lib/planFeatures";

/** Shared presentation copy; never used for authorization. */
export const PUBLIC_PLAN_BULLETS: Record<PlanSlug, string[]> = {
  explorer: ["5 watchlist items", "Manual tracking: 1 portfolio, 10 positions", "Public market quotes, filings and education", "Read-only broker connections via SnapTrade", "AI during beta or with your own provider"],
  plus: ["Everything in Explorer, with no plan cap on watchlist items, portfolios or positions", "500 hosted AI requests per calendar month", "Strategy Lab, previews and full backtesting", "More frequent market data refresh", "Email alerts, including portfolio filings", "Screeners, paper trading, simulations and PDF export"],
  pro: ["Everything in Plus", "2,000 hosted AI requests per calendar month", "Backtesting, strategy previews and optimizer", "Deep research and sentiment dashboard", "Risk stress tests, tax tools and push alert entitlement"],
  enterprise: ["Pro feature entitlements, with separate AI availability", "Hosted AI currently requires beta access or your own provider", "3 advisor seats per firm; extra seats via sales", "Client portal, MiFID II compliance and advisor KIDs", "API, bulk export, SSO and team management"],
};

