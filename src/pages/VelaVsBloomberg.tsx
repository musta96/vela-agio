import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { SEO } from "@/components/SEO";
import { ArrowRight, Check, Minus } from "lucide-react";
import { authorRef, personSchema } from "@/data/blogAuthor";

interface Row {
  feature: string;
  vela: boolean | string;
  bloomberg: boolean | string;
  note: string;
}

const ROWS: Row[] = [
  { feature: "Pricing", vela: "Free tier · paid plans", bloomberg: "~$2,500/mo per seat", note: "Bloomberg is a fixed institutional cost; Vela scales from free upward." },
  { feature: "Real-time global quotes", vela: true, bloomberg: true, note: "Both cover US, EU, and major international exchanges." },
  { feature: "AI signals on every holding", vela: true, bloomberg: false, note: "Vela scores fundamentals, technicals, and sentiment automatically." },
  { feature: "Strategy backtesting", vela: true, bloomberg: true, note: "Bloomberg via BBG Quant; Vela built in." },
  { feature: "Portfolio + risk analytics", vela: true, bloomberg: true, note: "VaR, exposure, correlation in both." },
  { feature: "News + sentiment", vela: true, bloomberg: true, note: "Bloomberg has the proprietary newsroom; Vela aggregates and AI-scores." },
  { feature: "Chat with markets data", vela: true, bloomberg: "Limited", note: "Vela ships a native AI copilot; Bloomberg's AI features are gradually rolling out." },
  { feature: "Mobile + iOS native", vela: true, bloomberg: "Companion app", note: "Vela is mobile-first; Bloomberg's mobile app is a terminal companion." },
  { feature: "Onboarding time", vela: "Minutes", bloomberg: "Days + training", note: "Bloomberg's power comes with a steep learning curve." },
  { feature: "Best for", vela: "Self-directed investors and small RIAs", bloomberg: "Institutional desks", note: "Different audiences, overlapping toolkits." },
];

const FAQ = [
  {
    q: "Is Vela a Bloomberg Terminal alternative?",
    a: "For individual investors and small RIAs, yes. Vela covers most of the workflows that retail and small-firm investors actually use a Bloomberg Terminal for: real-time quotes, fundamentals, technicals, news, portfolio analytics, and backtesting — at a fraction of the cost. For institutional fixed-income desks or sell-side traders, Bloomberg remains the standard.",
  },
  {
    q: "How much does Bloomberg cost vs Vela?",
    a: "A Bloomberg Terminal seat is roughly $2,500/month, billed annually, with multi-seat enterprise pricing on top. Vela has a free tier and paid plans that are orders of magnitude cheaper.",
  },
  {
    q: "Does Vela have Bloomberg-grade news?",
    a: "Bloomberg owns a global newsroom that breaks stories; Vela aggregates news from major financial publishers and applies AI sentiment scoring on top. If proprietary scoops are critical to your edge, Bloomberg is irreplaceable. If you mostly need to know how news affects your holdings, Vela is enough.",
  },
  {
    q: "Can I use both?",
    a: "Many small RIAs do: Bloomberg for the desks that need it, Vela for portfolio analytics, AI signals, and client-facing reporting across the rest of the firm.",
  },
];

function Yes() {
  return <Check className="h-4 w-4 text-success inline" aria-label="Yes" />;
}
function No() {
  return <Minus className="h-4 w-4 text-muted-foreground inline" aria-label="No" />;
}

function Cell({ v }: { v: boolean | string }) {
  if (v === true) return <Yes />;
  if (v === false) return <No />;
  return <span className="text-muted-foreground">{v}</span>;
}

export default function VelaVsBloomberg() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO
        title="Vela vs Bloomberg Terminal (2026) | Vela"
        description="An honest 2026 comparison of Vela and the Bloomberg Terminal. Where Vela matches Bloomberg, where it does not, and who each one is really built for."
        path="/blog/vela-vs-bloomberg"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Vela vs Bloomberg Terminal (2026): The AI Alternative for Investors",
          description: "Feature-by-feature comparison of Vela and the Bloomberg Terminal across pricing, signals, analytics, and audience.",
          author: authorRef(),
          publisher: { "@type": "Organization", name: "Vela" },
          datePublished: "2026-06-17",
          mainEntityOfPage: "https://vela-agio.lovable.app/blog/vela-vs-bloomberg",
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
          Vela vs Bloomberg Terminal (2026)
        </h1>
        <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
          The Bloomberg Terminal is the institutional standard at ~$2,500 per seat per month. Vela is a modern, AI-native research and portfolio platform that starts free. They are aimed at different audiences but the feature overlap is closer than it was even two years ago. Here is an honest comparison.
        </p>

        <section className="mt-12">
          <h2 className="text-2xl sm:text-3xl font-bold">Side-by-side</h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">Feature</th>
                  <th className="px-4 py-3 font-semibold text-center">Vela</th>
                  <th className="px-4 py-3 font-semibold text-center">Bloomberg</th>
                  <th className="px-4 py-3 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.feature} className="border-t border-border align-top">
                    <td className="px-4 py-3 font-semibold">{r.feature}</td>
                    <td className="px-4 py-3 text-center"><Cell v={r.vela} /></td>
                    <td className="px-4 py-3 text-center"><Cell v={r.bloomberg} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl sm:text-3xl font-bold">Who Vela is for</h2>
          <p className="mt-4 text-base leading-relaxed">
            Vela is built for self-directed investors, RIAs, family offices, and small funds that want institutional-grade analytics without the Bloomberg price tag. If your day is built around fixed-income chat rooms, options market-making, or sell-side workflows, you still need a Terminal. For everything else, Vela now covers the workflows that matter.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl sm:text-3xl font-bold">Who Bloomberg is still for</h2>
          <p className="mt-4 text-base leading-relaxed">
            If you need proprietary breaking news, FX/rates dealer pricing, IB Chat, or the deep institutional data sets (TRACE, MSRB, MiFID II reporting), a Terminal earns its price. Vela is not trying to replace that audience.
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
          <Link to="/blog/best-ai-stock-research-tools" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-border font-semibold hover:bg-muted transition">
            Read: Best AI stock research tools
          </Link>
        </div>

        <p className="mt-12 text-xs text-muted-foreground">
          Disclaimer: This article is for research and educational purposes only and is not investment advice. Bloomberg pricing reflects publicly reported figures and may vary by contract.
        </p>
      </main>
    </div>
  );
}