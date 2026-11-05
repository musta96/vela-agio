import { Link, useSearchParams } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Sparkles, Check } from "lucide-react";
import { UpgradeFlow } from "@/components/upgrade/UpgradeFlow";
import { PastDueBanner } from "@/components/billing/PastDueBanner";
import { CurrentPlanBanner } from "@/components/pricing/CurrentPlanBanner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PLAN_FEATURES } from "@/lib/planFeatures";
import { PUBLIC_PLAN_BULLETS } from "@/data/publicPlanCatalog";

const PLAN_LABELS: Record<string, string> = {
  plus: "Plus",
  pro: "Pro",
  enterprise: "Enterprise",
  elite: "Elite",
  premium: "Premium",
};

// Slugs only — names, prices, audiences and feature lists come from
// PLAN_FEATURES so the chooser can never drift from the plan catalogue.
const SELF_SERVE_PLANS = ["plus", "pro", "enterprise"] as const;

// Tiers exposed in the on-page plan switcher.
const SWITCHABLE_PLANS = [
  { slug: "plus", name: "Plus" },
  { slug: "pro", name: "Pro" },
  { slug: "enterprise", name: "Enterprise" },
] as const;


export default function Upgrade() {
  const [params, setParams] = useSearchParams();
  const feature = params.get("feature") ?? undefined;
  const featureName = params.get("featureName") ?? undefined;
  const returnPath = params.get("return") ?? undefined;
  const cycleParam = params.get("cycle");
  const initialCycle = cycleParam === "monthly" || cycleParam === "annual" ? cycleParam : undefined;
  const planParam = (params.get("plan") || "").toLowerCase();
  const planLabel = PLAN_LABELS[planParam];
  const title = planLabel ? `Upgrade to ${planLabel}` : "Choose a plan";
  const description = planLabel
    ? `Everything you're missing on ${planLabel}, side-by-side with what you're using today.`
    : "Compare the available tiers first, then pick the plan you want to start checkout.";
  const selectedLabel = planLabel ?? "Choose a plan";
  const cycleLabel = initialCycle === "annual" ? "Annual" : initialCycle === "monthly" ? "Monthly" : null;
  const cycleQuery = initialCycle ? `&cycle=${initialCycle}` : "";

  // Free-tier CTA is derived from PLAN_FEATURES rather than hardcoding the
  // "explorer" slug — whichever plan carries `.explorer` becomes the free
  // fallback the chooser links to.
  const freeTierPlan = (Object.values(PLAN_FEATURES).find((p) => p.explorer)) ?? null;

  const switchPlan = (slug: string) => {
    const next = new URLSearchParams(params);
    next.set("plan", slug);
    setParams(next, { replace: true });
  };

  const switchCycle = (cycle: "monthly" | "annual") => {
    const next = new URLSearchParams(params);
    next.set("cycle", cycle);
    setParams(next, { replace: true });
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0 max-w-3xl mx-auto">
      <SEO title={`${title} | Vela`} description="Compare plans and pick monthly or annual billing." path="/upgrade" />
      <PageHeader icon={Sparkles} title={title} description={description} />
      <div
        role="status"
        aria-live="polite"
        data-testid="upgrade-selected-summary"
        className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm"
      >
        You selected: <span className="font-semibold text-primary">{selectedLabel}</span>
        {cycleLabel && (
          <>
            {" · "}
            <span data-testid="upgrade-selected-cycle" className="font-semibold text-primary">{cycleLabel}</span>
            <span className="text-muted-foreground"> billing</span>
          </>
        )}
      </div>
      {planLabel && (
        <Card className="p-3" data-testid="upgrade-plan-switcher">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-muted-foreground">
                Change tier without leaving this page:
              </div>
              <div className="flex flex-wrap gap-2">
              {SWITCHABLE_PLANS.map((p) => {
                const isActive = p.slug === planParam;
                if (PLAN_FEATURES[p.slug].contactSales) {
                  return (
                    <Button
                      key={p.slug}
                      asChild
                      size="sm"
                      variant="outline"
                      data-testid="switch-plan-enterprise"
                    >
                      <Link to="/contact-sales?source=upgrade_switcher">Talk to sales · Enterprise</Link>
                    </Button>
                  );
                }
                return (
                  <Button
                    key={p.slug}
                    type="button"
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                    onClick={() => switchPlan(p.slug)}
                    data-testid={`switch-plan-${p.slug}`}
                    aria-pressed={isActive}
                    className="gap-1"
                  >
                    {isActive && <Check className="h-3.5 w-3.5" />} {p.name}
                  </Button>
                );
              })}
              </div>
            </div>
          </div>
        </Card>
      )}
      <PastDueBanner />
      <CurrentPlanBanner />
      {planLabel ? (
        <UpgradeFlow
          key={`${planParam}-${initialCycle ?? "default"}`}
          contextFeatureKey={feature}
          contextFeatureName={featureName}
          returnPath={returnPath}
          initialCycle={initialCycle}
          initialPlanSlug={planParam}
        />
      ) : (
        <Card className="p-4 sm:p-5" data-testid="upgrade-plan-chooser">
          <div className="grid gap-3 sm:grid-cols-3">
            {SELF_SERVE_PLANS.map((slug) => {
              const plan = PLAN_FEATURES[slug];
              return (
                <div
                  key={slug}
                  className={`rounded-lg border p-4 flex flex-col gap-3 ${
                    PLAN_FEATURES[slug].highlighted ? "border-primary/50 bg-primary/5" : "border-border"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-base">Vela {plan.name}</div>
                        {plan.highlighted && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full bg-primary/15 text-primary px-2 py-0.5">
                            Most popular
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-lg font-semibold">€{plan.priceMonthly}</span>
                        <span className="text-[11px] text-muted-foreground">/mo</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{plan.audience}</p>
                    {/* Stacking line makes the tier order explicit: each card
                        names the tier it builds on, so Pro > Plus is obvious. */}
                    <p className="text-xs font-medium mt-2" data-testid={`upgrade-tier-stacking-${slug}`}>
                      {PUBLIC_PLAN_BULLETS[slug][0]}
                    </p>
                  </div>
                  <Button asChild className="mt-auto w-full" variant={plan.highlighted ? "default" : "outline"}>
                    <Link to={`/upgrade?plan=${slug}${cycleQuery}`}>Choose {plan.name}</Link>
                  </Button>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-center text-xs text-muted-foreground">
            Need more than 3 advisor seats or a custom rollout?{" "}
            <Link to="/contact-sales?source=upgrade_enterprise" className="font-medium text-primary underline-offset-2 hover:underline">
              Talk to us about Enterprise
            </Link>
          </div>

          {freeTierPlan && (
            <div className="mt-3 text-center text-xs text-muted-foreground">
              Not ready to upgrade?{" "}
              <Link
                to={freeTierPlan.ctaHref}
                data-testid="upgrade-free-tier-link"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {freeTierPlan.cta} on {freeTierPlan.name}
              </Link>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}