import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import VelaLogo from "@/components/VelaLogo";
import { ICONS, DEFAULT_SECTIONS, mergeWithDefaults } from "@/data/landingDefaults";

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

const GRADS = [
  "linear-gradient(135deg,#042C53,#185FA5)",
  "linear-gradient(135deg,#185FA5,#378ADD)",
  "linear-gradient(135deg,#378ADD,#7CD0AE)",
  "linear-gradient(135deg,#1D9E75,#7CD0AE)",
  "linear-gradient(135deg,#042C53,#378ADD)",
  "linear-gradient(135deg,#185FA5,#1D9E75)",
  "linear-gradient(135deg,#1D9E75,#042C53)",
  "linear-gradient(135deg,#378ADD,#185FA5)",
];

export default function Features() {
  const [sections, setSections] = useState(mergeWithDefaults([]));

  useEffect(() => {
    (async () => {
      const [secsRes, globalsRes] = await Promise.all([
        (supabase as any).from("landing_sections").select("key, kind, sort_order, enabled, content, variant"),
        (supabase as any).from("landing_globals").select("key, value"),
      ]);
      const globals: Record<string, any> = {};
      for (const g of globalsRes.data || []) globals[g.key] = g.value;
      const all = (secsRes.data || []) as any[];
      const byKey = new Map<string, any>();
      for (const r of all) if (!byKey.has(r.key)) byKey.set(r.key, r);
      const picked = Array.from(byKey.values()).map((r) => ({ ...r, content: interpolate(r.content, globals) }));
      setSections(mergeWithDefaults(picked).map((s) => ({ ...s, content: interpolate(s.content, globals) })));
    })();
  }, []);

  const get = (key: string) => sections.find((s) => s.key === key) ?? DEFAULT_SECTIONS.find((s) => s.key === key)!;
  const features = get("features").content;
  const items: any[] = features.items || [];

  return (
    <div className="vela-landing min-h-screen relative" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif", background: "#ffffff", color: "#042C53" }}>
      <SEO
        title="All features · Vela.ai"
        description="Explore the full Vela.ai toolkit — AI research copilot, live markets, portfolio coach, backtesting, sentiment, screeners, alerts, risk analytics and more."
        path="/features"
      />

      <style>{`
        .vela-landing .glass-card { background:rgba(255,255,255,0.72); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); border:1px solid rgba(255,255,255,0.9); box-shadow:0 10px 40px -10px rgba(4,44,83,0.12); transition:transform 0.4s cubic-bezier(0.23,1,0.32,1), box-shadow 0.4s ease, background 0.4s ease; }
        .vela-landing .glass-card:hover { transform:translateY(-8px); box-shadow:0 20px 60px -10px rgba(4,44,83,0.2); background:rgba(255,255,255,0.92); }
        .vela-landing .glass-nav { background:rgba(255,255,255,0.82); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); border-bottom:1px solid rgba(4,44,83,0.06); }
        .vela-landing .button-gradient { background:linear-gradient(135deg,#042C53 0%,#185FA5 50%,#1D9E75 100%); color:#fff; transition:all 0.3s ease; }
        .vela-landing .button-gradient:hover { transform:translateY(-2px); filter:brightness(1.08); box-shadow:0 15px 30px -5px rgba(24,95,165,0.45); }
        .vela-landing .ghost-btn { background:rgba(255,255,255,0.65); backdrop-filter:blur(12px); border:1px solid rgba(4,44,83,0.12); color:#042C53; transition:all .3s ease; }
        .vela-landing .ghost-btn:hover { background:rgba(255,255,255,0.95); border-color:rgba(24,95,165,0.4); }
      `}</style>

      <header className="sticky top-0 z-40 glass-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 h-16 sm:h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <VelaLogo size={32} />
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <Link to="/auth" className="hidden sm:inline-flex items-center text-xs font-medium hover:underline transition" style={{ color: "#3d4f66" }}>
              Sign in
            </Link>
            <Link to="/auth" className="button-gradient inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full text-xs font-semibold shadow-lg">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 md:pt-24 pb-8 sm:pb-12">
        <div className="text-center max-w-3xl mx-auto">
          <div className="text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: "#1D9E75" }}>
            Full feature breakdown
          </div>
          <h1 className="mt-3 text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight" style={{ color: "#042C53" }}>
            Everything inside Vela.ai
          </h1>
          <p className="mt-4 text-base sm:text-lg" style={{ color: "#3d4f66" }}>
            AI research, live markets, portfolio analytics, backtesting, sentiment, screeners, alerts and risk tools — all under one roof.
          </p>
        </div>
      </section>

      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20 md:pb-24">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {items.map((f: any, i: number) => (
            <div key={i} className="glass-card p-6 sm:p-8 rounded-3xl">
              <div className="h-12 w-12 rounded-2xl grid place-items-center text-white shadow-lg" style={{ background: GRADS[i % GRADS.length] }}>
                <Icon name={f.icon} className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-lg sm:text-xl font-bold" style={{ color: "#042C53" }}>{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "#3d4f66" }}>{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 sm:mt-16 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/auth" className="button-gradient inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold shadow-lg">
            Get started free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/pricing" className="ghost-btn inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold">
            See pricing <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/" className="text-sm font-medium hover:underline" style={{ color: "#185FA5" }}>
            Back to home
          </Link>
        </div>
      </section>
    </div>
  );
}