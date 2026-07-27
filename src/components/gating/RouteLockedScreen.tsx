import { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Lock, Sparkles, Check, ShieldCheck, Zap, TrendingUp, Star, ArrowRight, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { deriveGateMeta } from "@/lib/gating/routeFeatureMap";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  feature: string;
}

/**
 * Full-page marketing screen shown when a user lands on a route their
 * plan doesn't cover. The route is navigable (so we get proper URL /
 * bookmarking / share behaviour) but the value is gated behind an
 * upgrade CTA that leans on standard sales patterns:
 *   • clear feature name + outcome-oriented pitch
 *   • what's inside (3 benefit tiles derived from the catalog)
 *   • full plan feature checklist (pulled from subscription_plans)
 *   • pricing anchor + primary CTA to /upgrade
 *   • secondary "See what's inside" that opens the inline modal
 *   • trust bar (money-back, cancel anytime, SOC-friendly copy)
 */
export function RouteLockedScreen({ feature }: Props) {
  const gate = useFeatureGate();
  const location = useLocation();
  const meta = useMemo(
    () => deriveGateMeta(feature, gate.catalog, gate.plans),
    [feature, gate.catalog, gate.plans],
  );
  const target = meta.targetPlan;
  const targetPlanFull = useMemo(
    () => gate.plans.find((p) => p.slug === target?.slug) ?? null,
    [gate.plans, target?.slug],
  );

  // A short curated list of *other* premium features included in the same
  // plan — expands the perceived value beyond the one blocked feature.
  const bundledFeatures = useMemo(() => {
    const keys = (targetPlanFull?.feature_keys ?? []).filter((k) => k !== feature);
    const byKey = new Map(gate.catalog.map((c) => [c.key, c]));
    return keys
      .map((k) => byKey.get(k))
      .filter(Boolean)
      .slice(0, 8) as { key: string; name: string; description: string | null }[];
  }, [targetPlanFull, gate.catalog, feature]);

  // Best-effort audit — fire once per mount per feature key.
  useEffect(() => {
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from("feature_gate_blocks").insert({
          user_id: user.id,
          feature_key: feature,
          current_tier: gate.entitlements.tier,
          current_plan_slug: gate.entitlements.planSlug,
          page_path: location.pathname,
        });
      } catch { /* best-effort */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature]);

  const upgradeHref = target?.slug
    ? `/upgrade?plan=${encodeURIComponent(target.slug)}&source=locked-route&feature=${encodeURIComponent(feature)}`
    : "/upgrade";

  const isEnterprise = /enterprise/i.test(target?.name ?? "");
  const accent = isEnterprise
    ? {
        chipBg: "bg-[hsl(258_90%_66%/0.18)] text-[hsl(258_95%_82%)] ring-[hsl(258_90%_66%/0.45)]",
        glow: "from-[hsl(258_90%_66%/0.35)] via-[hsl(258_90%_66%/0.10)] to-transparent",
        dot: "bg-[hsl(258_95%_72%)]",
      }
    : {
        chipBg: "bg-[hsl(38_92%_55%/0.18)] text-[hsl(38_95%_72%)] ring-[hsl(38_92%_55%/0.45)]",
        glow: "from-[hsl(38_92%_55%/0.35)] via-[hsl(38_92%_55%/0.10)] to-transparent",
        dot: "bg-[hsl(38_95%_72%)]",
      };

  return (
    <div
      data-route-locked
      data-feature-key={feature}
      className="relative min-h-[calc(100vh-4rem)] w-full overflow-hidden px-4 py-10 sm:px-8 sm:py-14"
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        className={cn("pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full blur-3xl bg-gradient-to-b", accent.glow)}
      />

      <div className="relative mx-auto flex max-w-6xl flex-col gap-10">
        {/* Hero */}
        <div className="text-center space-y-4">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ring-1 ring-inset",
              accent.chipBg,
            )}
          >
            <Lock className="h-3 w-3" />
            {target?.name ? `${target.name} feature` : "Premium feature"}
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Unlock {meta.name}
          </h1>
          {meta.description && (
            <p className="mx-auto max-w-2xl text-base text-muted-foreground">
              {meta.description}
            </p>
          )}

          {/* Primary CTA row */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button asChild size="lg" className="gap-2 shadow-lg">
              <Link to={upgradeHref}>
                <Sparkles className="h-4 w-4" />
                {target?.name ? `Upgrade to ${target.name}` : "Upgrade"}
                {target?.priceLabel && (
                  <span className="ml-1 text-xs opacity-80">· {target.priceLabel}</span>
                )}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => gate.promptUpgrade(feature)}
            >
              See what's inside
            </Button>
          </div>

          {/* Trust bar */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Cancel anytime</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Instant access on upgrade</span>
            <span className="inline-flex items-center gap-1.5"><Star className="h-3.5 w-3.5" /> Trusted by active investors</span>
          </div>
        </div>

        {/* Benefit tiles */}
        <div className="grid gap-4 sm:grid-cols-3">
          <BenefitTile
            icon={<Zap className="h-5 w-5" />}
            title="Institutional depth"
            body="Purpose-built quant models, event studies and risk engines usually reserved for desks."
          />
          <BenefitTile
            icon={<TrendingUp className="h-5 w-5" />}
            title="Actionable in minutes"
            body="Skip the setup — Vela wires your portfolio into the model and returns decisions, not homework."
          />
          <BenefitTile
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Backed by your data"
            body="Every recommendation is auditable, sourced, and grounded in your own holdings and tolerance."
          />
        </div>

        {/* Plan card + bundle */}
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <Card className="relative overflow-hidden p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Recommended plan</div>
                <div className="mt-1 text-2xl font-bold">{target?.name ?? "Pro"}</div>
                {target?.priceLabel && (
                  <div className="mt-1 text-sm text-muted-foreground">{target.priceLabel}</div>
                )}
              </div>
              <Badge variant="secondary" className={cn("ring-1 ring-inset", accent.chipBg)}>
                Most popular
              </Badge>
            </div>

            <ul className="mt-6 space-y-2.5 text-sm">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span><strong>{meta.name}</strong> — the feature you just tried to open</span>
              </li>
              {bundledFeatures.map((f) => (
                <li key={f.key} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{f.name}</span>
                </li>
              ))}
              {!bundledFeatures.length && (
                <li className="text-muted-foreground">Plus the full premium toolkit.</li>
              )}
            </ul>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to={upgradeHref}>
                  <Sparkles className="h-4 w-4" />
                  Start on {target?.name ?? "Pro"}
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link to="/pricing">Compare plans</Link>
              </Button>
            </div>
          </Card>

          <Card className="p-6 sm:p-8 space-y-4">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Why investors upgrade</div>
            <blockquote className="text-sm leading-relaxed">
              “Vela turned three afternoons of spreadsheet work into a five-minute
              decision. The advanced analytics paid for the whole year on the
              first rebalance.”
              <footer className="mt-2 text-xs text-muted-foreground">— Active investor, private beta</footer>
            </blockquote>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat value="5×" label="Faster decisions" />
              <Stat value="24/7" label="AI copilot" />
              <Stat value="0€" label="Setup" />
            </div>
            <div className="pt-1 text-xs text-muted-foreground">
              You're currently on <span className="font-medium text-foreground">{gate.entitlements.planName ?? "Free"}</span>.
              Upgrade takes under a minute and you'll land right back on this page.
            </div>
          </Card>
        </div>
      </div>

      <UpgradeDialog
        state={gate.prompt}
        onOpenChange={(open) => gate.setPrompt({ ...gate.prompt, open })}
      />
    </div>
  );
}

function BenefitTile({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="p-5 space-y-2">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-muted-foreground">{body}</p>
    </Card>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-2 py-3">
      <div className="text-lg font-bold leading-none">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

export default RouteLockedScreen;