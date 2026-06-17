import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { SEO } from "@/components/SEO";
import { ArrowRight, TrendingUp } from "lucide-react";

interface Stock {
  symbol: string;
  name: string;
  category: string;
  thesis: string;
  exposure: string;
}

const STOCKS: Stock[] = [
  { symbol: "NVDA", name: "NVIDIA Corporation", category: "AI Infrastructure", thesis: "Dominant supplier of GPUs powering nearly every large-scale AI training cluster, with CUDA lock-in and a growing networking + software stack.", exposure: "Picks-and-shovels of the AI buildout" },
  { symbol: "MSFT", name: "Microsoft", category: "AI Platforms", thesis: "Azure OpenAI and Copilot monetize AI across enterprise productivity, cloud compute, and developer tooling at unmatched scale.", exposure: "Enterprise AI distribution" },
  { symbol: "GOOGL", name: "Alphabet", category: "AI Platforms", thesis: "Owns Gemini frontier models, custom TPU silicon, and search/YouTube distribution to put AI in front of billions of users.", exposure: "Search + frontier models + custom silicon" },
  { symbol: "META", name: "Meta Platforms", category: "AI Platforms", thesis: "Llama is the leading open-weight model family; AI-driven ranking and ads is already lifting revenue per user across Instagram and Facebook.", exposure: "Open-source models + AI-driven ads" },
  { symbol: "AMZN", name: "Amazon", category: "AI Platforms", thesis: "AWS Bedrock, Trainium chips, and the Anthropic partnership position AWS as the neutral hyperscaler for AI workloads.", exposure: "Hyperscaler infra + custom silicon" },
  { symbol: "AMD", name: "Advanced Micro Devices", category: "AI Infrastructure", thesis: "MI300/MI325 accelerators give hyperscalers a credible second source to NVIDIA, with ROCm software closing the gap each quarter.", exposure: "GPU diversification" },
  { symbol: "TSM", name: "Taiwan Semiconductor", category: "AI Infrastructure", thesis: "Manufactures essentially every leading-edge AI chip (NVIDIA, AMD, Apple, Broadcom) on its 3nm and upcoming 2nm nodes.", exposure: "Foundry monopoly on advanced AI silicon" },
  { symbol: "AVGO", name: "Broadcom", category: "AI Infrastructure", thesis: "Custom AI ASICs for hyperscalers plus AI networking silicon (Tomahawk/Jericho) make it the second-largest AI semi by revenue.", exposure: "Custom AI accelerators + networking" },
  { symbol: "ASML", name: "ASML Holding", category: "AI Infrastructure", thesis: "Sole supplier of EUV lithography, the bottleneck for every advanced-node AI chip — pricing power on multi-decade backlog.", exposure: "AI semiconductor toolchain" },
  { symbol: "ORCL", name: "Oracle", category: "AI Platforms", thesis: "OCI is the fastest-growing AI cloud by GPU capacity, with multi-billion training contracts from OpenAI, xAI, and Meta.", exposure: "AI training cloud capacity" },
  { symbol: "PLTR", name: "Palantir Technologies", category: "Applied AI", thesis: "AIP turns LLMs into operational decision engines for defense, healthcare, and large enterprises with strong commercial growth.", exposure: "Enterprise AI deployment" },
  { symbol: "CRM", name: "Salesforce", category: "Applied AI", thesis: "Agentforce monetizes autonomous AI agents on top of the largest CRM dataset in the world at per-conversation pricing.", exposure: "AI agents for enterprise SaaS" },
];

export default function AIStocksToWatch() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO
        title="Best AI Stocks to Buy Now (2026) — Curated AI Watchlist | Vela"
        description="A curated list of the best AI stocks to buy now, covering AI infrastructure, platforms, and applied AI. Each pick comes with a one-line thesis and the AI exposure it gives you."
        path="/ai-stocks-to-watch"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Best AI Stocks to Buy Now",
          description: "Curated list of the best AI stocks across infrastructure, platforms, and applied AI.",
          itemListElement: STOCKS.map((s, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: `${s.name} (${s.symbol})`,
            description: s.thesis,
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
          Best AI Stocks to Buy Now: A Curated 2026 Watchlist
        </h1>
        <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
          The AI buildout is one of the largest capital cycles in market history. These are the AI stocks to buy now if you want diversified exposure across the three layers that matter: the infrastructure powering training and inference, the platforms shipping AI to billions of users, and the applied-AI companies turning models into revenue.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Each pick includes a one-line thesis and the type of AI exposure it gives you. Use it as a starting watchlist, not investment advice — every position should be sized to your own goals and risk tolerance.
        </p>

        <section className="mt-10 sm:mt-12 space-y-4">
          <h2 className="text-2xl sm:text-3xl font-bold">The 12 best AI stocks to buy now</h2>
          <ol className="space-y-4 mt-6">
            {STOCKS.map((s, i) => (
              <li key={s.symbol} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-muted-foreground">#{i + 1}</span>
                      <h3 className="text-lg sm:text-xl font-bold">{s.name}</h3>
                      <span className="text-sm font-mono font-semibold text-primary">{s.symbol}</span>
                    </div>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{s.category}</p>
                  </div>
                  <TrendingUp className="h-5 w-5 text-primary shrink-0 mt-1" aria-hidden />
                </div>
                <p className="mt-3 text-sm sm:text-base leading-relaxed">{s.thesis}</p>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground"><span className="font-semibold">Exposure:</span> {s.exposure}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12 sm:mt-16 prose prose-neutral max-w-none">
          <h2 className="text-2xl sm:text-3xl font-bold">How we picked these AI stocks</h2>
          <p className="mt-4 text-base text-foreground leading-relaxed">
            We split the AI stock universe into three layers and picked the leaders in each. <strong>Infrastructure</strong> (NVIDIA, AMD, TSM, AVGO, ASML) captures the picks-and-shovels trade: every dollar of AI capex flows through these companies first. <strong>Platforms</strong> (MSFT, GOOGL, META, AMZN, ORCL) own the distribution — they put AI in front of billions of users and monetize via cloud, ads, and subscriptions. <strong>Applied AI</strong> (PLTR, CRM) is where models become workflows that enterprises pay for.
          </p>
          <h2 className="mt-8 text-2xl sm:text-3xl font-bold">Build your own AI watchlist</h2>
          <p className="mt-4 text-base text-foreground leading-relaxed">
            Vela tracks AI exposure, fundamentals, and sentiment across all of these names in one place. Add them to a watchlist, run a backtest, or let the AI copilot stress-test your thesis.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 not-prose">
            <Link to="/auth" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition">
              Create a free account <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-border font-semibold hover:bg-muted transition">
              Back to home
            </Link>
          </div>
        </section>

        <p className="mt-12 text-xs text-muted-foreground">
          Disclaimer: This article is for research and educational purposes only and is not investment advice. Vela does not recommend buying or selling any specific security. Always do your own research and consult a licensed financial advisor.
        </p>
      </main>
    </div>
  );
}