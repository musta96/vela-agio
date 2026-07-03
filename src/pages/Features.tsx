import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Sparkles, ArrowRight, Check, Minus } from "lucide-react";
import { Helmet } from "react-helmet-async";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import VelaLogo from "@/components/VelaLogo";
import { ICONS, DEFAULT_SECTIONS, mergeWithDefaults } from "@/data/landingDefaults";
import { trackLandingEvent } from "@/lib/landingAnalytics";
import { verifyFeaturesCtaBindings } from "@/lib/verifyFeaturesCta";

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

  // Scroll-depth tracking: fire once per threshold (25/50/75/100) per session.
  useEffect(() => {
    const thresholds = [25, 50, 75, 100];
    const fired = new Set<number>();
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop;
      const height = doc.scrollHeight - doc.clientHeight;
      if (height <= 0) return;
      const pct = Math.min(100, Math.round((scrollTop / height) * 100));
      for (const t of thresholds) {
        if (pct >= t && !fired.has(t)) {
          fired.add(t);
          trackLandingEvent("features_scroll_depth", { depth: t });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    verifyFeaturesCtaBindings("Features");
  }, [sections]);

  const get = (key: string) => sections.find((s) => s.key === key) ?? DEFAULT_SECTIONS.find((s) => s.key === key)!;
  const features = get("features").content;
  const items: any[] = features.items || [];

  // -------- Plan comparison matrix ---------------------------------------
  // Kept in sync with src/components/landing/pricing-section.tsx. Values:
  //   true  → included
  //   false → not included
  //   string → tier-specific note (e.g. "25 / mo")
  type PlanKey = "explorer" | "pro" | "enterprise";
  const PLAN_COLUMNS: Array<{ key: PlanKey; name: string; price: string; highlight?: boolean }> = [
    { key: "explorer", name: "Explorer", price: "Free" },
    { key: "pro", name: "Pro", price: "€29 /mo", highlight: true },
    { key: "enterprise", name: "Enterprise", price: "€149 /mo" },
  ];
  type Cell = boolean | string;

  const COMPARISON: Array<{
    category: string;
    rows: Array<{ label: string; hint?: string; values: Record<PlanKey, Cell> }>;
  }> = [
    {
      category: "Market data & research",
      rows: [
        { label: "Market data",         values: { explorer: "Delayed",  pro: "Real-time", enterprise: "Real-time" } },
        { label: "Watchlists",          values: { explorer: "Up to 3",  pro: "Unlimited", enterprise: "Unlimited" } },
        { label: "Screeners & filters", values: { explorer: false,      pro: true,        enterprise: true } },
        { label: "Backtesting engine",  values: { explorer: false,      pro: true,        enterprise: true } },
      ],
    },
    {
      category: "AI copilot",
      rows: [
        { label: "AI summaries",           values: { explorer: "25 / mo", pro: "Unlimited", enterprise: "Unlimited" } },
        { label: "Deep research reports",  values: { explorer: false,     pro: true,        enterprise: true } },
        { label: "Portfolio doctor",       values: { explorer: false,     pro: true,        enterprise: true } },
      ],
    },
    {
      category: "Portfolio & analytics",
      rows: [
        { label: "Manual portfolio tracking", values: { explorer: true,  pro: true, enterprise: true } },
        { label: "Broker connect (read-only)", values: { explorer: false, pro: true, enterprise: true } },
        { label: "DCF / DDM intrinsic value",  values: { explorer: false, pro: true, enterprise: true } },
        { label: "Risk analytics (VaR / Monte Carlo)", values: { explorer: false, pro: true, enterprise: true } },
      ],
    },
    {
      category: "Team, compliance & support",
      rows: [
        { label: "Community access",           values: { explorer: true,  pro: true,  enterprise: true } },
        { label: "Priority support",           values: { explorer: false, pro: true,  enterprise: true } },
        { label: "Advisor seats & MiFID II",   values: { explorer: false, pro: false, enterprise: true } },
        { label: "REST API & WebSocket",       values: { explorer: false, pro: false, enterprise: true } },
        { label: "SSO & audit logs",           values: { explorer: false, pro: false, enterprise: true } },
        { label: "Dedicated success manager",  values: { explorer: false, pro: false, enterprise: true } },
      ],
    },
  ];

  const renderCell = (v: Cell) => {
    if (v === true) {
      return (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "rgba(29,158,117,0.12)" }} aria-label="Included">
          <Check className="h-4 w-4" style={{ color: "#1D9E75" }} />
        </span>
      );
    }
    if (v === false) {
      return (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "rgba(4,44,83,0.05)" }} aria-label="Not included">
          <Minus className="h-4 w-4" style={{ color: "#9aa8b8" }} />
        </span>
      );
    }
    return <span className="text-sm font-medium" style={{ color: "#042C53" }}>{v}</span>;
  };

  return (
    <div className="vela-landing min-h-screen relative" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif", background: "#ffffff", color: "#042C53" }}>
      <SEO
        title="All features · Vela.ai"
        description="Explore the full Vela.ai toolkit — AI research copilot, live markets, portfolio coach, backtesting, sentiment, screeners, alerts, risk analytics and more."
        path="/features"
      />
      <Helmet>
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Vela.ai" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Vela.ai features",
          "itemListElement": items.map((f: any, i: number) => ({
            "@type": "ListItem",
            position: i + 1,
            name: f.title,
            description: f.desc,
          })),
        })}</script>
      </Helmet>

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
        {/* Overview cards — quick scan of what each capability does. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
          {items.map((f: any, i: number) => (
            <article
              key={i}
              className="glass-card p-5 sm:p-7 rounded-3xl flex sm:block gap-4 items-start"
            >
              <div
                className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 rounded-2xl grid place-items-center text-white shadow-lg"
                style={{ background: GRADS[i % GRADS.length] }}
                aria-hidden="true"
              >
                <Icon name={f.icon} className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="sm:mt-5 text-base sm:text-lg lg:text-xl font-bold leading-snug" style={{ color: "#042C53" }}>
                  {f.title}
                </h2>
                <p className="mt-1.5 sm:mt-2 text-sm leading-relaxed" style={{ color: "#3d4f66" }}>
                  {f.desc}
                </p>
              </div>
            </article>
          ))}
        </div>

        {/* Plan comparison matrix — the "which tier gets what" answer. */}
        <div className="mt-16 sm:mt-24">
          <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10">
            <div className="text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: "#1D9E75" }}>
              Compare plans
            </div>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight" style={{ color: "#042C53" }}>
              Exactly what's in each tier
            </h2>
            <p className="mt-3 text-sm sm:text-base" style={{ color: "#3d4f66" }}>
              Every capability, mapped to Explorer, Pro and Enterprise. No fine print.
            </p>
          </div>

          {/* Desktop / tablet: sticky-header matrix table. */}
          <div className="hidden md:block glass-card rounded-3xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ background: "linear-gradient(135deg,rgba(4,44,83,0.04),rgba(29,158,117,0.04))" }}>
                  <th className="py-4 px-6 text-xs font-bold tracking-wider uppercase" style={{ color: "#6b7a8c" }}>
                    Feature
                  </th>
                  {PLAN_COLUMNS.map((p) => (
                    <th key={p.key} className="py-4 px-4 text-center" style={{ color: "#042C53" }}>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`text-sm font-bold ${p.highlight ? "" : ""}`}>{p.name}</span>
                        <span className="text-xs font-medium" style={{ color: p.highlight ? "#1D9E75" : "#6b7a8c" }}>
                          {p.price}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((group) => (
                  <React.Fragment key={group.category}>
                    <tr>
                      <td
                        colSpan={1 + PLAN_COLUMNS.length}
                        className="py-3 px-6 text-[11px] font-bold tracking-[0.2em] uppercase"
                        style={{ background: "rgba(4,44,83,0.03)", color: "#185FA5", borderTop: "1px solid rgba(4,44,83,0.06)" }}
                      >
                        {group.category}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={`${group.category}-${row.label}`} className="border-t" style={{ borderColor: "rgba(4,44,83,0.06)" }}>
                        <td className="py-3 px-6 text-sm" style={{ color: "#1f3147" }}>{row.label}</td>
                        {PLAN_COLUMNS.map((p) => (
                          <td
                            key={p.key}
                            className="py-3 px-4 text-center"
                            style={p.highlight ? { background: "rgba(29,158,117,0.04)" } : undefined}
                          >
                            {renderCell(row.values[p.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: one card per plan, grouped by category. */}
          <div className="md:hidden space-y-5">
            {PLAN_COLUMNS.map((p) => (
              <div
                key={p.key}
                className="glass-card rounded-3xl p-5"
                style={p.highlight ? { border: "1px solid rgba(29,158,117,0.35)" } : undefined}
              >
                <div className="flex items-baseline justify-between mb-3">
                  <div className="text-lg font-bold" style={{ color: "#042C53" }}>{p.name}</div>
                  <div className="text-sm font-semibold" style={{ color: p.highlight ? "#1D9E75" : "#6b7a8c" }}>{p.price}</div>
                </div>
                {COMPARISON.map((group) => (
                  <div key={group.category} className="mt-4">
                    <div className="text-[10px] font-bold tracking-[0.2em] uppercase mb-2" style={{ color: "#185FA5" }}>
                      {group.category}
                    </div>
                    <ul className="space-y-1.5">
                      {group.rows.map((row) => {
                        const v = row.values[p.key];
                        return (
                          <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
                            <span style={{ color: v === false ? "#9aa8b8" : "#1f3147" }}>{row.label}</span>
                            <span className="shrink-0">{renderCell(v)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 sm:mt-16 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/auth"
            onClick={() => trackLandingEvent("landing_get_started_click", { source: "features_footer" })}
            className="button-gradient inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold shadow-lg"
          >
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