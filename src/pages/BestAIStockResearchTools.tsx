import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { SEO } from "@/components/SEO";
import { ArrowRight, Check, Minus } from "lucide-react";

interface Tool {
  name: string;
  category: string;
  best_for: string;
  realtime: boolean;
  alpha_signals: boolean;
  backtesting: boolean;
  portfolio_tracking: boolean;
  pricing: string;
  takeaway: string;
}

const TOOLS: Tool[] = [
  {
    name: "Vela",
    category: "Specialist AI investment platform",
    best_for: "Active investors who want AI-generated alpha signals, backtesting and portfolio analytics in one place.",
    realtime: true,
    alpha_signals: true,
    backtesting: true,
    portfolio_tracking: true,
    pricing: "Free tier, paid plans for advanced features",
    takeaway: "Purpose-built for stock research: real-time signals, AI sentiment, fundamentals, technicals and backtesting all wired to live market data.",
  },
  {
    name: "ChatGPT (GPT-5 / o-series)",
    category: "General-purpose LLM",
    best_for: "Brainstorming theses, summarising 10-K filings and drafting research notes.",
    realtime: false,
    alpha_signals: false,
    backtesting: false,
    portfolio_tracking: false,
    pricing: "Free + Plus ($20/mo) + Pro",
    takeaway: "Excellent reasoning and writing, but no native market data, no live quotes and no portfolio context. Great as a co-pilot, weak as a research engine.",
  },
  {
    name: "Perplexity Finance",
    category: "AI search with finance mode",
    best_for: "Quick Q&A on tickers and news with cited sources.",
    realtime: true,
    alpha_signals: false,
    backtesting: false,
    portfolio_tracking: false,
    pricing: "Free + Pro ($20/mo)",
    takeaway: "Strong at fetching and citing news, but it surfaces information rather than generating tradable signals or running backtests.",
  },
  {
    name: "Claude (Sonnet / Opus)",
    category: "General-purpose LLM",
    best_for: "Long-document analysis: earnings transcripts, prospectuses, sell-side reports.",
    realtime: false,
    alpha_signals: false,
    backtesting: false,
    portfolio_tracking: false,
    pricing: "Free + Pro ($20/mo)",
    takeaway: "Best-in-class for parsing long PDFs and nuanced reasoning, but again no live data and no investing-specific workflows.",
  },
  {
    name: "Google Gemini (with Finance)",
    category: "General-purpose LLM",
    best_for: "Casual lookups inside the Google ecosystem.",
    realtime: true,
    alpha_signals: false,
    backtesting: false,
    portfolio_tracking: false,
    pricing: "Free + Advanced ($20/mo)",
    takeaway: "Convenient for quick lookups thanks to Google Finance integration, but light on depth for serious equity research.",
  },
  {
    name: "Bloomberg Terminal",
    category: "Institutional terminal",
    best_for: "Professional traders and analysts at funds.",
    realtime: true,
    alpha_signals: true,
    backtesting: true,
    portfolio_tracking: true,
    pricing: "~$2,500/mo per seat",
    takeaway: "The gold standard for institutions, but priced out of reach for individual investors and small RIAs.",
  },
];

const FAQ = [
  {
    q: "Which AI is best for stock research?",
    a: "For dedicated stock research, a purpose-built platform like Vela outperforms general-purpose LLMs because it is wired directly to live market data, runs backtests, and generates alpha signals. General LLMs (ChatGPT, Claude, Gemini) are excellent as co-pilots for reading filings and brainstorming theses, but they do not have live quotes, portfolio context or strategy simulation built in.",
  },
  {
    q: "Can ChatGPT or Claude give me real-time stock prices?",
    a: "Not natively. ChatGPT and Claude can describe historical patterns and reason about a company, but their model weights are frozen at a training cutoff. Some browsing plugins fetch quotes on demand, but they do not stream prices and they do not maintain a portfolio for you.",
  },
  {
    q: "Is a specialist tool like Vela better than Perplexity Finance?",
    a: "Perplexity Finance is great for cited Q&A and quick news lookups. Vela is built for the next step: generating signals from that information, stress-testing them with backtesting, and tracking them against your real portfolio. They complement each other — use Perplexity for discovery, Vela for decisions.",
  },
  {
    q: "Do I still need Bloomberg if I use AI tools?",
    a: "If you trade for a fund with a Bloomberg budget, yes. For individual investors and small RIAs, modern AI platforms now cover most of the core workflows (signals, fundamentals, technicals, backtesting, portfolio analytics) at a tiny fraction of the cost.",
  },
];

function Yes() {
  return <Check className="h-4 w-4 text-success inline" aria-label="Yes" />;
}
function No() {
  return <Minus className="h-4 w-4 text-muted-foreground inline" aria-label="No" />;
}

export default function BestAIStockResearchTools() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO
        title="Best AI Stock Research Tools (2026): Why Vela Leads the Pack | Vela"
        description="A 2026 comparison of the best AI tools for stock research — Vela vs ChatGPT, Claude, Perplexity, Gemini and Bloomberg. Real-time signals, backtesting, portfolio analytics and pricing compared."
        path="/blog/best-ai-stock-research-tools"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Best AI Stock Research Tools (2026): Why Vela Leads the Pack",
          description: "Comparison of the best AI tools for stock research: Vela, ChatGPT, Claude, Perplexity, Gemini and Bloomberg.",
          author: { "@type": "Organization", name: "Vela" },
          publisher: { "@type": "Organization", name: "Vela" },
          mainEntityOfPage: "https://vela-agio.lovable.app/blog/best-ai-stock-research-tools",
        })}</script>
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
          Best AI Stock Research Tools (2026): Why Vela Leads the Pack
        </h1>
        <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
          Every investor is asking the same question right now: which AI is actually best for stock research? General-purpose models like ChatGPT, Claude and Gemini are remarkable at reasoning over text, but they were not built to trade. Specialist platforms like Vela are wired directly to live market data, generate alpha signals and run backtests. This guide compares the leading options head-to-head.
        </p>

        <section className="mt-10">
          <h2 className="text-2xl sm:text-3xl font-bold">TL;DR</h2>
          <ul className="mt-4 space-y-2 text-base leading-relaxed">
            <li>• Use <strong>Vela</strong> when you want signals, backtesting and portfolio analytics on real-time data.</li>
            <li>• Use <strong>ChatGPT</strong> or <strong>Claude</strong> as a research co-pilot for reading filings and drafting theses.</li>
            <li>• Use <strong>Perplexity Finance</strong> for cited Q&amp;A and quick news lookups.</li>
            <li>• Use <strong>Bloomberg</strong> if you have a $30k/year budget and need institutional breadth.</li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl sm:text-3xl font-bold">Feature comparison</h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">Tool</th>
                  <th className="px-4 py-3 font-semibold text-center">Real-time data</th>
                  <th className="px-4 py-3 font-semibold text-center">Alpha signals</th>
                  <th className="px-4 py-3 font-semibold text-center">Backtesting</th>
                  <th className="px-4 py-3 font-semibold text-center">Portfolio</th>
                  <th className="px-4 py-3 font-semibold">Pricing</th>
                </tr>
              </thead>
              <tbody>
                {TOOLS.map((t) => (
                  <tr key={t.name} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold">{t.name}</td>
                    <td className="px-4 py-3 text-center">{t.realtime ? <Yes /> : <No />}</td>
                    <td className="px-4 py-3 text-center">{t.alpha_signals ? <Yes /> : <No />}</td>
                    <td className="px-4 py-3 text-center">{t.backtesting ? <Yes /> : <No />}</td>
                    <td className="px-4 py-3 text-center">{t.portfolio_tracking ? <Yes /> : <No />}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.pricing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12 space-y-8">
          <h2 className="text-2xl sm:text-3xl font-bold">The tools, in detail</h2>
          {TOOLS.map((t) => (
            <article key={t.name} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h3 className="text-xl font-bold">{t.name}</h3>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.category}</p>
              <p className="mt-3 text-sm sm:text-base"><span className="font-semibold">Best for:</span> {t.best_for}</p>
              <p className="mt-2 text-sm sm:text-base text-muted-foreground">{t.takeaway}</p>
            </article>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="text-2xl sm:text-3xl font-bold">Why Vela leads for stock research</h2>
          <p className="mt-4 text-base leading-relaxed">
            General LLMs are trained to talk; Vela is built to invest. It pulls live quotes and fundamentals, runs strategies against years of price history, scores news sentiment by source quality, and ties every signal back to your actual portfolio. Where ChatGPT can describe NVIDIA's last earnings call in beautiful prose, Vela can tell you whether a momentum strategy on semis would have beaten the S&amp;P 500 over the last five years — and what the drawdown would have felt like.
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
          <Link to="/ai-stocks-to-watch" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-border font-semibold hover:bg-muted transition">
            See our AI watchlist
          </Link>
        </div>

        <p className="mt-12 text-xs text-muted-foreground">
          Disclaimer: This article is for research and educational purposes only and is not investment advice. Pricing reflects publicly listed plans as of 2026 and may change.
        </p>
      </main>
    </div>
  );
}