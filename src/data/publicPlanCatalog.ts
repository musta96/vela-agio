import { PLAN_ORDER, type PlanSlug } from "@/lib/planFeatures";

/** Presentation only. Verified against active plans and access checks on 2026-11-05.
 * Never use this catalog to authorize requests or change entitlements.
 * AI uses ai_monthly_quota + ai_model_tier, not max_ai_questions_per_month.
 */
export const PUBLIC_PLAN_LIMITS = {
  explorer: { hostedAi: false, aiMonthlyQuota: 150, portfolios: 1, positions: 10, watchlist: 5 },
  plus: { hostedAi: true, aiMonthlyQuota: 500, portfolios: null, positions: null, watchlist: null },
  pro: { hostedAi: true, aiMonthlyQuota: 2000, portfolios: null, positions: null, watchlist: null },
  enterprise: { hostedAi: false, aiMonthlyQuota: -1, portfolios: null, positions: null, watchlist: null },
} satisfies Record<PlanSlug, { hostedAi: boolean; aiMonthlyQuota: number; portfolios: number | null; positions: number | null; watchlist: number | null }>;

export const PLAN_ACCESS_NOTE = "Standard plan access is shown below. Temporary AI beta access is currently active and can change. Beta-tester access and your own AI provider can also override standard limits. AI allowances are shared across hosted AI requests and reset each calendar month; they are not daily allowances. Market data timing depends on the source and exchange, not a guaranteed live feed.";

export function hostedAiAllowance(slug: PlanSlug): string {
  const plan = PUBLIC_PLAN_LIMITS[slug];
  if (!plan.hostedAi) return "Beta / own provider only";
  return `${plan.aiMonthlyQuota.toLocaleString("en-US")} requests / month`;
}

export type ComparisonCell = boolean | string;
type ComparisonRow = { label: string; hint?: string; values: Record<PlanSlug, ComparisonCell> };
const values = (get: (slug: PlanSlug) => ComparisonCell): Record<PlanSlug, ComparisonCell> =>
  Object.fromEntries(PLAN_ORDER.map(slug => [slug, get(slug)])) as Record<PlanSlug, ComparisonCell>;
const included = (...plans: PlanSlug[]) => values(slug => plans.includes(slug));
const all = () => values(() => true);
const paid: PlanSlug[] = ["plus", "pro", "enterprise"];
const advanced: PlanSlug[] = ["pro", "enterprise"];

export const PUBLIC_PLAN_COMPARISON: Array<{ category: string; rows: ComparisonRow[] }> = [
  { category: "Market data & research", rows: [
    { label: "Market data", hint: "Public quotes can be delayed. Paid plans include more frequent refresh, not guaranteed exchange-live streaming.", values: values(slug => slug === "explorer" ? "Public quotes" : "More frequent refresh") },
    { label: "Watchlist items", values: values(slug => PUBLIC_PLAN_LIMITS[slug].watchlist === null ? "No plan cap" : "5 items") },
    { label: "Screeners & filters", values: included(...paid) },
    { label: "Explore, movers & sector heatmaps", values: all() },
    { label: "Filings, earnings & insider feed", hint: "Availability follows the original source; no plan-specific filing delay is configured.", values: all() },
    { label: "Startup & private markets", hint: "Research pages are available on every plan. AI valuations require AI access; some registries require separate provider access.", values: all() },
    { label: "Options chains & futures pages", hint: "Public research pages; advanced options analytics are included with Pro and Enterprise.", values: all() },
    { label: "Backtesting engine", hint: "All paid plans include strategy previews, advanced backtests, trading costs and event tests.", values: included(...paid) },
    { label: "Strategy Lab & walk-forward", values: included(...paid) },
  ] },
  { category: "AI copilot", rows: [
    { label: "Hosted AI allowance", hint: "Explorer and Enterprise currently have no standard hosted AI model configured. Beta access or your own provider is separate.", values: values(hostedAiAllowance) },
    { label: "Deep research reports", hint: "Requires both the feature entitlement and available AI access.", values: included(...advanced) },
    { label: "Portfolio doctor", hint: "AI requests also require available AI access.", values: included(...advanced) },
    { label: "Sentiment dashboard", hint: "News and briefs are separate from the gated sentiment dashboard.", values: included(...advanced) },
  ] },
  { category: "Portfolio & analytics", rows: [
    { label: "Manual portfolio tracking", values: all() },
    { label: "Portfolio allowance", hint: "Configured plan limits; individual workflows may apply additional checks.", values: values(slug => PUBLIC_PLAN_LIMITS[slug].portfolios === null ? "No plan cap" : "1 portfolio / 10 positions") },
    { label: "Broker connect (read-only)", hint: "Available to signed-in users on every plan via SnapTrade, subject to broker support and provider setup.", values: all() },
    { label: "Net worth, goals & budget", values: all() },
    { label: "Dividend planner & paper trading", values: included(...paid) },
    { label: "Smart alerts (email)", values: included(...paid) },
    { label: "Push alert entitlement", hint: "Device permission and push-provider configuration are also required.", values: included(...advanced) },
    { label: "Filing alerts on your holdings", hint: "Checked periodically, not instant. Email entitlement starts with Plus; push entitlement starts with Pro.", values: included(...paid) },
    { label: "Privacy mode (hide amounts)", values: all() },
    { label: "iOS workspace", hint: "The same account and plan apply; App Store availability is separate.", values: all() },
    { label: "DCF / DDM tools", hint: "Valuation pages are available to all plans; AI-generated appraisals require AI access.", values: all() },
    { label: "Optimizer & rebalance planner", values: included(...advanced) },
    { label: "Portfolio simulations & correlation", values: included(...paid) },
    { label: "Risk stress tests, quant & event study", values: included(...advanced) },
    { label: "PDF export entitlement", values: included(...paid) },
    { label: "Tax-loss harvesting", values: included(...advanced) },
  ] },
  { category: "Team & compliance", rows: [
    { label: "Learn academy & methodology", values: all() },
    { label: "MiFID II compliance & advisor KIDs", values: included("enterprise") },
    { label: "Advisor seats & client portal", values: values(slug => slug === "enterprise" ? "3 seats included" : false) },
    { label: "REST API & bulk export", values: included("enterprise") },
    { label: "SSO, team management & advisor audit log", values: included("enterprise") },
  ] },
];

export const PUBLIC_PLAN_BULLETS: Record<PlanSlug, string[]> = {
  explorer: ["5 watchlist items", "Manual tracking: 1 portfolio, 10 positions", "Public market quotes, filings and education", "Read-only broker connections via SnapTrade", "AI during beta or with your own provider"],
  plus: ["Everything in Explorer, with no plan cap on watchlist items, portfolios or positions", "500 hosted AI requests per calendar month", "Strategy Lab, previews and full backtesting", "More frequent market data refresh", "Email alerts, including portfolio filings", "Screeners, paper trading, simulations and PDF export"],
  pro: ["Everything in Plus", "2,000 hosted AI requests per calendar month", "Backtesting, strategy previews and optimizer", "Deep research and sentiment dashboard", "Risk stress tests, tax tools and push alert entitlement"],
  enterprise: ["Pro feature entitlements, with separate AI availability", "Hosted AI currently requires beta access or your own provider", "3 advisor seats per firm; extra seats via sales", "Client portal, MiFID II compliance and advisor KIDs", "API, bulk export, SSO and team management"],
};

export const PLAN_FAQ = [
  { q: "Which plans include strategy and backtesting?", a: "Plus, Pro and Enterprise include Strategy Lab, strategy previews, walk-forward tests and advanced backtesting with trading costs and event tests. Explorer does not include these tools. Pro and Enterprise retain their separate optimizer and risk-tool entitlements." },
  { q: "How do Apple subscriptions work?", a: "The iPhone app supports Apple Pro subscriptions when available in your App Store. Apple shows the localized price before confirmation. Restore purchases with the original Vela account. Cancellation stops renewal and keeps access through the paid period; existing website subscriptions do not require a second purchase." },
  { q: "What are the AI limits?", a: "Plus includes 500 hosted AI requests per calendar month and Pro includes 2,000, shared across AI tools. Explorer and Enterprise currently have no standard hosted AI model configured, so hosted AI requires temporary beta access or your own provider. Daily allowances and unlimited hosted AI are not standard plan promises." },
  { q: "Does beta access change my plan?", a: "No. Temporary AI beta access can make AI available beyond standard plan limits. Beta-tester accounts can also have broader feature access. These exceptions do not change the standard plan comparison; your own AI provider has its own costs and limits." },
  { q: "Do I need to connect a brokerage?", a: "No. Track holdings manually or import CSV. Signed-in users on every plan can connect supported brokers read-only via SnapTrade, subject to provider setup and broker availability." },
  { q: "How much can I track?", a: "Explorer has a configured allowance of 1 portfolio, 10 positions per portfolio and 5 watchlist items. Plus, Pro and Enterprise have no configured plan cap on those items." },
];