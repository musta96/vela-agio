/**
 * Per-route <title> / meta description.
 *
 * Every route used to inherit the single index.html title
 * ("Vela.ai - Navigate every market"), which is bad for SEO, bad for browser
 * history and bad for screen readers. `RouteSEO` reads this map and emits a
 * unique title + description for each path. Pages that render their own <SEO>
 * component still win, because Helmet keeps the last-mounted value.
 */
export interface RouteMeta {
  title: string;
  description: string;
}

const SUFFIX = " | Vela.ai";

/** Exact-path entries. Dynamic routes are handled by `patterns` below. */
const EXACT: Record<string, RouteMeta> = {
  "/": {
    title: "Vela.ai — Navigate every market",
    description:
      "Market intelligence for everyone: real-time signals, AI research, portfolio analytics and backtesting across global equities, ETFs, crypto, FX and bonds.",
  },
  "/dashboard": {
    title: "Dashboard" + SUFFIX,
    description: "Your market briefing: portfolio moves, watchlist signals, macro events and AI highlights for today.",
  },
  "/explore": {
    title: "Explore markets" + SUFFIX,
    description: "Discover instruments across global equities, ETFs, crypto, FX and commodities with curated rails and screens.",
  },
  "/explore/themes": {
    title: "Investment themes" + SUFFIX,
    description: "Thematic baskets and the companies driving each structural trend, with exposure and performance breakdowns.",
  },
  "/portfolio": {
    title: "Portfolio" + SUFFIX,
    description: "Track holdings, allocation, performance and risk across every account in your base currency.",
  },
  "/portfolio-compare": {
    title: "Compare portfolios" + SUFFIX,
    description: "Compare a proposed portfolio against your existing one: return, risk, drawdown, overlap and factor exposure.",
  },
  "/net-worth": {
    title: "Net worth" + SUFFIX,
    description: "Consolidate cash, investments, property and other assets into one net-worth view with history.",
  },
  "/watchlist": {
    title: "Watchlist" + SUFFIX,
    description: "Monitor the instruments you care about with live quotes, signals and alerting.",
  },
  "/copilot": {
    title: "AI Copilot" + SUFFIX,
    description: "Ask Vela's AI analyst for research, screening, backtests, valuations and portfolio work in plain language.",
  },
  "/trading": {
    title: "Trading" + SUFFIX,
    description: "Paper trading, order history and your trade journal in one place, with realised and unrealised P&L.",
  },
  "/screener": {
    title: "Stock screener" + SUFFIX,
    description: "Screen global markets by fundamentals, technicals and natural-language constraints.",
  },
  "/ai-scanner": {
    title: "AI market scanner" + SUFFIX,
    description: "Describe what you are looking for and let Vela scan global markets for matching instruments.",
  },
  "/valuation": {
    title: "Valuation — DCF, DDM & comparables" + SUFFIX,
    description: "Value listed and private companies with DCF, DDM, ROIC/WACC and comparable-company analysis.",
  },
  "/full-analysis": {
    title: "Full analysis" + SUFFIX,
    description: "An orchestrated research run: evidence gathering, valuation, simulation, risk and a decision framework.",
  },
  "/advanced-analysis": {
    title: "Advanced analysis" + SUFFIX,
    description: "Advanced technical detectors, order-flow structure and multi-factor analytics for any instrument.",
  },
  "/technical": {
    title: "Technical analysis" + SUFFIX,
    description: "Trend, momentum, volatility and structure detectors with annotated charts and signal performance.",
  },
  "/backtest": {
    title: "Backtesting" + SUFFIX,
    description: "Backtest strategies on real historical data with transaction costs, slippage and walk-forward validation.",
  },
  "/strategy-lab": {
    title: "Strategy Lab" + SUFFIX,
    description: "Build, validate and compare rule-based strategies with versioning and out-of-sample testing.",
  },
  "/simulations": {
    title: "Portfolio simulations" + SUFFIX,
    description: "Monte Carlo, bootstrap and regime-switching simulations with VaR, CVaR and drawdown analysis.",
  },
  "/risk": {
    title: "Portfolio risk" + SUFFIX,
    description: "Stress tests, factor exposure, concentration and downside risk for your portfolio.",
  },
  "/optimizer": {
    title: "Portfolio optimizer" + SUFFIX,
    description: "Build efficient portfolios under return, risk, CVaR and drawdown constraints.",
  },
  "/rebalance": {
    title: "Rebalance" + SUFFIX,
    description: "Generate a rebalancing plan with drift, trade list and tax-aware options.",
  },
  "/quant": {
    title: "Quant alpha" + SUFFIX,
    description: "Factor research and quantitative alpha signals across global equity universes.",
  },
  "/macro": {
    title: "Macro dashboard" + SUFFIX,
    description: "Rates, inflation, growth and policy indicators with scenario context for portfolios.",
  },
  "/sectors": { title: "Sector heatmap" + SUFFIX, description: "Sector and industry performance heatmaps across regions and timeframes." },
  "/movers": { title: "Market movers" + SUFFIX, description: "Today's biggest gainers, losers and volume outliers across global markets." },
  "/sentiment": { title: "Market sentiment" + SUFFIX, description: "News, social and positioning sentiment signals for instruments and sectors." },
  "/earnings": { title: "Earnings calendar" + SUFFIX, description: "Upcoming earnings, estimates, surprises and post-earnings drift analysis." },
  "/filings": { title: "Filings analysis" + SUFFIX, description: "Parse filings and transcripts for risk factors, guidance and cited evidence." },
  "/insider": { title: "Insider transactions" + SUFFIX, description: "Insider buying and selling from official regulators across US, European and Asian markets." },
  "/research-analyst": { title: "AI equity research" + SUFFIX, description: "Institutional-style equity research notes generated from filings, transcripts and market data." },
  "/regulatory-analysis": { title: "Regulatory analysis" + SUFFIX, description: "Predictive analysis of regulation and policy change, with exposure by sector and issuer." },
  "/regional-markets": { title: "Regional markets" + SUFFIX, description: "Coverage of MENA, APAC, China, Japan, India, LatAm, Africa and Oceania markets." },
  "/options": { title: "Options chain" + SUFFIX, description: "Options chains, implied volatility and payoff analysis for listed derivatives." },
  "/futures": { title: "Futures" + SUFFIX, description: "Futures contracts, specifications, margin and roll analysis." },
  "/short-selling": { title: "Short selling" + SUFFIX, description: "Short ideas with borrow cost, squeeze risk and margin requirements." },
  "/bonds": { title: "Bond calculator" + SUFFIX, description: "Price, yield, duration and convexity for fixed-income instruments." },
  "/credit-spreads": { title: "Credit spreads" + SUFFIX, description: "Credit spread monitoring across issuers, ratings and regions." },
  "/etf-overlap": { title: "ETF overlap" + SUFFIX, description: "Measure holdings overlap and true diversification between funds." },
  "/buybacks": { title: "Buyback analyzer" + SUFFIX, description: "Assess buyback programmes, execution and shareholder yield." },
  "/dividends": { title: "Dividend planner" + SUFFIX, description: "Project dividend income, growth and coverage across your holdings." },
  "/replicate": { title: "Hedge fund replicator" + SUFFIX, description: "Replicate published hedge-fund exposures with liquid instruments." },
  "/peers": { title: "Peer comparison" + SUFFIX, description: "Compare companies against sector peers on valuation, growth and quality." },
  "/compare": { title: "Compare instruments" + SUFFIX, description: "Side-by-side comparison of price, fundamentals, risk and correlation." },
  "/related": { title: "Related instruments" + SUFFIX, description: "Find statistically and fundamentally related instruments." },
  "/baskets": { title: "Baskets" + SUFFIX, description: "Build and track custom instrument baskets." },
  "/picks": { title: "Smart picks" + SUFFIX, description: "Ranked ideas generated from Vela's signal and fundamental models." },
  "/dealflow": { title: "Deal flow" + SUFFIX, description: "M&A, IPO and corporate deal flow with screening and alerts." },
  "/corporate-actions": { title: "Corporate actions" + SUFFIX, description: "Splits, dividends, spin-offs and other corporate actions affecting your holdings." },
  "/event-study": { title: "Event study" + SUFFIX, description: "Measure abnormal returns around corporate and macro events." },
  "/intraday": { title: "Intraday" + SUFFIX, description: "Intraday price action, volume profile and event-driven analysis." },
  "/tax-harvest": { title: "Tax-loss harvesting" + SUFFIX, description: "Identify tax-loss harvesting opportunities and wash-sale risk." },
  "/budget": { title: "Budget" + SUFFIX, description: "Track income, spending and savings targets alongside your investments." },
  "/goals": { title: "Financial goals" + SUFFIX, description: "Set goals and track the probability of reaching them." },
  "/household": { title: "Household" + SUFFIX, description: "Consolidated household view across members and accounts." },
  "/alerts": { title: "Alerts" + SUFFIX, description: "Price, signal, filing and news alerts across your instruments." },
  "/notes": { title: "Research notes" + SUFFIX, description: "Your searchable, taggable research notes and shared write-ups." },
  "/documents": { title: "Documents" + SUFFIX, description: "Generated memos, reports and exports saved to your account." },
  "/methodology": { title: "Methodology" + SUFFIX, description: "How Vela builds signals, models, simulations and research outputs." },
  "/learn": { title: "Learn" + SUFFIX, description: "Guides and explainers on markets, instruments, risk and portfolio construction." },
  "/onboarding": { title: "Get started" + SUFFIX, description: "Set up your profile, portfolio and preferences in a few steps." },
  "/settings": { title: "Settings" + SUFFIX, description: "Manage preferences, language, currency, notifications and app behaviour." },
  "/profile": { title: "Profile" + SUFFIX, description: "Manage your account details and investor profile." },
  "/security": { title: "Security" + SUFFIX, description: "Sessions, devices, biometric unlock and account security settings." },
  "/privacy-settings": { title: "Privacy settings" + SUFFIX, description: "Control data sharing, analytics and personalisation." },
  "/suitability": { title: "Suitability" + SUFFIX, description: "Your investor suitability questionnaire and resulting constraints." },
  "/plans-billing": { title: "Plans & billing" + SUFFIX, description: "Your plan, entitlements, invoices and billing details." },
  "/upgrade": { title: "Upgrade" + SUFFIX, description: "Compare Vela plans and unlock advanced research and analytics." },
  "/pricing": { title: "Pricing" + SUFFIX, description: "Vela.ai plans and pricing for individuals, professionals and firms." },
  "/api": { title: "API documentation" + SUFFIX, description: "Programmatic access to Vela data, research and analytics." },
  "/agent-integrations": { title: "Agent integrations (MCP)" + SUFFIX, description: "Connect AI agents to Vela tools over MCP for research and backtesting." },
  "/ai-usage": { title: "AI usage" + SUFFIX, description: "Your AI question history, credits and monthly quota." },
  "/support": { title: "Support" + SUFFIX, description: "Get help, report a problem or contact the Vela team." },
  "/blog": { title: "Blog" + SUFFIX, description: "Research, market commentary and product updates from the Vela team." },
  "/features": { title: "Features" + SUFFIX, description: "Everything Vela.ai does: research, analytics, simulations, trading tools and AI." },
  "/contact-sales": { title: "Contact sales" + SUFFIX, description: "Talk to us about Enterprise, advisory seats and firm-wide deployments." },
  "/ios": { title: "Vela.ai for iPhone" + SUFFIX, description: "Vela.ai on iOS: your markets, portfolio and AI analyst on your phone." },
  "/install": { title: "Install Vela.ai" + SUFFIX, description: "Install Vela.ai on your phone or desktop for quick access." },
  "/auth": { title: "Sign in" + SUFFIX, description: "Sign in to your Vela.ai account." },
  "/enterprise/team": { title: "Team management" + SUFFIX, description: "Manage firm seats, roles and member access." },
  "/enterprise/dashboard": { title: "Firm dashboard" + SUFFIX, description: "Firm-wide view of clients, portfolios and activity." },
  "/enterprise/clients": { title: "Client portal" + SUFFIX, description: "Manage client access, mandates and shared reporting." },
};

/** Dynamic routes, matched in order. */
const PATTERNS: Array<{ test: RegExp; meta: (m: RegExpMatchArray) => RouteMeta }> = [
  {
    test: /^\/stock\/([^/]+)$/,
    meta: (m) => ({
      title: `${decodeURIComponent(m[1]).toUpperCase()} — quote, analysis & valuation${SUFFIX}`,
      description: `Live price, fundamentals, technicals, valuation (DCF/DDM), news and AI analysis for ${decodeURIComponent(m[1]).toUpperCase()}.`,
    }),
  },
  {
    test: /^\/options\/([^/]+)$/,
    meta: (m) => ({
      title: `${decodeURIComponent(m[1]).toUpperCase()} options chain${SUFFIX}`,
      description: `Options chain, implied volatility and payoff analysis for ${decodeURIComponent(m[1]).toUpperCase()}.`,
    }),
  },
  {
    test: /^\/blog\/([^/]+)$/,
    meta: () => ({ title: "Blog" + SUFFIX, description: "Research, market commentary and product updates from the Vela team." }),
  },
  {
    test: /^\/net-worth\/([^/]+)$/,
    meta: (m) => ({
      title: `${titleCase(m[1])} — net worth${SUFFIX}`,
      description: `Track your ${titleCase(m[1]).toLowerCase()} assets and their contribution to net worth.`,
    }),
  },
  {
    test: /^\/legal\/([^/]+)$/,
    meta: (m) => ({ title: `${titleCase(m[1])}${SUFFIX}`, description: `Vela.ai ${titleCase(m[1]).toLowerCase()} document.` }),
  },
  {
    test: /^\/owner(\/|$)/,
    meta: () => ({ title: "Owner console" + SUFFIX, description: "Internal Vela.ai administration console." }),
  },
  {
    test: /^\/admin(\/|$)/,
    meta: () => ({ title: "Administration" + SUFFIX, description: "Internal Vela.ai administration tools." }),
  },
];

function titleCase(slug: string) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Never returns null: unknown paths get a readable title derived from the slug. */
export function getRouteMeta(pathname: string): RouteMeta {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const exact = EXACT[path];
  if (exact) return exact;

  for (const p of PATTERNS) {
    const m = path.match(p.test);
    if (m) return p.meta(m);
  }

  const last = path.split("/").filter(Boolean).pop();
  if (!last) return EXACT["/"];
  return {
    title: `${titleCase(last)}${SUFFIX}`,
    description: `${titleCase(last)} on Vela.ai — market intelligence, research and portfolio analytics across global markets.`,
  };
}
