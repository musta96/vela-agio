import {
  Brain, LineChart, PieChart, Target, Activity, Bell, Shield, FileText,
  Users, Building2, Zap, BarChart3, Lock, BookOpen, Sparkles, Globe, Star, TrendingUp,
  UserPlus, Link2, Rocket, Wallet, FlaskConical, Newspaper, ShieldCheck, Receipt, Repeat,
  Smartphone,
} from "lucide-react";

export const ICONS: Record<string, any> = {
  Brain, LineChart, PieChart, Target, Activity, Bell, Shield, FileText,
  Users, Building2, Zap, BarChart3, Lock, BookOpen, Sparkles, Globe, Star, TrendingUp,
  UserPlus, Link2, Rocket, Wallet, FlaskConical, Newspaper, ShieldCheck, Receipt, Repeat,
  Smartphone,
};

export type LandingSectionRow = {
  id?: string;
  key: string;
  kind: string;
  sort_order: number;
  enabled: boolean;
  content: any;
};

// Default content blocks - used when the DB has no rows for that key.
// Editing these in the Owner Console writes overrides to the landing_sections table.
export const DEFAULT_SECTIONS: LandingSectionRow[] = [
  {
    key: "hero", kind: "hero", sort_order: 10, enabled: true,
    content: {
      eyebrow: "New: AI Portfolio Coach",
      title: "Research markets like a pro.",
      titleAccent: "Without becoming one.",
      subtitle: "Vela.ai is an educational research platform for FTSE MIB, European and US markets. AI copilot, portfolio coach, optimizer and compliance tools - built for individual investors and professionals alike.",
      primaryCta: { label: "Start free", href: "/auth" },
      secondaryCta: { label: "See features", href: "/features" },
      note: "No credit card. Free forever plan. Cancel anytime.",
      trust: [
        { icon: "Lock", label: "GDPR & EU-hosted" },
        { icon: "Shield", label: "MiFID II ready" },
        { icon: "Globe", label: "CONSOB & SEC filings" },
        { icon: "Smartphone", label: "Web & iOS" },
      ],
    },
  },
  {
    key: "stats", kind: "stats", sort_order: 20, enabled: true,
    content: { items: [
      { k: "8 000+", v: "Instruments covered" },
      { k: "20 yrs", v: "Historical backtests" },
      { k: "<150 ms", v: "AI response latency" },
      { k: "100 %", v: "Educational - never advice" },
    ]},
  },
  {
    key: "features", kind: "features", sort_order: 30, enabled: true,
    content: {
      title: "Everything you need to research the markets",
      subtitle: "One workspace for live data, AI insight, portfolio modelling and compliance - replacing a dozen browser tabs.",
      items: [
        { icon: "Brain", title: "AI Research Copilot", desc: "Ask anything about a stock, sector or your portfolio. Get cited, jargon-free answers powered by the latest LLMs." },
        { icon: "Sparkles", title: "AI Radar & Idea Lab", desc: "AI scanners, smart picks and stocks-to-watch surface high-conviction ideas across thousands of instruments every day." },
        { icon: "LineChart", title: "Live Markets & Charts", desc: "FTSE MIB, pan-European, US stocks, ETFs, FX, commodities and crypto. Real-time quotes, intraday, VWAP and 50+ technical indicators." },
        { icon: "Globe", title: "Explore, Movers & Sectors", desc: "Curated discovery rails, sector heatmaps, thematic watchlists and top movers across every covered market." },
        { icon: "TrendingUp", title: "Options & Futures", desc: "Options chains, futures curves, credit spreads and bond calculator for derivatives-aware research." },
        { icon: "Newspaper", title: "Filings, Earnings & Insider", desc: "SEC/CONSOB filings, earnings calendar, insider transactions, buybacks and corporate actions in one feed." },
        { icon: "Activity", title: "Sentiment & News", desc: "AI-summarised filings, earnings calls and social sentiment so you spot signals before the crowd." },
        { icon: "PieChart", title: "Portfolio & Orders", desc: "Manual or broker-connected portfolios with orders, blotter, paper trading and short-selling analytics." },
        { icon: "Wallet", title: "Net Worth & Household", desc: "Track cash, investments, retirement, crypto, real estate, vehicles, collectibles and liabilities across the household." },
        { icon: "Target", title: "Goals, Budget & Dividend Planner", desc: "Set financial goals, run a monthly budget and forecast dividend income with reinvestment scenarios." },
        { icon: "PieChart", title: "Portfolio Coach & Advisor", desc: "Continuous, plain-English suggestions on rebalancing, risk, diversification and factor exposures." },
        { icon: "Repeat", title: "Backtesting & Strategy Lab", desc: "Design, backtest and walk-forward optimise strategies with transaction costs, slippage and regime breakdowns." },
        { icon: "BarChart3", title: "Optimizer & Rebalance", desc: "Mean-variance, risk-parity and factor-tilt optimisers, plus one-click rebalance plans for any portfolio." },
        { icon: "Shield", title: "Risk Engine & Simulations", desc: "VaR/CVaR, Monte Carlo simulations, drawdown analytics and stress tests across market regimes." },
        { icon: "FlaskConical", title: "Quant Alpha & Event Study", desc: "Institutional-grade quant factors, event studies, peer analysis, ETF overlap and 13F replication." },
        { icon: "Bell", title: "Smart Alerts & Signals", desc: "Price, technical, fundamental and news alerts via email, push or webhook. Never miss what matters." },
        { icon: "Receipt", title: "Tax, Reports & Corp. Actions", desc: "Tax-loss harvesting, corporate-action tracking, one-click PDF reports and a tamper-evident audit log." },
        { icon: "ShieldCheck", title: "Suitability & MiFID II", desc: "Advisor seats, client mandates, MiFID II suitability questionnaires, KIDs and audit-ready trails." },
        { icon: "Building2", title: "Deal Flow & Related Graph", desc: "Deal-flow feed, related-instruments graph and thematic drill-downs for research-driven investors." },
        { icon: "BookOpen", title: "Learn, Methodology & Onboarding", desc: "Guided onboarding, an in-app academy and transparent methodology pages behind every score and model." },
        { icon: "Link2", title: "Agent Integrations (MCP) & API", desc: "OAuth-protected MCP server plus REST and WebSocket access for AI agents and internal research pipelines." },
        { icon: "Lock", title: "Security, Privacy & Audit", desc: "EU-hosted, encrypted, RLS-protected, with row-level audit logs, GDPR export and account deletion built in." },
      ],
    },
  },
  {
    key: "audiences", kind: "audiences", sort_order: 40, enabled: true,
    content: { items: [
      { icon: "Users", tag: "For Individual Investors", title: "Personal portfolio insights", points: ["Make smarter decisions, without the noise", "See your full portfolio in one place", "Plain-English AI explanations, no finance degree required", "Educational research, not high-pressure tips"], ctaLabel: "Start Free Research", ctaHref: "/auth" },
      { icon: "Building2", tag: "For Professionals", title: "Institutional-grade data", points: ["Real-time market data & analytics APIs", "Multi-asset coverage across EU & US markets", "White-label & embedded finance ready", "Dedicated support & SLA guarantees"], ctaLabel: "Explore Enterprise", ctaHref: "/auth" },
    ]},
  },
  {
    key: "how", kind: "steps", sort_order: 50, enabled: true,
    content: {
      title: "From signup to insight in 60 seconds",
      eyebrow: "How it works",
      items: [
        { icon: "UserPlus", title: "Sign Up", desc: "Create account in seconds with email or OAuth." },
        { icon: "Link2", title: "Connect Portfolio", desc: "Link your broker or upload portfolio data." },
        { icon: "Brain", title: "Get AI Insights", desc: "Neural engine analyzes and delivers alpha." },
        { icon: "Rocket", title: "Start Trading Better", desc: "Act on real-time intelligence." },
      ],
    },
  },
  {
    key: "pricing", kind: "pricing", sort_order: 60, enabled: true,
    content: {
      title: "Pricing that scales with you",
      subtitle: "Start free. Upgrade only when you need more depth or seats. EU VAT applied where required.",
      footnote: "All plans include EU data hosting, GDPR-compliant data export and account deletion.",
    },
  },
  {
    key: "launch", kind: "launch", sort_order: 65, enabled: true,
    content: {
      eyebrow: "Launch Offer · Free Access",
      title: "Vela.ai is completely free during launch.",
      subtitle: "Get full access to institutional-grade intelligence - no credit card, no plans, no limits. Founding members keep preferred pricing forever when we introduce paid tiers.",
      primaryCta: { label: "Get Started Free", href: "/auth" },
    },
  },
  {
    key: "blogs", kind: "blogs", sort_order: 75, enabled: true,
    content: {
      eyebrow: "From the blog",
      title: "Research, tools and market insight",
      items: [
        { icon: "Newspaper", title: "Best AI Stock Research Tools 2025", desc: "A deep comparison of the top AI-powered equity research platforms — and where Vela fits in.", href: "/blog/best-ai-stock-research-tools" },
        { icon: "Wallet", title: "Best Wealth Tracking Apps", desc: "How to track net worth, assets and liabilities across accounts, real estate and alternative holdings.", href: "/blog/best-wealth-tracking-apps" },
        { icon: "PieChart", title: "Best AI Portfolio Trackers", desc: "Automated portfolio monitoring, rebalancing alerts and risk metrics that actually help you decide.", href: "/blog/best-ai-portfolio-trackers" },
        { icon: "BarChart3", title: "Vela vs Bloomberg Terminal", desc: "Why professional investors are switching to modern, AI-native platforms for a fraction of the cost.", href: "/blog/vela-vs-bloomberg" },
      ],
    },
  },
  {
    key: "trust", kind: "trust", sort_order: 70, enabled: true,
    content: {
      title: "Security, compliance and transparency aren't add-ons - they're the foundation.",
      subtitle: "",
      eyebrow: "Built for Trust",
      items: [
        { icon: "Lock", title: "Privacy by design", desc: "GDPR-compliant. EU-hosted. Encrypted at rest and in transit. One-click data export and deletion." },
        { icon: "Shield", title: "Regulatory aware", desc: "Educational tool only - no advice. MiFID II suitability tooling for advisor seats. SEC & CONSOB filings indexed." },
        { icon: "FileText", title: "Transparent methods", desc: "Every score, model and backtest links to its methodology page. No black-box magic." },
      ],
    },
  },
  {
    key: "faq", kind: "faq", sort_order: 80, enabled: true,
    content: { title: "Frequently asked", items: [
      { q: "Is Vela.ai an investment advisor?", a: "No. Vela.ai is an educational research and personal-research platform. We do not provide personalised investment advice, recommendations to buy or sell, or portfolio management services. All outputs are for information and educational purposes only." },
      { q: "Where does the market data come from?", a: "We aggregate public market data, regulatory filings (e.g. SEC EDGAR, CONSOB) and reputable news sources. Real-time depth is available on paid tiers; delayed quotes are free." },
      { q: "Is my data safe?", a: "Yes. Data is encrypted in transit and at rest, hosted in the EU, and protected with row-level security. You can export or delete all of your data at any time (GDPR Art. 17 & 20)." },
      { q: "Do I need to connect a brokerage?", a: "No. You can manually track portfolios, import CSV, or - on Pro and above - connect supported brokers in read-only mode." },
      { q: "Which markets are covered?", a: "FTSE MIB and pan-European equities, US stocks and ETFs, major crypto, FX and key macro indicators." },
    ]},
  },
  {
    key: "cta", kind: "cta", sort_order: 90, enabled: true,
    content: {
      title: "Ready to research smarter?",
      subtitle: "Join thousands of investors and advisors using Vela.ai every day.",
      primaryCta: { label: "Create your free account", href: "/auth" },
      secondaryCta: { label: "Compare plans", href: "#pricing" },
    },
  },
  {
    key: "footer", kind: "footer", sort_order: 100, enabled: true,
    content: {
      copyright: "© {{year}} Vela Intelligence Systems. Smart money, amplified.",
      links: [
        { label: "Platform", href: "#features" },
        { label: "Blog", href: "/blog" },
        { label: "Terms", href: "/terms" },
        { label: "Privacy", href: "/privacy" },
        { label: "Disclaimer", href: "/disclaimer" },
      ],
    },
  },
];

export function mergeWithDefaults(rows: LandingSectionRow[]): LandingSectionRow[] {
  const byKey = new Map(rows.map(r => [r.key, r]));
  const merged: LandingSectionRow[] = DEFAULT_SECTIONS.map(d => {
    const row = byKey.get(d.key);
    if (!row) return d;
    return { ...d, ...row, content: { ...d.content, ...(row.content || {}) } };
  });
  // include custom sections that don't match defaults
  for (const r of rows) {
    if (!DEFAULT_SECTIONS.find(d => d.key === r.key)) merged.push(r);
  }
  return merged
    .filter(s => s.enabled)
    .sort((a, b) => a.sort_order - b.sort_order);
}