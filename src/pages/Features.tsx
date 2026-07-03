import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Sparkles, ArrowRight, Check, Minus, Info, CircleDashed } from "lucide-react";
import { Helmet } from "react-helmet-async";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import VelaLogo from "@/components/VelaLogo";
import { ICONS, DEFAULT_SECTIONS, mergeWithDefaults } from "@/data/landingDefaults";
import { trackLandingEvent } from "@/lib/landingAnalytics";
import { verifyFeaturesCtaBindings } from "@/lib/verifyFeaturesCta";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";

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
  const [selectedPlan, setSelectedPlan] = useState<"explorer" | "pro" | "enterprise">("pro");
  const [onlyDiffs, setOnlyDiffs] = useState(false);

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
  const PLAN_COLUMNS: Array<{ key: PlanKey; name: string; price: string; bestFor: string; highlight?: boolean }> = [
    { key: "explorer", name: "Explorer", price: "Free", bestFor: "Try AI signals and track a small watchlist" },
    { key: "pro", name: "Pro", price: "€29 /mo", bestFor: "Daily research, backtesting and portfolio analytics", highlight: true },
    { key: "enterprise", name: "Enterprise", price: "€149 /mo", bestFor: "Teams, advisors, compliance and API access" },
  ];
  type Cell = boolean | string;

  const COMPARISON: Array<{
    category: string;
    rows: Array<{ label: string; hint?: string; values: Record<PlanKey, Cell> }>;
  }> = [
    {
      category: "Market data & research",
      rows: [
        { label: "Market data",         hint: "Delayed feeds refresh every 15 minutes. Real-time is exchange-live streaming.", values: { explorer: "Delayed",  pro: "Real-time", enterprise: "Real-time" } },
        { label: "Watchlists",          hint: "Custom lists of tickers you can group, alert on and share across devices.",     values: { explorer: "Up to 3",  pro: "Unlimited", enterprise: "Unlimited" } },
        { label: "Screeners & filters", hint: "Multi-factor screeners across fundamentals, technicals and sentiment.",         values: { explorer: false,      pro: true,        enterprise: true } },
        { label: "Backtesting engine",  hint: "Simulate strategies against historical data with slippage and costs modeled.",   values: { explorer: false,      pro: true,        enterprise: true } },
      ],
    },
    {
      category: "AI copilot",
      rows: [
        { label: "AI summaries",           hint: "Short AI-written briefs on tickers, news and filings.",                              values: { explorer: "25 / mo", pro: "Unlimited", enterprise: "Unlimited" } },
        { label: "Deep research reports",  hint: "Multi-page reports combining fundamentals, sentiment, valuation and risk.",         values: { explorer: false,     pro: true,        enterprise: true } },
        { label: "Portfolio doctor",       hint: "AI review of your holdings with concentration, factor and risk suggestions.",       values: { explorer: false,     pro: true,        enterprise: true } },
      ],
    },
    {
      category: "Portfolio & analytics",
      rows: [
        { label: "Manual portfolio tracking",           hint: "Add trades and cash manually to track performance across accounts.",           values: { explorer: true,  pro: true, enterprise: true } },
        { label: "Broker connect (read-only)",          hint: "Sync live positions from your broker. Read-only — Vela never places trades.",   values: { explorer: false, pro: true, enterprise: true } },
        { label: "DCF / DDM intrinsic value",           hint: "Discounted cash-flow and dividend-discount models with editable assumptions.", values: { explorer: false, pro: true, enterprise: true } },
        { label: "Risk analytics (VaR / Monte Carlo)",  hint: "Value-at-Risk and Monte Carlo simulations for portfolio stress-testing.",       values: { explorer: false, pro: true, enterprise: true } },
      ],
    },
    {
      category: "Team, compliance & support",
      rows: [
        { label: "Community access",           hint: "Discord community with other investors and the Vela team.",                                 values: { explorer: true,  pro: true,  enterprise: true } },
        { label: "Priority support",           hint: "Faster email response times with a dedicated queue for paying customers.",                  values: { explorer: false, pro: true,  enterprise: true } },
        { label: "Advisor seats & MiFID II",   hint: "Multi-seat advisor workspace with client mandates and MiFID II-ready audit trails.",         values: { explorer: false, pro: false, enterprise: true } },
        { label: "REST API & WebSocket",       hint: "Programmatic access to Vela data and signals for internal tools or research pipelines.",     values: { explorer: false, pro: false, enterprise: true } },
        { label: "SSO & audit logs",           hint: "SAML / OIDC single sign-on plus tamper-evident audit logs of every user action.",           values: { explorer: false, pro: false, enterprise: true } },
        { label: "Dedicated success manager",  hint: "Named contact for onboarding, training and quarterly reviews.",                             values: { explorer: false, pro: false, enterprise: true } },
      ],
    },
  ];

  const planCoverage = (plan: PlanKey) => {
    const rows = COMPARISON.flatMap((group) => group.rows);
    const included = rows.filter((row) => row.values[plan] !== false).length;
    return `${included}/${rows.length} capabilities`;
  };

  // "Show only differences" filter.
  //
  // A row is a real "difference" when the cell values are meaningfully
  // different across tiers — not just cosmetic variant labels of the same
  // capability. We compare on the tuple (included-boolean, normalised text)
  // so that:
  //   - all-identical rows ("Community access: Included/Included/Included")
  //     are hidden;
  //   - rows with a real included-vs-not-included split
  //     ("Screeners: —/Included/Included") are shown;
  //   - rows where every tier is technically "included" but with a variant
  //     label ("Market data: Delayed/Real-time/Real-time") are ALSO shown,
  //     because the variant IS the difference customers care about;
  //   - rows where every tier has the exact same variant label are hidden.
  //
  // Previously the filter only hid rows where every raw value was byte-for-
  // byte identical, which meant only 2 rows ever disappeared and the toggle
  // looked broken.
  const rowDiffers = (row: { values: Record<PlanKey, Cell> }) => {
    // A row is a "difference" when the tiers do not evaluate to the same
    // access. We compare on the normalised value so:
    //   - Included / Included / Included               → hidden (same)
    //   - Real-time / Real-time / Real-time            → hidden (same)
    //   - Delayed / Real-time / Real-time              → shown (variant differs)
    //   - Not included / Included / Included           → shown (hard split)
    const norm = (v: Cell) =>
      v === true ? "__included__"
      : v === false ? "__not_included__"
      : String(v).trim().toLowerCase();
    const vals = PLAN_COLUMNS.map((p) => norm(row.values[p.key]));
    return new Set(vals).size > 1;
  };
  const FILTERED = onlyDiffs
    ? COMPARISON.map((g) => ({ ...g, rows: g.rows.filter(rowDiffers) })).filter((g) => g.rows.length > 0)
    : COMPARISON;

  // Consistent tint per plan column so users can visually track ownership
  // top-to-bottom on both desktop and mobile.
  const PLAN_TINT: Record<PlanKey, { bg: string; strong: string; accent: string }> = {
    explorer:   { bg: "rgba(4,44,83,0.035)",  strong: "rgba(24,95,165,0.10)",  accent: "#185FA5" },
    pro:        { bg: "rgba(29,158,117,0.06)", strong: "rgba(29,158,117,0.18)", accent: "#1D9E75" },
    enterprise: { bg: "rgba(55,138,221,0.05)", strong: "rgba(55,138,221,0.16)", accent: "#378ADD" },
  };
  // Amber for tier-specific limits/variants so "Limited" reads distinct from "Included".
  const LIMITED_STYLE = { background: "rgba(234,160,32,0.14)", color: "#8a5a00" };

  const renderCell = (v: Cell, plan: PlanKey, compact = false) => {
    const tint = PLAN_TINT[plan];
    if (v === true) {
      return (
        <span
          className={`inline-flex items-center justify-center gap-1.5 rounded-full font-semibold ${compact ? "h-7 w-7" : "px-2.5 py-1 text-xs"}`}
          style={{ background: tint.strong, color: tint.accent }}
          aria-label={`Included in ${plan}`}
        >
          <Check className="h-3.5 w-3.5" />
          {!compact && <span>Included</span>}
        </span>
      );
    }
    if (v === false) {
      return (
        <span
          className={`inline-flex items-center justify-center gap-1.5 rounded-full font-medium ${compact ? "h-7 w-7" : "px-2.5 py-1 text-xs"}`}
          style={{ background: "rgba(4,44,83,0.04)", color: "#a6b0bd" }}
          aria-label={`Not included in ${plan}`}
        >
          <Minus className="h-3.5 w-3.5" />
          {!compact && <span>Not included</span>}
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-bold ${compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs"}`}
        style={LIMITED_STYLE}
        aria-label={`${plan}: limited — ${v}`}
        title={`Limited: ${v}`}
      >
        <CircleDashed className="h-3 w-3" />
        {v}
      </span>
    );
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

          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            {PLAN_COLUMNS.map((p) => {
              const isSelected = selectedPlan === p.key;
              const tint = PLAN_TINT[p.key];
              return (
              <button
                key={p.key}
                type="button"
                onClick={() => setSelectedPlan(p.key)}
                aria-pressed={isSelected}
                className="rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:ring-2"
                style={{
                  borderColor: isSelected ? tint.accent : "rgba(4,44,83,0.1)",
                  background: isSelected
                    ? `linear-gradient(135deg, ${tint.strong}, rgba(255,255,255,0.6))`
                    : "rgba(255,255,255,0.72)",
                  boxShadow: isSelected ? `0 8px 24px -12px ${tint.accent}` : undefined,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-extrabold" style={{ color: "#042C53" }}>{p.name}</h3>
                      {p.highlight && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: "rgba(29,158,117,0.14)", color: "#1D9E75" }}>
                          Best value
                        </span>
                      )}
                      {isSelected && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: tint.strong, color: tint.accent }}>
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-semibold" style={{ color: tint.accent }}>{p.price}</p>
                  </div>
                  <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "rgba(4,44,83,0.06)", color: "#3d4f66" }}>
                    {planCoverage(p.key)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: "#3d4f66" }}>{p.bestFor}</p>
              </button>
            );})}
          </div>

          {/* Legend + controls — clarifies chip meanings and lets users filter. */}
          <div className="mb-4 flex flex-col items-center justify-between gap-3 rounded-2xl border px-4 py-3 md:flex-row" style={{ borderColor: "rgba(4,44,83,0.08)", background: "rgba(255,255,255,0.6)" }}>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs" style={{ color: "#3d4f66" }}>
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6b7a8c" }}>Legend</span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex h-5 items-center justify-center rounded-full px-1.5" style={{ background: "rgba(29,158,117,0.18)", color: "#1D9E75" }}>
                  <Check className="h-3 w-3" />
                </span>
                <span className="font-semibold">Included</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex h-5 items-center justify-center rounded-full px-1.5" style={LIMITED_STYLE}>
                  <CircleDashed className="h-3 w-3" />
                </span>
                <span className="font-semibold">Limited</span>
                <span style={{ color: "#6b7a8c" }}>(cap or variant)</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex h-5 items-center justify-center rounded-full px-1.5" style={{ background: "rgba(4,44,83,0.05)", color: "#a6b0bd" }}>
                  <Minus className="h-3 w-3" />
                </span>
                <span className="font-semibold">Not included</span>
              </span>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold" style={{ color: "#042C53" }}>
              <Switch checked={onlyDiffs} onCheckedChange={setOnlyDiffs} aria-label="Show only differences" />
              Show only differences
            </label>
          </div>

          {/* Desktop / tablet: feature-first matrix with tinted plan columns. */}
          <div className="hidden md:block glass-card rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] table-fixed text-left border-collapse">
                <caption className="sr-only">Feature availability comparison across Explorer, Pro and Enterprise plans</caption>
                <colgroup>
                  <col className="w-[34%]" />
                  {PLAN_COLUMNS.map((p) => (
                    <col key={p.key} className="w-[22%]" />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 z-10 py-5 px-6 align-bottom text-xs font-bold tracking-wider uppercase" style={{ background: "rgba(255,255,255,0.96)", color: "#6b7a8c", borderBottom: "1px solid rgba(4,44,83,0.08)" }}>
                      Capability
                    </th>
                    {PLAN_COLUMNS.map((p) => {
                      const isSel = selectedPlan === p.key;
                      return (
                      <th
                        key={p.key}
                        scope="col"
                        className="py-5 px-5 text-center align-bottom"
                        style={{
                          background: isSel ? PLAN_TINT[p.key].strong : PLAN_TINT[p.key].bg,
                          color: "#042C53",
                          borderBottom: `${isSel ? 3 : 2}px solid ${PLAN_TINT[p.key].accent}`,
                          borderTop: isSel ? `3px solid ${PLAN_TINT[p.key].accent}` : undefined,
                        }}
                      >
                        <div className="flex min-h-[92px] flex-col items-center justify-end gap-1">
                          <div className="mb-1 flex items-center gap-1">
                            {p.highlight && (
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: "rgba(29,158,117,0.18)", color: "#1D9E75" }}>
                                Most popular
                              </span>
                            )}
                            {isSel && (
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: PLAN_TINT[p.key].accent, color: "#fff" }}>
                                Selected
                              </span>
                            )}
                          </div>
                          <span className="text-base font-extrabold">{p.name} <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#6b7a8c" }}>tier</span></span>
                          <span className="text-sm font-bold" style={{ color: PLAN_TINT[p.key].accent }}>{p.price}</span>
                          <span className="max-w-[180px] text-xs leading-snug" style={{ color: "#6b7a8c" }}>{p.bestFor}</span>
                        </div>
                      </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {FILTERED.length === 0 && (
                    <tr>
                      <td colSpan={1 + PLAN_COLUMNS.length} className="py-10 text-center text-sm" style={{ color: "#6b7a8c" }}>
                        All plans include the same features. Turn off "Show only differences" to see the full list.
                      </td>
                    </tr>
                  )}
                  {FILTERED.map((group, gi) => (
                    <React.Fragment key={group.category}>
                      <tr>
                        <th
                          scope="rowgroup"
                          colSpan={1 + PLAN_COLUMNS.length}
                          className="py-3 px-6 text-[11px] font-bold tracking-[0.22em] uppercase"
                          style={{
                            background: "linear-gradient(90deg,rgba(4,44,83,0.06),rgba(4,44,83,0.02))",
                            color: "#042C53",
                            borderTop: gi === 0 ? "none" : "1px solid rgba(4,44,83,0.08)",
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: "#1D9E75" }} aria-hidden="true" />
                            {group.category}
                          </span>
                        </th>
                      </tr>
                      {group.rows.map((row, ri) => (
                        <tr
                          key={`${group.category}-${row.label}`}
                          style={{ background: ri % 2 === 1 ? "rgba(4,44,83,0.015)" : undefined }}
                        >
                          <th
                            scope="row"
                            className="sticky left-0 py-4 px-6 text-sm font-semibold"
                            style={{
                              background: ri % 2 === 1 ? "rgba(248,249,251,1)" : "rgba(255,255,255,1)",
                              color: "#1f3147",
                              borderTop: "1px solid rgba(4,44,83,0.06)",
                            }}
                          >
                            <span className="flex items-center gap-1.5">
                              <span>{row.label}</span>
                              {row.hint && (
                                <TooltipProvider delayDuration={100}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button type="button" className="inline-flex" aria-label={`What is ${row.label}`}>
                                        <Info className="h-3.5 w-3.5" style={{ color: "#a6b0bd" }} />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs text-xs leading-snug">
                                      {row.hint}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </span>
                          </th>
                          {PLAN_COLUMNS.map((p) => {
                            const isSel = selectedPlan === p.key;
                            return (
                            <td
                              key={p.key}
                              className="py-4 px-5 text-center align-middle"
                              style={{
                                background: isSel ? PLAN_TINT[p.key].strong : PLAN_TINT[p.key].bg,
                                borderTop: "1px solid rgba(4,44,83,0.06)",
                                borderLeft: isSel ? `2px solid ${PLAN_TINT[p.key].accent}` : undefined,
                                borderRight: isSel ? `2px solid ${PLAN_TINT[p.key].accent}` : undefined,
                              }}
                            >
                              {renderCell(row.values[p.key], p.key)}
                            </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: per-feature stacked rows — each feature lists all three
              tiers on their own labeled line so ownership is unambiguous. */}
          <div className="md:hidden space-y-6">
            {FILTERED.length === 0 && (
              <p className="text-center text-sm" style={{ color: "#6b7a8c" }}>
                All plans include the same features. Turn off "Show only differences" to see the full list.
              </p>
            )}
            {FILTERED.map((group) => (
              <section key={group.category} className="glass-card rounded-3xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 text-[10px] font-bold tracking-[0.22em] uppercase" style={{ background: "linear-gradient(90deg,rgba(4,44,83,0.07),rgba(4,44,83,0.02))", color: "#042C53" }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#1D9E75" }} aria-hidden="true" />
                  {group.category}
                </div>
                <div className="divide-y" style={{ borderColor: "rgba(4,44,83,0.06)" }}>
                  {group.rows.map((row) => (
                    <article key={row.label} className="px-4 py-4">
                      <div className="flex items-start gap-1.5 text-sm font-bold leading-snug" style={{ color: "#042C53" }}>
                        <span>{row.label}</span>
                        {row.hint && (
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="mt-0.5 inline-flex" aria-label={`What is ${row.label}`}>
                                  <Info className="h-3.5 w-3.5" style={{ color: "#a6b0bd" }} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-xs leading-snug">
                                {row.hint}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <ul className="mt-3 space-y-1.5">
                        {PLAN_COLUMNS.map((p) => {
                          const isSel = selectedPlan === p.key;
                          return (
                          <li
                            key={p.key}
                            className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                            style={{
                              background: isSel ? PLAN_TINT[p.key].strong : PLAN_TINT[p.key].bg,
                              borderLeft: `${isSel ? 5 : 3}px solid ${isSel ? PLAN_TINT[p.key].accent : PLAN_TINT[p.key].strong}`,
                            }}
                          >
                            <span className="min-w-0 flex items-baseline gap-2">
                              <span className="text-[13px] font-extrabold" style={{ color: PLAN_TINT[p.key].accent }}>
                                {p.name}{isSel && <span className="ml-1 text-[9px] uppercase tracking-wider" style={{ color: PLAN_TINT[p.key].accent }}>· selected</span>}
                              </span>
                              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#6b7a8c" }}>
                                {p.price.replace(" /mo", "")}
                              </span>
                            </span>
                            <span className="shrink-0">{renderCell(row.values[p.key], p.key)}</span>
                          </li>
                          );
                        })}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
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