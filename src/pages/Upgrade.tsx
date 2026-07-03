import { Link, useSearchParams } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Sparkles, Check } from "lucide-react";
import { UpgradeFlow } from "@/components/upgrade/UpgradeFlow";
import { PastDueBanner } from "@/components/billing/PastDueBanner";
import { CurrentPlanBanner } from "@/components/pricing/CurrentPlanBanner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const PLAN_LABELS: Record<string, string> = {
  plus: "Plus",
  pro: "Pro",
  enterprise: "Enterprise",
  elite: "Elite",
  premium: "Premium",
};

const SELF_SERVE_PLANS = [
  { slug: "plus", name: "Plus", description: "Live data, portfolio tracking, alerts, and generous AI research." },
  { slug: "pro", name: "Pro", description: "Advanced analytics, backtesting, reports, and priority AI access." },
] as const;

// Tiers exposed in the on-page plan switcher. Enterprise routes to sales.
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

  const switchPlan = (slug: string) => {
    const next = new URLSearchParams(params);
    next.set("plan", slug);
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
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-muted-foreground">
              Change tier without leaving this page:
            </div>
            <div className="flex flex-wrap gap-2">
              {SWITCHABLE_PLANS.map((p) => {
                const isActive = p.slug === planParam;
                if (p.slug === "enterprise") {
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
          <div className="grid gap-3 sm:grid-cols-2">
            {SELF_SERVE_PLANS.map((plan) => (
              <div key={plan.slug} className="rounded-lg border border-border p-4 flex flex-col gap-3">
                <div>
                  <div className="font-semibold text-base">Vela {plan.name}</div>
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                </div>
                <Button asChild className="mt-auto w-full" variant={plan.slug === "pro" ? "default" : "outline"}>
                  <Link to={`/upgrade?plan=${plan.slug}${cycleQuery}`}>Choose {plan.name}</Link>
                </Button>
              </div>
            ))}
          </div>
          <Button asChild variant="outline" className="mt-3 w-full">
            <Link to="/contact-sales?source=upgrade_enterprise">Talk to us about Enterprise</Link>
          </Button>
        </Card>
      )}
    </div>
  );
}