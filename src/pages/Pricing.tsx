import { Link } from "react-router-dom";
import { useState } from "react";
import { SEO } from "@/components/SEO";
import VelaLogo from "@/components/VelaLogo";
import { useAuth } from "@/hooks/useAuth";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { PricingSection } from "@/components/landing/pricing-section";
import { ArrowRight, ChevronDown, Check, X } from "lucide-react";
import { useFlag } from "@/hooks/useFeatureFlags";

const COMPARISON: { label: string; values: (string | boolean)[] }[] = [
  { label: "AI Research Queries", values: ["25 / month", "Unlimited", "Unlimited"] },
  { label: "Market data latency", values: ["End-of-day", "Real-time", "Real-time + raw feed"] },
  { label: "Portfolio syncs", values: ["1 account", "Unlimited", "Unlimited + multi-seat"] },
  { label: "Alpha Guard alerts", values: ["Basic only", "Full suite", "Custom logic"] },
  { label: "API access", values: [false, false, true] },
  { label: "Support", values: ["Community", "Priority", "24/7 Concierge"] },
  { label: "Advisor / MiFID II tooling", values: [false, false, true] },
];

const PRICING_FAQ = [
  { q: "Can I upgrade or downgrade anytime?", a: "Yes. You can change your subscription tier at any time from your account settings. Prorated adjustments will be reflected in your next billing cycle." },
  { q: "How does the 7-day free trial work?", a: "You get full access to all Pro features for 7 days. No credit card is required. At the end of the trial, your account will simply revert to the Free tier unless you choose to subscribe." },
  { q: "Do you offer annual discounts?", a: "Yes, annual plans are billed once per year and offer roughly 20% off compared to monthly billing." },
  { q: "Where is my data stored?", a: "All Vela.ai data is hosted in the EU (Frankfurt) and encrypted at rest and in transit. You can export or delete it at any time under GDPR Art. 17 & 20." },
];

export default function Pricing() {
  const { user } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const pricingEnabled = useFlag("pricing", false);
  return (
    <div className="vela-landing min-h-screen relative">
      <style>{`
        .vela-landing { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; background:#ffffff; color:#042C53; overflow-x:hidden; }
        .vela-landing .gradient-blob { position:absolute; border-radius:50%; filter:blur(110px); z-index:0; opacity:0.28; animation:vmove 25s infinite alternate; pointer-events:none; }
        .vela-landing .blob-1 { width:800px; height:800px; background:linear-gradient(to right,#185FA5,#378ADD); top:-300px; left:-150px; }
        .vela-landing .blob-2 { width:700px; height:700px; background:linear-gradient(to right,#1D9E75,#378ADD); bottom:5%; right:-150px; animation-delay:-7s; }
        @keyframes vmove { 0%{transform:translate(0,0) scale(1) rotate(0deg);} 100%{transform:translate(150px,100px) scale(1.2) rotate(45deg);} }
        .vela-landing .glass-nav { background:rgba(255,255,255,0.75); backdrop-filter:blur(16px); border-bottom:1px solid rgba(4,44,83,0.06); }
        .vela-landing .glass-card { background:rgba(255,255,255,0.7); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.9); box-shadow:0 10px 40px -10px rgba(4,44,83,0.12); }
        .vela-landing .hero-gradient-text { background:linear-gradient(90deg,#042C53,#185FA5,#378ADD,#1D9E75,#185FA5,#042C53); background-size:300% auto; -webkit-background-clip:text; background-clip:text; color:transparent; animation:vshine 10s linear infinite; }
        @keyframes vshine { to { background-position:300% center; } }
        .vela-landing .button-gradient { background:linear-gradient(135deg,#042C53 0%,#185FA5 50%,#1D9E75 100%); color:#fff; transition:all 0.4s cubic-bezier(0.23,1,0.32,1); }
        .vela-landing .button-gradient:hover { transform:translateY(-2px) scale(1.04); filter:brightness(1.08); box-shadow:0 15px 30px -5px rgba(24,95,165,0.45); }
        .vela-landing .ticker { background:linear-gradient(135deg,rgba(24,95,165,0.08),rgba(29,158,117,0.08)); border:1px solid rgba(24,95,165,0.18); }
        .vela-landing .accordion-content { display:grid; grid-template-rows:0fr; transition:grid-template-rows 0.35s ease; }
        .vela-landing .accordion-content > div { overflow:hidden; }
        .vela-landing .accordion-content.open { grid-template-rows:1fr; }
      `}</style>

      <SEO title="Pricing | Vela.ai" description="Institutional-grade market intelligence scaled for your growth. Start free, upgrade when you're ready for alpha." path="/pricing" />
      <PaymentTestModeBanner />

      <div className="gradient-blob blob-1" />
      <div className="gradient-blob blob-2" />

      {/* NAV */}
      <header className="sticky top-0 z-40 glass-nav">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <VelaLogo size={32} />
          </Link>
          <nav className="hidden md:flex items-center gap-10 text-[11px] font-bold tracking-[0.22em] uppercase" style={{ color: "#6b7a8c" }}>
            <Link to="/#features" className="hover:text-[#042C53] transition">Intelligence</Link>
            <Link to="/#engine" className="hover:text-[#042C53] transition">Alpha Engine</Link>
            <Link to="/pricing" className="hover:text-[#042C53] transition" style={{ color: "#042C53" }}>Pricing</Link>
            <Link to="/#faq" className="hover:text-[#042C53] transition">Resources</Link>
          </nav>
          <div className="flex items-center gap-5">
            <Link to="/auth" className="hidden sm:inline-flex items-center text-[11px] font-bold tracking-[0.22em] uppercase hover:opacity-70 transition" style={{ color: "#042C53" }}>Sign In</Link>
            <Link to="/auth" className="button-gradient inline-flex items-center px-6 py-3 rounded-full text-sm font-semibold shadow-lg">Get Started Free</Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-12 text-center">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold tracking-[0.2em] uppercase ticker" style={{ color: "#185FA5" }}>
          Flexible Tiers
        </span>
        <h1 className="mt-8 text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[0.95]">
          <span className="block" style={{ color: "#042C53" }}>Simple, transparent</span>
          <span className="block hero-gradient-text">pricing.</span>
        </h1>
        <p className="mt-8 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed" style={{ color: "#3d4f66" }}>
          Institutional-grade intelligence scaled for your growth. Start for free, upgrade when you're ready for alpha.
        </p>
      </section>

      {/* PRICING TIERS (shared with landing) */}
      {pricingEnabled ? (
        <>
        <section className="relative z-10 max-w-6xl mx-auto px-6 pb-16">
          <PricingSection />
        </section>

        {/* COMPARISON TABLE */}
        <section className="relative z-10 max-w-6xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: "#1D9E75" }}>Compare Features</div>
          <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight" style={{ color: "#042C53" }}>
            Every capability, side by side
          </h2>
        </div>
        <div className="glass-card rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "linear-gradient(135deg,rgba(24,95,165,0.08),rgba(29,158,117,0.08))" }}>
                  <th className="text-left px-6 py-4 font-bold uppercase tracking-wider text-xs" style={{ color: "#042C53" }}>Capabilities</th>
                  {["Explorer", "Pro", "Enterprise"].map((n) => (
                    <th key={n} className="text-center px-6 py-4 font-bold uppercase tracking-wider text-xs" style={{ color: "#042C53" }}>{n}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr key={row.label} style={{ borderTop: "1px solid rgba(4,44,83,0.06)", background: i % 2 ? "rgba(241,239,232,0.25)" : "transparent" }}>
                    <td className="px-6 py-4 font-medium" style={{ color: "#1f3147" }}>{row.label}</td>
                    {row.values.map((v, j) => (
                      <td key={j} className="px-6 py-4 text-center" style={{ color: "#3d4f66" }}>
                        {typeof v === "boolean" ? (
                          v ? <Check className="h-5 w-5 mx-auto" style={{ color: "#1D9E75" }} /> : <X className="h-5 w-5 mx-auto" style={{ color: "#cbd2da" }} />
                        ) : v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </section>
        </>
      ) : (
        <section className="relative z-10 max-w-4xl mx-auto px-6 pb-16">
          <div className="rounded-3xl p-10 md:p-12 text-white relative overflow-hidden shadow-2xl text-center" style={{ background: "linear-gradient(135deg,#042C53 0%,#185FA5 50%,#1D9E75 100%)" }}>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.22em] uppercase bg-white/15 backdrop-blur">
              Launch Offer · Free Access
            </span>
            <h3 className="mt-4 text-3xl md:text-4xl font-extrabold tracking-tight">Vela.ai is completely free during launch.</h3>
            <p className="mt-3 text-white/85 max-w-2xl mx-auto">Full access to institutional-grade intelligence — no credit card, no plans, no limits. Founding members keep preferred pricing forever when paid tiers launch.</p>
            <div className="mt-7 flex justify-center">
              <Link to="/auth" className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-semibold bg-white text-[#042C53] hover:scale-105 transition">
                Get Started Free <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 py-20">
        <div className="text-center">
          <div className="text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: "#1D9E75" }}>Pricing FAQ</div>
          <h2 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight" style={{ color: "#042C53" }}>
            Questions, answered.
          </h2>
        </div>
        <div className="mt-12 space-y-3">
          {PRICING_FAQ.map((f, i) => {
            const open = openFaq === i;
            return (
              <div key={i} className="glass-card rounded-2xl overflow-hidden">
                <button onClick={() => setOpenFaq(open ? null : i)} className="w-full px-6 py-5 flex items-center justify-between text-left">
                  <span className="font-semibold" style={{ color: "#042C53" }}>{f.q}</span>
                  <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: "#185FA5" }} />
                </button>
                <div className={`accordion-content ${open ? "open" : ""}`}>
                  <div><div className="px-6 pb-5 leading-relaxed" style={{ color: "#3d4f66" }}>{f.a}</div></div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-24 text-center">
        <div className="glass-card rounded-[2rem] p-12 md:p-16">
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight" style={{ color: "#042C53" }}>
            Ready for professional edge?
          </h2>
          <p className="mt-4 text-lg max-w-xl mx-auto" style={{ color: "#3d4f66" }}>
            Join thousands of investors using Vela.ai to navigate the noise and find true alpha.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/auth" className="button-gradient inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold shadow-xl">
              Start 7-day free trial <ArrowRight className="h-4 w-4" />
            </Link>
            {user && <ManageSubscriptionButton variant="outline" size="default" />}
          </div>
          <p className="mt-4 text-xs" style={{ color: "#6b7a8c" }}>No credit card required.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 backdrop-blur-md" style={{ borderTop: "1px solid rgba(4,44,83,0.08)", background: "rgba(255,255,255,0.5)" }}>
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <VelaLogo size={24} />
            <span className="text-xs" style={{ color: "#6b7a8c" }}>© {new Date().getFullYear()} Vela Intelligence Systems. Smart money, amplified.</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm" style={{ color: "#3d4f66" }}>
            <Link to="/" className="hover:underline">Research</Link>
            <Link to="/terms" className="hover:underline">Terms</Link>
            <Link to="/privacy" className="hover:underline">Privacy</Link>
            <Link to="/disclaimer" className="hover:underline">Disclaimer</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}