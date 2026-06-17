import {
  Brain, LineChart, PieChart, Target, Activity, Bell, Shield, FileText,
  Users, Building2, Zap, BarChart3, Lock, BookOpen, Sparkles, Globe, Star, TrendingUp,
  UserPlus, Link2, Rocket, Wallet, FlaskConical, Newspaper, ShieldCheck, Receipt,
} from "lucide-react";

export const ICONS: Record<string, any> = {
  Brain, LineChart, PieChart, Target, Activity, Bell, Shield, FileText,
  Users, Building2, Zap, BarChart3, Lock, BookOpen, Sparkles, Globe, Star, TrendingUp,
  UserPlus, Link2, Rocket, Wallet, FlaskConical, Newspaper, ShieldCheck, Receipt,
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
      secondaryCta: { label: "See features", href: "#features" },
      note: "No credit card. Free forever plan. Cancel anytime.",
      trust: [
        { icon: "Lock", label: "GDPR & EU-hosted" },
        { icon: "Shield", label: "MiFID II ready" },
        { icon: "Globe", label: "CONSOB & SEC filings" },
        { icon: "Star", label: "4.8 / 5 from early users" },
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
        { icon: "LineChart", title: "Live Markets & Charts", desc: "FTSE MIB, pan-European, US stocks, ETFs and crypto. Real-time quotes, intraday, VWAP and 50+ technical indicators." },
        { icon: "PieChart", title: "Portfolio Coach", desc: "Track multiple portfolios. Get continuous, plain-English suggestions on rebalancing, risk and diversification." },
        { icon: "Target", title: "Optimizer & Backtesting", desc: "Mean-variance, risk-parity, factor tilts. Stress-test any strategy across 20+ years of history." },
        { icon: "Activity", title: "Sentiment & News", desc: "AI-summarised filings, earnings calls and social sentiment so you spot signals before the crowd." },
        { icon: "Bell", title: "Smart Alerts", desc: "Price, technical, fundamental and news alerts via email, push or webhook. Never miss what matters." },
        { icon: "Shield", title: "Risk & Compliance", desc: "VaR, drawdown, factor exposures. MiFID II suitability and KIDs for advisors. Built for European rules." },
        { icon: "FileText", title: "Reports & Tax Tools", desc: "One-click PDF reports, tax-loss harvesting, corporate actions and a full audit log." },
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