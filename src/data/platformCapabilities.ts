/**
 * platformCapabilities — parity source of truth between the marketing
 * landing page and the in-app plan comparison matrix.
 *
 * Each entry pairs one "user-visible capability" with:
 *   - landingTitle     : must match a card in the Landing Features grid
 *                        (`DEFAULT_SECTIONS.features.items[].title`).
 *   - matrixRowLabel   : must match a row in the plan comparison matrix
 *                        in `src/pages/Features.tsx` (COMPARISON_RAW).
 *   - route            : optional in-app destination for integration tests.
 *   - featureKey       : optional feature_catalog key for gating tests —
 *                        MUST agree with `ROUTE_FEATURE_MAP` when both are
 *                        set (asserted by tests).
 *
 * Add a capability here first, then implement the landing card and
 * matrix row. CI parity tests will fail loudly if any side drifts.
 */

export type PlatformCapability = {
  id: string;
  landingTitle: string;
  matrixRowLabel: string;
  route?: string;
  featureKey?: string;
};

export const PLATFORM_CAPABILITIES: PlatformCapability[] = [
  { id: "ai-copilot",            landingTitle: "AI Research Copilot",                     matrixRowLabel: "AI summaries",                        route: "/copilot" },
  { id: "ai-radar",              landingTitle: "AI Radar & Idea Lab",                     matrixRowLabel: "AI Radar & Idea Lab",                 route: "/radar" },
  { id: "live-markets",          landingTitle: "Live Markets & Charts",                   matrixRowLabel: "Market data" },
  { id: "explore-movers",        landingTitle: "Explore, Movers & Sectors",               matrixRowLabel: "Explore, movers & sector heatmaps",   route: "/explore" },
  { id: "options-futures",       landingTitle: "Options & Futures",                       matrixRowLabel: "Options chains & futures curves",     route: "/options" },
  { id: "filings-earnings",      landingTitle: "Filings, Earnings & Insider",             matrixRowLabel: "Filings, earnings & insider feed",    route: "/filings" },
  { id: "sentiment-news",        landingTitle: "Sentiment & News",                        matrixRowLabel: "Sentiment & news engine",             route: "/sentiment",     featureKey: "ai.sentiment" },
  { id: "portfolio-orders",      landingTitle: "Portfolio & Orders",                      matrixRowLabel: "Manual portfolio tracking",           route: "/portfolio" },
  { id: "networth",              landingTitle: "Net Worth & Household",                   matrixRowLabel: "Net worth & household tracking" },
  { id: "goals-budget",          landingTitle: "Goals, Budget & Dividend Planner",        matrixRowLabel: "Goals, budget & dividend planner",    route: "/goals" },
  { id: "portfolio-coach",       landingTitle: "Portfolio Coach & Advisor",               matrixRowLabel: "Portfolio doctor",                    route: "/advisor",       featureKey: "portfolio.doctor" },
  { id: "backtesting",           landingTitle: "Backtesting & Strategy Lab",              matrixRowLabel: "Backtesting engine",                  route: "/backtest",      featureKey: "ai.backtests" },
  { id: "optimizer-rebalance",   landingTitle: "Optimizer & Rebalance",                   matrixRowLabel: "Optimizer & rebalance planner",       route: "/optimizer",     featureKey: "portfolio.optimizer" },
  { id: "risk-simulations",      landingTitle: "Risk Engine & Simulations",               matrixRowLabel: "Risk analytics (VaR / Monte Carlo)",  route: "/risk",          featureKey: "portfolio.stress_test" },
  { id: "quant-event-study",     landingTitle: "Quant Alpha & Event Study",               matrixRowLabel: "Quant Alpha, event study & 13F",      route: "/quant",         featureKey: "quant.alpha" },
  { id: "alerts",                landingTitle: "Smart Alerts & Signals",                  matrixRowLabel: "Smart alerts (price, signal, events)", route: "/alerts" },
  { id: "tax-reports",           landingTitle: "Tax, Reports & Corp. Actions",            matrixRowLabel: "Tax-loss harvesting & PDF reports",   route: "/tax-harvest",   featureKey: "tax.harvest" },
  { id: "mifid",                 landingTitle: "Suitability & MiFID II",                  matrixRowLabel: "Advisor seats & MiFID II" },
  { id: "dealflow",              landingTitle: "Deal Flow & Related Graph",               matrixRowLabel: "Advisor seats & MiFID II",            route: "/dealflow",      featureKey: "dealflow.access" },
  { id: "learn",                 landingTitle: "Learn, Methodology & Onboarding",         matrixRowLabel: "Learn academy & methodology",         route: "/learn" },
  { id: "mcp-api",               landingTitle: "Agent Integrations (MCP) & API",          matrixRowLabel: "Agent integrations (MCP)",            route: "/api",           featureKey: "enterprise.api" },
  { id: "security",              landingTitle: "Security, Privacy & Audit",               matrixRowLabel: "SSO & audit logs" },
];

export const LANDING_FEATURES_GRID_COUNT = 22;
