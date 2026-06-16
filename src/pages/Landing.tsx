import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import VelaLogo from "@/components/VelaLogo";
import {
  Sparkles, ArrowRight, ChevronDown, Brain, Activity, Shield, TrendingUp, Star,
} from "lucide-react";
import { ICONS, DEFAULT_SECTIONS, mergeWithDefaults, type LandingSectionRow } from "@/data/landingDefaults";

const Icon = ({ name, className }: { name?: string; className?: string }) => {
  const C = (name && ICONS[name]) || Sparkles;
  return <C className={className} />;
};

function interpolate(value: any, globals: Record<string, any>): any {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k) => {
      const v = globals[k];
      return v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, globals));
  if (value && typeof value === "object") {
    const out: any = {};
    for (const k of Object.keys(value)) out[k] = interpolate(value[k], globals);
    return out;
  }
  return value;
}

export default function Landing() {
  const [sections, setSections] = useState<LandingSectionRow[]>(mergeWithDefaults([]));
  const [seo, setSeo] = useState<any>({});
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    (async () => {
      const [secsRes, globalsRes, settingsRes] = await Promise.all([
        (supabase as any).from("landing_sections").select("key, kind, sort_order, enabled, content, variant"),
        (supabase as any).from("landing_globals").select("key, value"),
        (supabase as any).from("landing_settings").select("seo").eq("id", 1).maybeSingle(),
      ]);
      const globals: Record<string, any> = {};
      for (const g of globalsRes.data || []) globals[g.key] = g.value;
      const all = (secsRes.data || []) as any[];
      const byKey = new Map<string, any>();
      for (const r of all) if (!byKey.has(r.key)) byKey.set(r.key, r);
      const picked = Array.from(byKey.values()).map((r) => ({ ...r, content: interpolate(r.content, globals) }));
      setSections(mergeWithDefaults(picked).map((s) => ({ ...s, content: interpolate(s.content, globals) })));
      if (settingsRes.data?.seo) setSeo(settingsRes.data.seo);
    })();
  }, []);

  const get = (key: string) => sections.find(s => s.key === key) ?? DEFAULT_SECTIONS.find(s => s.key === key)!;
  const hero = get("hero").content;
  const features = get("features").content;
  const trust = get("trust").content;
  const faq = get("faq").content;
  const ctaBlock = get("cta").content;

  const featureIcons = [Brain, Activity, Shield];

  return (
    <div className="vela-landing min-h-screen relative">
      <style>{`
        /* Vela.ai brand palette
           Navy #042C53 · Ocean #185FA5 · Sky #378ADD · Teal #1D9E75 · Seafoam #7CD0AE · Sand #F1EFE8 */
        .vela-landing { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; background:#F1EFE8; color:#042C53; overflow-x:hidden; }
        .vela-landing .gradient-blob { position:absolute; border-radius:50%; filter:blur(110px); z-index:0; opacity:0.45; animation:vmove 25s infinite alternate; pointer-events:none; }
        .vela-landing .blob-1 { width:800px; height:800px; background:linear-gradient(to right,#185FA5,#378ADD); top:-300px; left:-150px; }
        .vela-landing .blob-2 { width:700px; height:700px; background:linear-gradient(to right,#1D9E75,#378ADD); bottom:5%; right:-150px; animation-delay:-7s; }
        .vela-landing .blob-3 { width:600px; height:600px; background:linear-gradient(to right,#378ADD,#7CD0AE); top:30%; left:15%; animation-delay:-12s; opacity:0.35; }
        @keyframes vmove { 0%{transform:translate(0,0) scale(1) rotate(0deg);} 100%{transform:translate(150px,100px) scale(1.2) rotate(45deg);} }
        .vela-landing .glass-nav { background:rgba(241,239,232,0.75); backdrop-filter:blur(16px); border-bottom:1px solid rgba(4,44,83,0.06); }
        .vela-landing .hero-gradient-text { background:linear-gradient(90deg,#042C53,#185FA5,#378ADD,#1D9E75,#185FA5,#042C53); background-size:300% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; color:transparent; animation:vshine 10s linear infinite; }
        @keyframes vshine { to { background-position:300% center; } }
        .vela-landing .glass-card { background:rgba(255,255,255,0.7); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.9); box-shadow:0 10px 40px -10px rgba(4,44,83,0.12); transition:all 0.5s cubic-bezier(0.23,1,0.32,1); }
        .vela-landing .glass-card:hover { transform:translateY(-12px) scale(1.02); box-shadow:0 20px 60px -10px rgba(4,44,83,0.2); background:rgba(255,255,255,0.92); }
        .vela-landing .button-gradient { background:linear-gradient(135deg,#042C53 0%,#185FA5 50%,#1D9E75 100%); color:#fff; transition:all 0.4s cubic-bezier(0.23,1,0.32,1); }
        .vela-landing .button-gradient:hover { transform:translateY(-2px) scale(1.04); filter:brightness(1.08); box-shadow:0 15px 30px -5px rgba(24,95,165,0.45); }
        .vela-landing .ghost-btn { background:rgba(255,255,255,0.65); backdrop-filter:blur(12px); border:1px solid rgba(4,44,83,0.12); color:#042C53; transition:all .3s ease; }
        .vela-landing .ghost-btn:hover { background:rgba(255,255,255,0.95); transform:translateY(-1px); border-color:rgba(24,95,165,0.4); }
        .vela-landing .float-slow { animation:vfloat 6s ease-in-out infinite; }
        .vela-landing .float-delayed { animation:vfloat 7s ease-in-out infinite -3s; }
        @keyframes vfloat { 0%,100%{transform:translateY(0) rotate(3deg);} 50%{transform:translateY(-20px) rotate(5deg);} }
        .vela-landing .accordion-content { display:grid; grid-template-rows:0fr; transition:grid-template-rows 0.35s ease; }
        .vela-landing .accordion-content > div { overflow:hidden; }
        .vela-landing .accordion-content.open { grid-template-rows:1fr; }
        .vela-landing .logo-strip { filter:grayscale(1); opacity:.55; transition:all .3s ease; }
        .vela-landing .logo-strip:hover { filter:none; opacity:1; }
        .vela-landing .ticker { background:linear-gradient(135deg,rgba(24,95,165,0.08),rgba(29,158,117,0.08)); border:1px solid rgba(24,95,165,0.18); }
      `}</style>

      <SEO
        title={seo.title || "Vela.ai — Market Intelligence Simplified"}
        description={seo.description || "Industrial-grade AI to decode market velocity. Research like the elite — alpha signals, real-time flows and risk shielding."}
        path="/"
      />

      {/* Animated background */}
      <div className="gradient-blob blob-1" />
      <div className="gradient-blob blob-2" />
      <div className="gradient-blob blob-3" />

      {/* NAV */}
      <header className="glass-nav sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <VelaLogo size={28} />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-slate-900 transition">Intelligence</a>
            <a href="#engine" className="hover:text-slate-900 transition">Alpha Engine</a>
            <a href="#pricing" className="hover:text-slate-900 transition">Pricing</a>
            <a href="#faq" className="hover:text-slate-900 transition">Resources</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="hidden sm:inline-flex items-center px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition">Sign In</Link>
            <Link to="/auth" className="button-gradient inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg">Get Started Free</Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-24 text-center">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold tracking-[0.2em] text-purple-700 ticker uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-pink-500 animate-pulse" />
          {hero.eyebrow || "GENESIS v4.0 NOW LIVE"}
        </span>
        <h1 className="mt-8 text-5xl sm:text-7xl md:text-8xl font-extrabold tracking-tight leading-[0.95]">
          <span className="block text-slate-900">{hero.title || "Research like"}</span>
          <span className="block hero-gradient-text">{hero.titleAccent || "the elite."}</span>
        </h1>
        <p className="mt-8 text-lg md:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
          {hero.subtitle || "The playground of high-frequency precision. Vela leverages industrial-grade AI to decode market velocity for everyone."}
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to={hero.primaryCta?.href || "/auth"} className="button-gradient inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold shadow-xl">
            {hero.primaryCta?.label || "Start Alpha Hunt"} <ArrowRight className="h-4 w-4" />
          </Link>
          <a href={hero.secondaryCta?.href || "#features"} className="ghost-btn inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold">
            {hero.secondaryCta?.label || "Watch Performance"}
          </a>
        </div>

        {/* Floating stat cards */}
        <div className="mt-16 relative max-w-4xl mx-auto h-48 hidden md:block">
          <div className="glass-card absolute left-0 top-4 px-6 py-5 rounded-2xl float-slow">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 grid place-items-center text-white">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div className="text-left">
                <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">Alpha Signal</div>
                <div className="text-2xl font-bold text-emerald-600">+14.2%</div>
              </div>
            </div>
          </div>
          <div className="glass-card absolute right-0 top-2 px-6 py-5 rounded-2xl float-delayed">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 grid place-items-center text-white">
                <Shield className="h-5 w-5" />
              </div>
              <div className="text-left">
                <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">Risk Index</div>
                <div className="text-2xl font-bold text-slate-900">SECURE</div>
              </div>
            </div>
          </div>
          <div className="glass-card absolute left-1/2 -translate-x-1/2 bottom-0 px-6 py-5 rounded-2xl float-slow">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 grid place-items-center text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="text-left">
                <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">AI Coverage</div>
                <div className="text-2xl font-bold text-slate-900">12,400+</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PARTNERS STRIP */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        <div className="text-center text-[11px] font-bold tracking-[0.25em] text-slate-500 uppercase">Institutional Liquidity Partners</div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 logo-strip">
          {["Bloomberg","Goldman","BlackRock","J.P. Morgan","Vanguard"].map(n => (
            <span key={n} className="text-lg font-bold tracking-tight text-slate-700">{n}</span>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 py-24">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
            {features.title || "Hyper-targeted Intelligence"}
          </h2>
          <p className="mt-4 text-slate-600 text-lg">
            {features.subtitle || "Our engines don't just find data. They find actionable alpha across trillions of variables."}
          </p>
        </div>
        <div className="mt-14 grid md:grid-cols-3 gap-6">
          {(features.items || []).slice(0, 3).map((f: any, i: number) => {
            const IC = featureIcons[i] || Sparkles;
            const grads = [
              "from-pink-500 to-purple-600",
              "from-blue-500 to-cyan-400",
              "from-purple-500 to-indigo-600",
            ];
            const metrics = [
              ["99.8% ACCURACY", "4.2s LATENCY"],
              ["LIVE STREAM", "MILSEC SPEED"],
              ["SOC2 TYPE II", "AUTO-HEDGE"],
            ];
            return (
              <div key={i} className="glass-card group p-8 rounded-3xl">
                <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${grads[i]} grid place-items-center text-white shadow-lg`}>
                  {f.icon ? <Icon name={f.icon} className="h-7 w-7" /> : <IC className="h-7 w-7" />}
                </div>
                <h3 className="mt-6 text-xl font-bold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-slate-600 leading-relaxed">{f.desc}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {(metrics[i] || []).map((m) => (
                    <span key={m} className="text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full bg-slate-900/5 text-slate-700">{m}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="engine" className="relative z-10 max-w-7xl mx-auto px-6 py-24">
        <div className="text-center max-w-2xl mx-auto">
          <div className="text-[11px] font-bold tracking-[0.25em] text-purple-600 uppercase">Voices of Alpha</div>
          <h2 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
            {trust.title || "Trusted by the boldest."}
          </h2>
        </div>
        <div className="mt-14 grid md:grid-cols-3 gap-6">
          {(trust.items || []).slice(0, 3).map((t: any, i: number) => (
            <div key={i} className="glass-card p-8 rounded-3xl">
              <div className="flex gap-1 text-amber-400">
                {[...Array(5)].map((_, j) => <Star key={j} className="h-4 w-4 fill-current" />)}
              </div>
              <p className="mt-5 text-slate-700 text-lg leading-relaxed">
                "{t.desc || t.title}"
              </p>
              <div className="mt-6 pt-5 border-t border-slate-900/5">
                <div className="font-bold text-slate-900">{t.author || t.title || "Vela User"}</div>
                <div className="text-xs font-medium tracking-wider text-slate-500 uppercase mt-0.5">{t.role || t.title}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative z-10 max-w-3xl mx-auto px-6 py-24">
        <div className="text-center">
          <div className="text-[11px] font-bold tracking-[0.25em] text-purple-600 uppercase">Common Queries</div>
          <h2 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
            {faq.title || "Everything you need to know."}
          </h2>
        </div>
        <div className="mt-12 space-y-3">
          {(faq.items || []).map((f: any, i: number) => {
            const open = openFaq === i;
            return (
              <div key={i} className="glass-card rounded-2xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(open ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left"
                >
                  <span className="font-semibold text-slate-900">{f.q}</span>
                  <ChevronDown className={`h-5 w-5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                <div className={`accordion-content ${open ? "open" : ""}`}>
                  <div><div className="px-6 pb-5 text-slate-600 leading-relaxed">{f.a}</div></div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-24 text-center">
        <div className="glass-card rounded-[2rem] p-12 md:p-16">
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
            {ctaBlock.title || "Ready to amplify your edge?"}
          </h2>
          {ctaBlock.subtitle && <p className="mt-4 text-lg text-slate-600 max-w-xl mx-auto">{ctaBlock.subtitle}</p>}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={ctaBlock.primaryCta?.href || "/auth"} className="button-gradient inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold shadow-xl">
              {ctaBlock.primaryCta?.label || "Create free account"} <ArrowRight className="h-4 w-4" />
            </Link>
            <a href={ctaBlock.secondaryCta?.href || "#pricing"} className="ghost-btn inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold">
              {ctaBlock.secondaryCta?.label || "See pricing"}
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-slate-900/5 bg-white/60 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <VelaLogo size={24} />
            <span className="text-xs text-slate-500">© {new Date().getFullYear()} Vela Intelligence Systems. Smart money, amplified.</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
            <Link to="/" className="hover:text-slate-900">Research</Link>
            <Link to="/terms" className="hover:text-slate-900">Terms</Link>
            <Link to="/privacy" className="hover:text-slate-900">Privacy</Link>
            <Link to="/disclaimer" className="hover:text-slate-900">Disclaimer</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
