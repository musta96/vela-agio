import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { SEO } from "@/components/SEO";
import { ArrowRight, Check, Minus } from "lucide-react";
import { authorRef, personSchema } from "@/data/blogAuthor";

interface App {
  name: string;
  category: string;
  best_for: string;
  account_aggregation: boolean;
  investments: boolean;
  ai_insights: boolean;
  multi_currency: boolean;
  pricing: string;
  takeaway: string;
}

const APPS: App[] = [
  {
    name: "Vela",
    category: "AI-powered wealth platform",
    best_for: "Investors who want net worth, holdings, AI signals, and backtesting in one workspace.",
    account_aggregation: true,
    investments: true,
    ai_insights: true,
    multi_currency: true,
    pricing: "Free tier, paid plans for advanced features",
    takeaway: "Tracks accounts, real estate, crypto and brokerage holdings while layering AI research and risk analytics on top. Built for active wealth-builders, not just budgeters.",
  },
  {
    name: "Monarch Money",
    category: "Budgeting + net worth",
    best_for: "Couples and families that want shared budgeting plus a clean net-worth view.",
    account_aggregation: true,
    investments: true,
    ai_insights: false,
    multi_currency: false,
    pricing: "$14.99/mo or $99.99/yr",
    takeaway: "Excellent UX and shared households. Investment view is read-only — no signals, no backtesting, no thesis-level research.",
  },
  {
    name: "Empower (Personal Capital)",
    category: "Wealth dashboard + advisory",
    best_for: "US-based investors with a healthy nest egg who tolerate sales outreach.",
    account_aggregation: true,
    investments: true,
    ai_insights: false,
    multi_currency: false,
    pricing: "Free dashboard (advisor upsell)",
    takeaway: "Strong retirement-planner and fee analyzer. The free product is funded by advisor calls — expect outreach if your balance is meaningful.",
  },
  {
    name: "Kubera",
    category: "Net-worth tracker (global)",
    best_for: "International investors with crypto, real estate, and alt assets.",
    account_aggregation: true,
    investments: true,
    ai_insights: false,
    multi_currency: true,
    pricing: "$199/yr",
    takeaway: "Best-in-class for tracking every asset class globally. No AI, no signals, no research — purely a balance sheet.",
  },
  {
    name: "YNAB",
    category: "Zero-based budgeting",
    best_for: "People rebuilding cash-flow habits.",
    account_aggregation: true,
    investments: false,
    ai_insights: false,
    multi_currency: false,
    pricing: "$14.99/mo or $109/yr",
    takeaway: "World-class budgeting methodology, but treats investments as a side note. Not a wealth tracker in the investment sense.",
  },
  {
    name: "Mint (legacy)",
    category: "Discontinued",
    best_for: "—",
    account_aggregation: false,
    investments: false,
    ai_insights: false,
    multi_currency: false,
    pricing: "Discontinued 2024",
    takeaway: "Shut down by Intuit in 2024. Former users have largely migrated to Monarch, Empower, or Vela.",
  },
];

const FAQ = [
  {
    q: "What is the best wealth tracking app for investors?",
    a: "For investors who care about holdings, signals, and research — not just budgeting — Vela leads because it pairs account aggregation with AI-driven investment research, risk analytics, and backtesting. Monarch and Empower are excellent if you primarily want a tidy net-worth view; Kubera is the most asset-agnostic global tracker.",
  },
  {
    q: "Is there a free alternative to Empower or Monarch?",
    a: "Yes. Vela has a free tier covering account-level net worth and core investment analytics. Empower's dashboard is also free but bundles advisor outreach; Mint is no longer available.",
  },
  {
    q: "Which app handles crypto and real estate alongside stocks?",
    a: "Vela and Kubera both handle multi-asset wealth (stocks, ETFs, crypto, real estate, cash). Vela adds AI research on top of the investable portion; Kubera focuses purely on the balance sheet.",
  },
  {
    q: "Do these apps work outside the US?",
    a: "Vela and Kubera are global and multi-currency. Empower is US-centric. Monarch is primarily US/Canada. YNAB works globally for budgeting but is light on investments.",
  },
];

function Yes() {
  return <Check className="h-4 w-4 text-success inline" aria-label="Yes" />;
}
function No() {
  return <Minus className="h-4 w-4 text-muted-foreground inline" aria-label="No" />;
}

export default function BestWealthTrackingApps() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO
        title="Best Wealth Tracking Apps (2026): Vela vs Monarch, Empower, Kubera, YNAB | Vela"
        description="A 2026 comparison of the best wealth tracking apps for investors. Vela vs Monarch, Empower, Kubera, YNAB and the discontinued Mint — features, pricing, and which fits your goals."
        path="/blog/best-wealth-tracking-apps"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Best Wealth Tracking Apps (2026): Vela vs Monarch, Empower, Kubera, YNAB",
          description: "Comparison of the best wealth tracking apps in 2026 across net worth, investments, AI insights, and pricing.",
          author: authorRef(),
          publisher: { "@type": "Organization", name: "Vela" },
          datePublished: "2026-06-17",
          mainEntityOfPage: "https://vela-agio.lovable.app/blog/best-wealth-tracking-apps",
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
          Best Wealth Tracking Apps (2026)
        </h1>
        <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
          The right wealth tracker depends on what you actually do with money. If you mostly budget, YNAB or Monarch are great. If you invest, you want signals and research alongside balances. Here is how the leading wealth-tracking apps compare in 2026.
        </p>

        <section className="mt-10">
          <h2 className="text-2xl sm:text-3xl font-bold">TL;DR</h2>
          <ul className="mt-4 space-y-2 text-base leading-relaxed">
            <li>• Investors who want signals + analytics: <strong>Vela</strong>.</li>
            <li>• Couples and families that want shared budgeting: <strong>Monarch</strong>.</li>
            <li>• US investors with a six-figure balance: <strong>Empower</strong> (expect advisor outreach).</li>
            <li>• Global multi-asset balance sheet: <strong>Kubera</strong>.</li>
            <li>• Pure budgeting methodology: <strong>YNAB</strong>.</li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl sm:text-3xl font-bold">Feature comparison</h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">App</th>
                  <th className="px-4 py-3 font-semibold text-center">Accounts</th>
                  <th className="px-4 py-3 font-semibold text-center">Investments</th>
                  <th className="px-4 py-3 font-semibold text-center">AI insights</th>
                  <th className="px-4 py-3 font-semibold text-center">Multi-currency</th>
                  <th className="px-4 py-3 font-semibold">Pricing</th>
                </tr>
              </thead>
              <tbody>
                {APPS.map((a) => (
                  <tr key={a.name} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold">{a.name}</td>
                    <td className="px-4 py-3 text-center">{a.account_aggregation ? <Yes /> : <No />}</td>
                    <td className="px-4 py-3 text-center">{a.investments ? <Yes /> : <No />}</td>
                    <td className="px-4 py-3 text-center">{a.ai_insights ? <Yes /> : <No />}</td>
                    <td className="px-4 py-3 text-center">{a.multi_currency ? <Yes /> : <No />}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.pricing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12 space-y-8">
          <h2 className="text-2xl sm:text-3xl font-bold">The apps, in detail</h2>
          {APPS.map((a) => (
            <article key={a.name} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h3 className="text-xl font-bold">{a.name}</h3>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{a.category}</p>
              <p className="mt-3 text-sm sm:text-base"><span className="font-semibold">Best for:</span> {a.best_for}</p>
              <p className="mt-2 text-sm sm:text-base text-muted-foreground">{a.takeaway}</p>
            </article>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="text-2xl sm:text-3xl font-bold">Why Vela for investors</h2>
          <p className="mt-4 text-base leading-relaxed">
            Most wealth trackers stop at "here's your balance". Vela treats your portfolio as a living thing: live quotes, sector exposure, risk metrics, AI sentiment on every holding, and the ability to backtest a strategy before committing capital. If your wealth is mostly invested rather than mostly spent, that is the difference between a dashboard and a decision tool.
          </p>
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
          <Link to="/blog/best-ai-portfolio-trackers" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-border font-semibold hover:bg-muted transition">
            Read: Best AI portfolio trackers
          </Link>
        </div>

        <p className="mt-12 text-xs text-muted-foreground">
          Disclaimer: This article is for research and educational purposes only and is not financial advice. Pricing reflects publicly listed plans as of 2026 and may change.
        </p>
      </main>
    </div>
  );
}