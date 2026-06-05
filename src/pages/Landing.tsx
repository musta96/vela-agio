import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SEO } from "@/components/SEO";
import VelaLogo from "@/components/VelaLogo";
import SmoothScroll from "@/components/landing/SmoothScroll";
import CinematicScene from "@/components/landing/CinematicScene";
import Reveal from "@/components/landing/Reveal";
import MobilePreview from "@/components/landing/MobilePreview";
import {
  Sparkles, LineChart, Brain, Shield, Target, Zap, BarChart3, BookOpen,
  TrendingUp, Globe, Lock, Check, ArrowRight, Building2, Users, FileText,
  Bell, PieChart, Activity, Star
} from "lucide-react";
import { ICONS, DEFAULT_SECTIONS, mergeWithDefaults, type LandingSectionRow } from "@/data/landingDefaults";
import { useFlag } from "@/hooks/useFeatureFlags";
import { Gift } from "lucide-react";

const Icon = ({ name, className }: { name?: string; className?: string }) => {
  const C = (name && ICONS[name]) || Sparkles;
  return <C className={className} />;
};

// Interpolate {{key}} tokens from globals into any string/object/array.
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

function pickVariant(ab: any): "A" | "B" {
  if (!ab?.enabled) return "A";
  if (ab.winner === "A" || ab.winner === "B") return ab.winner;
  const KEY = "vela_landing_variant";
  try {
    const cached = localStorage.getItem(KEY);
    if (cached === "A" || cached === "B") return cached;
    const v: "A" | "B" = Math.random() * 100 < (ab.split ?? 50) ? "A" : "B";
    localStorage.setItem(KEY, v);
    return v;
  } catch { return "A"; }
}

type Tier = { name: string; price: string; note: string; features: string[]; cta: string; cta_href: string; highlight: boolean };
const FALLBACK_TIERS: Tier[] = [
  { name: "Free", price: "€0", note: "Forever", features: ["Live quotes (delayed)"], cta: "Get started", cta_href: "/auth", highlight: false },
];

export default function Landing() {
  const [tiers, setTiers] = useState<Tier[]>(FALLBACK_TIERS);
  const [sections, setSections] = useState<LandingSectionRow[]>(mergeWithDefaults([]));
  const [seo, setSeo] = useState<any>({});
  const pricingEnabled = useFlag("pricing", false);
  useEffect(() => {
    supabase
      .from("subscription_plans")
      .select("name, price_label, price_period, features, cta_label, cta_href, highlighted, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (data && data.length) {
          setTiers(data.map((p: any) => ({
            name: p.name,
            price: p.price_label,
            note: p.price_period ?? "",
            features: Array.isArray(p.features) ? p.features : [],
            cta: p.cta_label,
            cta_href: p.cta_href || "/auth",
            highlight: !!p.highlighted,
          })));
        }
      });
    (async () => {
      const [secsRes, globalsRes, settingsRes] = await Promise.all([
        (supabase as any).from("landing_sections").select("key, kind, sort_order, enabled, content, variant"),
        (supabase as any).from("landing_globals").select("key, value"),
        (supabase as any).from("landing_settings").select("seo, ab").eq("id", 1).maybeSingle(),
      ]);
      const globals: Record<string, any> = {};
      for (const g of globalsRes.data || []) globals[g.key] = g.value;
      const ab = settingsRes.data?.ab || { enabled: false };
      const chosen = pickVariant(ab);
      const all = (secsRes.data || []) as any[];
      // Prefer chosen variant; fall back to A if a section only exists in one variant.
      const byKey = new Map<string, any>();
      for (const r of all) {
        const existing = byKey.get(r.key);
        if (!existing) byKey.set(r.key, r);
        else if (r.variant === chosen) byKey.set(r.key, r);
      }
      const picked = Array.from(byKey.values()).map((r) => ({ ...r, content: interpolate(r.content, globals) }));
      setSections(mergeWithDefaults(picked).map((s) => ({ ...s, content: interpolate(s.content, globals) })));
      if (settingsRes.data?.seo) setSeo(settingsRes.data.seo);
    })();
  }, []);

  const get = (key: string) => sections.find(s => s.key === key) ?? DEFAULT_SECTIONS.find(s => s.key === key)!;
  const hero = get("hero").content;
  const stats = get("stats").content;
  const features = get("features").content;
  const audiences = get("audiences").content;
  const how = get("how").content;
  const pricing = get("pricing").content;
  const trust = get("trust").content;
  const faq = get("faq").content;
  const ctaBlock = get("cta").content;

  const orderedKeys = sections.map(s => s.key);
  const renderBlock = (key: string) => {
    switch (key) {
      case "hero": return (
        <section key="hero" className="relative overflow-hidden min-h-[92vh] flex items-center">
          <CinematicScene />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.22),transparent_60%)]" />
          <div className="container mx-auto px-6 pt-24 pb-28 text-center max-w-5xl">
            {hero.eyebrow && (
              <Badge variant="outline" className="mb-6 border-primary/30 text-primary backdrop-blur-md bg-background/40 animate-fade-in">
                <Sparkles className="h-3 w-3 mr-1.5" /> {hero.eyebrow}
              </Badge>
            )}
            <Reveal stagger>
              <h1 className="text-4xl sm:text-6xl md:text-8xl font-bold tracking-tight leading-[1] md:leading-[0.95]">
                {hero.title}
              </h1>
              {hero.titleAccent && (
                <h1 className="text-4xl sm:text-6xl md:text-8xl font-bold tracking-tight leading-[1] md:leading-[0.95] bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent mt-2">
                  {hero.titleAccent}
                </h1>
              )}
              {hero.subtitle && <p className="mt-8 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">{hero.subtitle}</p>}
            </Reveal>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              {hero.primaryCta && (
                <Button asChild size="lg" className="text-base shadow-[0_0_40px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_60px_hsl(var(--primary)/0.6)] transition-shadow">
                  <Link to={hero.primaryCta.href || "/auth"}>{hero.primaryCta.label} <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
                </Button>
              )}
              {hero.secondaryCta && (
                <Button asChild variant="outline" size="lg" className="text-base backdrop-blur-md bg-background/40 border-primary/30">
                  <a href={hero.secondaryCta.href || "#features"}>{hero.secondaryCta.label}</a>
                </Button>
              )}
            </div>
            {hero.note && <p className="mt-4 text-xs text-muted-foreground">{hero.note}</p>}
            {Array.isArray(hero.trust) && (
              <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-muted-foreground">
                {hero.trust.map((t: any, i: number) => (
                  <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md bg-background/40 border border-border/50"><Icon name={t.icon} className="h-3.5 w-3.5" /> {t.label}</span>
                ))}
              </div>
            )}
          </div>
        </section>
      );
      case "stats": return (
        <section key="stats" className="border-y border-border bg-card/40">
          <div className="container mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {(stats.items || []).map((s: any, i: number) => (
              <div key={i}>
                <div className="text-2xl md:text-3xl font-bold text-primary">{s.k}</div>
                <div className="text-xs md:text-sm text-muted-foreground mt-1">{s.v}</div>
              </div>
            ))}
          </div>
        </section>
      );
      case "features": return (
        <section key="features" id="features" className="container mx-auto px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{features.title}</h2>
            {features.subtitle && <p className="mt-4 text-muted-foreground">{features.subtitle}</p>}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(features.items || []).map((f: any, i: number) => (
              <Card key={i} className="bg-card/50 border-border hover:border-primary/40 transition-colors">
                <CardContent className="p-6">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                    <Icon name={f.icon} className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      );
      case "audiences": return (
        <section key="audiences" id="audiences" className="bg-card/30 border-y border-border">
          <div className="container mx-auto px-6 py-20 grid md:grid-cols-2 gap-8">
            {(audiences.items || []).map((a: any, i: number) => (
              <Card key={i} className="bg-background border-border">
                <CardContent className="p-8">
                  <div className="flex items-center gap-2 text-primary text-xs font-medium uppercase tracking-wider mb-3">
                    <Icon name={a.icon} className="h-4 w-4" /> {a.tag}
                  </div>
                  <h3 className="text-2xl font-bold">{a.title}</h3>
                  <ul className="mt-5 space-y-2.5">
                    {(a.points || []).map((p: string, j: number) => (
                      <li key={j} className="flex items-start gap-2.5 text-sm">
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
      );
      case "how": return (
        <section key="how" className="container mx-auto px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{how.title}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {(how.items || []).map((s: any, i: number) => (
              <div key={i} className="relative">
                <div className="absolute -top-3 -left-3 h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">{i + 1}</div>
                <Card className="bg-card/50 border-border h-full">
                  <CardContent className="p-6">
                    <Icon name={s.icon} className="h-6 w-6 text-primary mb-3" />
                    <h3 className="font-semibold">{s.title}</h3>
                    <p className="text-sm text-muted-foreground mt-2">{s.desc}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </section>
      );
      case "pricing": return (
        <section key="pricing" id="pricing" className="bg-card/30 border-y border-border">
          <div className="container mx-auto px-6 py-20">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{pricing.title}</h2>
              {pricing.subtitle && <p className="mt-4 text-muted-foreground">{pricing.subtitle}</p>}
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {tiers.map((t) => (
                <Card key={t.name} className={`relative flex flex-col ${t.highlight ? "border-primary ring-1 ring-primary/40 bg-background" : "bg-background border-border"}`}>
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
                      <Link to={t.cta_href || "/auth"}>{t.cta}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            {pricing.footnote && <p className="text-center text-xs text-muted-foreground mt-6">{pricing.footnote}</p>}
          </div>
        </section>
      );
      case "trust": return (
        <section key="trust" className="container mx-auto px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{trust.title}</h2>
            {trust.subtitle && <p className="mt-4 text-muted-foreground">{trust.subtitle}</p>}
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {(trust.items || []).map((x: any, i: number) => (
              <Card key={i} className="bg-card/50 border-border">
                <CardContent className="p-6">
                  <Icon name={x.icon} className="h-6 w-6 text-primary mb-3" />
                  <h3 className="font-semibold">{x.title}</h3>
                  <p className="text-sm text-muted-foreground mt-2">{x.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      );
      case "faq": return (
        <section key="faq" id="faq" className="bg-card/30 border-y border-border">
          <div className="container mx-auto px-6 py-20 max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center">{faq.title}</h2>
            <div className="mt-10 space-y-4">
              {(faq.items || []).map((f: any, i: number) => (
                <Card key={i} className="bg-background border-border">
                  <CardContent className="p-6">
                    <h3 className="font-semibold">{f.q}</h3>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.a}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      );
      case "cta": return (
        <section key="cta" className="container mx-auto px-6 py-20 text-center">
          <div className="max-w-2xl mx-auto">
            <TrendingUp className="h-10 w-10 text-primary mx-auto mb-4" />
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{ctaBlock.title}</h2>
            {ctaBlock.subtitle && <p className="mt-4 text-muted-foreground">{ctaBlock.subtitle}</p>}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              {ctaBlock.primaryCta && (
                <Button asChild size="lg"><Link to={ctaBlock.primaryCta.href || "/auth"}>{ctaBlock.primaryCta.label} <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
              )}
              {ctaBlock.secondaryCta && (
                <Button asChild variant="outline" size="lg"><a href={ctaBlock.secondaryCta.href || "#pricing"}>{ctaBlock.secondaryCta.label}</a></Button>
              )}
            </div>
          </div>
        </section>
      );
      default: return null;
    }
  };

  return (
    <SmoothScroll>
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <SEO
        title={seo.title || "Vela.ai — AI research for serious investors & advisors"}
        description={seo.description || "An educational research platform for FTSE MIB, European and US markets. AI copilot, portfolio coach, optimizer, backtesting and compliance tools — for individuals and professionals."}
        path="/"
      />

      {/* NAV */}
      <header className="sticky top-0 z-40 backdrop-blur bg-background/80 border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center font-semibold tracking-tight">
            <VelaLogo size={28} />
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground px-2 py-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Features</a>
            <a href="#audiences" className="hover:text-foreground px-2 py-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Who it's for</a>
            <a href="#pricing" className="hover:text-foreground px-2 py-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Pricing</a>
            <a href="#faq" className="hover:text-foreground px-2 py-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="min-h-11"><Link to="/auth">Sign in</Link></Button>
            <Button asChild size="sm" className="min-h-11"><Link to="/auth">Get started</Link></Button>
          </div>
        </div>
      </header>
      <MobilePreview />
      {orderedKeys.map((k) => {
        const block = renderBlock(k);
        if (!block || k === "hero") return block;
        return <Reveal key={k}>{block}</Reveal>;
      })}

      {/* FOOTER */}
      <footer className="border-t border-border bg-card/40">
        <div className="container mx-auto px-6 py-10 grid md:grid-cols-4 gap-8 text-sm">
          <div>
            <VelaLogo size={24} />
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
    </SmoothScroll>
  );
}