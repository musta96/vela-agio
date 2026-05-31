import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SEO } from "@/components/SEO";
import {
  Sparkles, LineChart, Brain, Shield, Target, Zap, BarChart3, BookOpen,
  TrendingUp, Globe, Lock, Check, ArrowRight, Building2, Users, FileText,
  Bell, PieChart, Activity, Star
} from "lucide-react";

const FEATURES = [
  { icon: Brain, title: "AI Research Copilot", desc: "Ask anything about a stock, sector or your portfolio. Get cited, jargon-free answers powered by the latest LLMs." },
  { icon: LineChart, title: "Live Markets & Charts", desc: "FTSE MIB, pan-European, US stocks, ETFs and crypto. Real-time quotes, intraday, VWAP and 50+ technical indicators." },
  { icon: PieChart, title: "Portfolio Coach", desc: "Track multiple portfolios. Get continuous, plain-English suggestions on rebalancing, risk and diversification." },
  { icon: Target, title: "Optimizer & Backtesting", desc: "Mean-variance, risk-parity, factor tilts. Stress-test any strategy across 20+ years of history." },
  { icon: Activity, title: "Sentiment & News", desc: "AI-summarised filings, earnings calls and social sentiment so you spot signals before the crowd." },
  { icon: Bell, title: "Smart Alerts", desc: "Price, technical, fundamental and news alerts via email, push or webhook. Never miss what matters." },
  { icon: Shield, title: "Risk & Compliance", desc: "VaR, drawdown, factor exposures. MiFID II suitability and KIDs for advisors. Built for European rules." },
  { icon: FileText, title: "Reports & Tax Tools", desc: "One-click PDF reports, tax-loss harvesting, corporate actions and a full audit log." },
];

const AUDIENCES = [
  { icon: Users, tag: "For investors", title: "Make smarter decisions, without the noise", points: ["See your full portfolio in one place", "Plain-English AI explanations, no finance degree required", "Educational research, not high-pressure tips"] },
  { icon: Building2, tag: "For professionals", title: "Institutional-grade tools at a fraction of the cost", points: ["Multi-portfolio modelling & rebalancing", "Compliance-ready audit trail & client reports", "API, SSO and white-label client portal"] },
];

type Tier = { name: string; price: string; note: string; features: string[]; cta: string; cta_href: string; highlight: boolean };
const FALLBACK_TIERS: Tier[] = [
  { name: "Free", price: "€0", note: "Forever", features: ["Live quotes (delayed)"], cta: "Get started", cta_href: "/auth", highlight: false },
];

const FAQ = [
  { q: "Is Vela.ai an investment advisor?", a: "No. Vela.ai is an educational research and personal-research platform. We do not provide personalised investment advice, recommendations to buy or sell, or portfolio management services. All outputs are for information and educational purposes only." },
  { q: "Where does the market data come from?", a: "We aggregate public market data, regulatory filings (e.g. SEC EDGAR, CONSOB) and reputable news sources. Real-time depth is available on paid tiers; delayed quotes are free." },
  { q: "Is my data safe?", a: "Yes. Data is encrypted in transit and at rest, hosted in the EU, and protected with row-level security. You can export or delete all of your data at any time (GDPR Art. 17 & 20)." },
  { q: "Do I need to connect a brokerage?", a: "No. You can manually track portfolios, import CSV, or — on Pro and above — connect supported brokers in read-only mode." },
  { q: "Which markets are covered?", a: "FTSE MIB and pan-European equities, US stocks and ETFs, major crypto, FX and key macro indicators." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO
        title="Vela.ai — AI research for serious investors & advisors"
        description="An educational research platform for FTSE MIB, European and US markets. AI copilot, portfolio coach, optimizer, backtesting and compliance tools — for individuals and professionals."
        path="/"
      />

      {/* NAV */}
      <header className="sticky top-0 z-40 backdrop-blur bg-background/80 border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>Vela.ai</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#audiences" className="hover:text-foreground">Who it's for</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
            <a href="#faq" className="hover:text-foreground md:hidden">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link to="/auth">Sign in</Link></Button>
            <Button asChild size="sm"><Link to="/auth">Get started</Link></Button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.18),transparent_55%)]" />
        <div className="container mx-auto px-6 pt-20 pb-24 text-center max-w-4xl">
          <Badge variant="outline" className="mb-5 border-primary/30 text-primary">
            <Sparkles className="h-3 w-3 mr-1.5" /> New: AI Portfolio Coach
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.05]">
            Research markets like a pro.
            <span className="block text-primary mt-2">Without becoming one.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Vela.ai is an educational research platform for FTSE MIB, European and US markets.
            AI copilot, portfolio coach, optimizer and compliance tools — built for individual
            investors and professionals alike.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="text-base">
              <Link to="/auth">Start free <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base">
              <a href="#features">See features</a>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">No credit card. Free forever plan. Cancel anytime.</p>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> GDPR & EU-hosted</span>
            <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> MiFID II ready</span>
            <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> CONSOB & SEC filings</span>
            <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-primary" /> 4.8 / 5 from early users</span>
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
      <section className="border-y border-border bg-card/40">
        <div className="container mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { k: "8 000+", v: "Instruments covered" },
            { k: "20 yrs", v: "Historical backtests" },
            { k: "<150 ms", v: "AI response latency" },
            { k: "100 %", v: "Educational — never advice" },
          ].map((s) => (
            <div key={s.v}>
              <div className="text-2xl md:text-3xl font-bold text-primary">{s.k}</div>
              <div className="text-xs md:text-sm text-muted-foreground mt-1">{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="container mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Everything you need to research the markets</h2>
          <p className="mt-4 text-muted-foreground">
            One workspace for live data, AI insight, portfolio modelling and compliance — replacing a dozen browser tabs.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <Card key={f.title} className="bg-card/50 border-border hover:border-primary/40 transition-colors">
              <CardContent className="p-6">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* AUDIENCES */}
      <section id="audiences" className="bg-card/30 border-y border-border">
        <div className="container mx-auto px-6 py-20 grid md:grid-cols-2 gap-8">
          {AUDIENCES.map((a) => (
            <Card key={a.title} className="bg-background border-border">
              <CardContent className="p-8">
                <div className="flex items-center gap-2 text-primary text-xs font-medium uppercase tracking-wider mb-3">
                  <a.icon className="h-4 w-4" /> {a.tag}
                </div>
                <h3 className="text-2xl font-bold">{a.title}</h3>
                <ul className="mt-5 space-y-2.5">
                  {a.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="container mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">From signup to insight in 60 seconds</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { n: 1, icon: Zap, t: "Create your account", d: "Free forever plan, no card required. Sign up with email or Google." },
            { n: 2, icon: BarChart3, t: "Add your portfolio or watchlist", d: "Manual, CSV import, or read-only broker connection. We never touch your money." },
            { n: 3, icon: Brain, t: "Let the AI guide your research", d: "Get coaching, alerts, backtests and reports on demand — in plain English." },
          ].map((s) => (
            <div key={s.n} className="relative">
              <div className="absolute -top-3 -left-3 h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">{s.n}</div>
              <Card className="bg-card/50 border-border h-full">
                <CardContent className="p-6">
                  <s.icon className="h-6 w-6 text-primary mb-3" />
                  <h3 className="font-semibold">{s.t}</h3>
                  <p className="text-sm text-muted-foreground mt-2">{s.d}</p>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="bg-card/30 border-y border-border">
        <div className="container mx-auto px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Pricing that scales with you</h2>
            <p className="mt-4 text-muted-foreground">Start free. Upgrade only when you need more depth or seats. EU VAT applied where required.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {TIERS.map((t) => (
              <Card
                key={t.name}
                className={`relative flex flex-col ${t.highlight ? "border-primary ring-1 ring-primary/40 bg-background" : "bg-background border-border"}`}
              >
                {t.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">Most popular</Badge>
                  </div>
                )}
                <CardContent className="p-6 flex flex-col flex-1">
                  <h3 className="font-semibold">{t.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{t.price}</span>
                    <span className="text-xs text-muted-foreground">{t.note}</span>
                  </div>
                  <ul className="mt-5 space-y-2 text-sm flex-1">
                    {t.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant={t.highlight ? "default" : "outline"} className="mt-6 w-full">
                    <Link to="/auth">{t.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-6">
            All plans include EU data hosting, GDPR-compliant data export and account deletion.
          </p>
        </div>
      </section>

      {/* TRUST */}
      <section className="container mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Built for trust</h2>
          <p className="mt-4 text-muted-foreground">Security, compliance and transparency aren't add-ons — they're the foundation.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { icon: Lock, t: "Privacy by design", d: "GDPR-compliant. EU-hosted. Encrypted at rest and in transit. One-click data export and deletion." },
            { icon: Shield, t: "Regulatory aware", d: "Educational tool only — no advice. MiFID II suitability tooling for advisor seats. SEC & CONSOB filings indexed." },
            { icon: BookOpen, t: "Transparent methods", d: "Every score, model and backtest links to its methodology page. No black-box magic." },
          ].map((x) => (
            <Card key={x.t} className="bg-card/50 border-border">
              <CardContent className="p-6">
                <x.icon className="h-6 w-6 text-primary mb-3" />
                <h3 className="font-semibold">{x.t}</h3>
                <p className="text-sm text-muted-foreground mt-2">{x.d}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-card/30 border-y border-border">
        <div className="container mx-auto px-6 py-20 max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center">Frequently asked</h2>
          <div className="mt-10 space-y-4">
            {FAQ.map((f) => (
              <Card key={f.q} className="bg-background border-border">
                <CardContent className="p-6">
                  <h3 className="font-semibold">{f.q}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.a}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <TrendingUp className="h-10 w-10 text-primary mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Ready to research smarter?</h2>
          <p className="mt-4 text-muted-foreground">Join thousands of investors and advisors using Vela.ai every day.</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg"><Link to="/auth">Create your free account <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
            <Button asChild variant="outline" size="lg"><a href="#pricing">Compare plans</a></Button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-card/40">
        <div className="container mx-auto px-6 py-10 grid md:grid-cols-4 gap-8 text-sm">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Vela.ai
            </div>
            <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
              Educational research and personal research assistant. Not an investment advisor.
            </p>
          </div>
          <div>
            <div className="font-medium mb-3">Product</div>
            <ul className="space-y-2 text-muted-foreground">
              <li><a href="#features" className="hover:text-foreground">Features</a></li>
              <li><a href="#pricing" className="hover:text-foreground">Pricing</a></li>
              <li><a href="#audiences" className="hover:text-foreground">Who it's for</a></li>
              <li><a href="#faq" className="hover:text-foreground">FAQ</a></li>
            </ul>
          </div>
          <div>
            <div className="font-medium mb-3">Legal</div>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link to="/privacy" className="hover:text-foreground">Privacy</Link></li>
              <li><Link to="/terms" className="hover:text-foreground">Terms</Link></li>
              <li><Link to="/disclaimer" className="hover:text-foreground">Disclaimer</Link></li>
              <li><Link to="/cookies" className="hover:text-foreground">Cookies</Link></li>
            </ul>
          </div>
          <div>
            <div className="font-medium mb-3">Get started</div>
            <Button asChild size="sm" className="w-full"><Link to="/auth">Create free account</Link></Button>
            <Button asChild size="sm" variant="outline" className="w-full mt-2"><Link to="/auth">Sign in</Link></Button>
          </div>
        </div>
        <div className="border-t border-border">
          <div className="container mx-auto px-6 py-4 text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>© {new Date().getFullYear()} Vela.ai. All rights reserved.</span>
            <span>Educational use only. Not investment advice.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}