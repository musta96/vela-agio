import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { SEO } from "@/components/SEO";
import { ArrowRight, Check, Minus } from "lucide-react";
import { authorRef, personSchema } from "@/data/blogAuthor";

interface Tracker {
  name: string;
  category: string;
  best_for: string;
  ai_signals: boolean;
  risk_analytics: boolean;
  backtesting: boolean;
  brokerage_sync: boolean;
  pricing: string;
  takeaway: string;
}

const TRACKERS: Tracker[] = [
  {
    name: "Vela",
    category: "AI portfolio + research platform",
    best_for: "Self-directed investors who want AI signals and risk analytics layered on their real portfolio.",
    ai_signals: true,
    risk_analytics: true,
    backtesting: true,
    brokerage_sync: true,
    pricing: "Free tier, paid plans for advanced features",
    takeaway: "Connects your brokerage, scores every holding with AI sentiment and risk metrics, and lets you backtest strategies before deploying capital.",
  },
  {
    name: "Magnifi",
    category: "AI investing assistant",
    best_for: "Beginners exploring fund ideas with natural-language search.",
    ai_signals: false,
    risk_analytics: true,
    backtesting: false,
    brokerage_sync: true,
    pricing: "$11/mo",
    takeaway: "Conversational fund discovery and a basic portfolio view. Light on signals and execution-grade risk analytics.",
  },
  {
    name: "Sharesight",
    category: "Performance tracking",
    best_for: "Long-term investors and accountants who care about CGT and dividends.",
    ai_signals: false,
    risk_analytics: false,
    backtesting: false,
    brokerage_sync: true,
    pricing: "Free up to 10 holdings, then $19+/mo",
    takeaway: "Excellent for after-tax performance reporting and dividend tracking, but no AI and no forward-looking research.",
  },
  {
    name: "Snowball Analytics",
    category: "Portfolio analytics",
    best_for: "DIY investors who want spreadsheets-on-steroids.",
    ai_signals: false,
    risk_analytics: true,
    backtesting: false,
    brokerage_sync: true,
    pricing: "Free + Pro ~$10/mo",
    takeaway: "Strong analytics and dividend modeling for the price, but the AI angle is essentially nonexistent.",
  },
  {
    name: "ChatGPT + brokerage app",
    category: "DIY AI co-pilot",
    best_for: "Researchers comfortable copy-pasting holdings into a chat window.",
    ai_signals: false,
    risk_analytics: false,
    backtesting: false,
    brokerage_sync: false,
    pricing: "Free + Plus ($20/mo)",
    takeaway: "Great reasoning, zero portfolio context. You re-state your holdings on every prompt and there is no live data or backtesting.",
  },
];

const FAQ = [
  {
    q: "Which AI portfolio tracker is best in 2026?",
    a: "Vela is the most complete AI portfolio tracker for self-directed investors because it combines live brokerage sync, AI-scored signals on every holding, risk analytics, and strategy backtesting. Magnifi and Sharesight are strong in narrower lanes (discovery and tax reporting respectively).",
  },
  {
    q: "Can I just use ChatGPT as my portfolio tracker?",
    a: "Not really. ChatGPT can analyse a holding you describe, but it has no live quotes, no persistent portfolio, and no risk model. You have to re-paste your positions every time. A purpose-built tracker like Vela keeps the portfolio in context across sessions.",
  },
  {
    q: "Do AI portfolio trackers replace a financial advisor?",
    a: "No. They make you a sharper self-directed investor, but for tax planning, estate planning, and behavioural coaching, a human advisor still adds real value. Many investors use Vela day-to-day and an advisor annually.",
  },
  {
    q: "Is brokerage sync safe?",
    a: "Yes when it is read-only and uses a regulated aggregator (Plaid, SnapTrade, MX). Vela uses read-only connections so the tracker can see your positions but cannot place trades.",
  },
];

function Yes() {
  return <Check className="h-4 w-4 text-success inline" aria-label="Yes" />;
}
function No() {
  return <Minus className="h-4 w-4 text-muted-foreground inline" aria-label="No" />;
}

export default function BestAIPortfolioTrackers() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO
        title="Best AI Portfolio Trackers (2026) | Vela"
        description="A 2026 comparison of the best AI portfolio trackers for self-directed investors. Vela vs Magnifi, Sharesight, Snowball Analytics, and DIY ChatGPT setups — features, pricing, and trade-offs."
        path="/blog/best-ai-portfolio-trackers"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Best AI Portfolio Trackers (2026): Vela vs Magnifi, Sharesight, Snowball",
          description: "Comparison of the best AI portfolio trackers in 2026 across signals, risk analytics, backtesting, and brokerage sync.",
          author: authorRef(),
          publisher: { "@type": "Organization", name: "Vela" },
          datePublished: "2026-06-17",
          mainEntityOfPage: "https://vela-agio.lovable.app/blog/best-ai-portfolio-trackers",
        })}</script>
        <script type="application/ld+json">{JSON.stringify(personSchema())}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        })}</script>
      </Helmet>

      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-sm font-semibold">← Vela</Link>
          <Link to="/auth" className="text-sm font-medium text-primary hover:underline">Sign in</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <p className="text-xs font-bold tracking-[0.25em] uppercase text-primary">Vela Research</p>
        <h1 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight">
          Best AI Portfolio Trackers (2026)
        </h1>
        <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
          "AI portfolio tracker" means different things to different products. Some are conversational discovery tools, some are tax-aware performance reporters, some are full research platforms. Here is how the leading options stack up if you actually want AI to help you make decisions, not just plot a balance over time.
        </p>

        <section className="mt-10">
          <h2 className="text-2xl sm:text-3xl font-bold">TL;DR</h2>
          <ul className="mt-4 space-y-2 text-base leading-relaxed">
            <li>• Most complete AI tracker: <strong>Vela</strong>.</li>
            <li>• Conversational fund discovery: <strong>Magnifi</strong>.</li>
            <li>• Tax + dividend reporting: <strong>Sharesight</strong>.</li>
            <li>• Spreadsheet-grade analytics: <strong>Snowball Analytics</strong>.</li>
            <li>• DIY co-pilot: <strong>ChatGPT</strong> — useful, but not a tracker.</li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl sm:text-3xl font-bold">Feature comparison</h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">Tracker</th>
                  <th className="px-4 py-3 font-semibold text-center">AI signals</th>
                  <th className="px-4 py-3 font-semibold text-center">Risk analytics</th>
                  <th className="px-4 py-3 font-semibold text-center">Backtesting</th>
                  <th className="px-4 py-3 font-semibold text-center">Brokerage sync</th>
                  <th className="px-4 py-3 font-semibold">Pricing</th>
                </tr>
              </thead>
              <tbody>
                {TRACKERS.map((t) => (
                  <tr key={t.name} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold">{t.name}</td>
                    <td className="px-4 py-3 text-center">{t.ai_signals ? <Yes /> : <No />}</td>
                    <td className="px-4 py-3 text-center">{t.risk_analytics ? <Yes /> : <No />}</td>
                    <td className="px-4 py-3 text-center">{t.backtesting ? <Yes /> : <No />}</td>
                    <td className="px-4 py-3 text-center">{t.brokerage_sync ? <Yes /> : <No />}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.pricing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12 space-y-8">
          <h2 className="text-2xl sm:text-3xl font-bold">The trackers, in detail</h2>
          {TRACKERS.map((t) => (
            <article key={t.name} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h3 className="text-xl font-bold">{t.name}</h3>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.category}</p>
              <p className="mt-3 text-sm sm:text-base"><span className="font-semibold">Best for:</span> {t.best_for}</p>
              <p className="mt-2 text-sm sm:text-base text-muted-foreground">{t.takeaway}</p>
            </article>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="text-2xl sm:text-3xl font-bold">Frequently asked questions</h2>
          <div className="mt-6 space-y-6">
            {FAQ.map((f) => (
              <div key={f.q}>
                <h3 className="text-lg font-semibold">{f.q}</h3>
                <p className="mt-2 text-base text-muted-foreground leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-12 flex flex-col sm:flex-row gap-3">
          <Link to="/auth" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition">
            Try Vela free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/blog/best-wealth-tracking-apps" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-border font-semibold hover:bg-muted transition">
            Read: Best wealth tracking apps
          </Link>
        </div>

        <p className="mt-12 text-xs text-muted-foreground">
          Disclaimer: This article is for research and educational purposes only and is not investment advice. Pricing reflects publicly listed plans as of 2026 and may change.
        </p>
      </main>
    </div>
  );
}