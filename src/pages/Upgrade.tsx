import { Link, useSearchParams } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Sparkles } from "lucide-react";
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

export default function Upgrade() {
  const [params] = useSearchParams();
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
  const cycleQuery = initialCycle ? `&cycle=${initialCycle}` : "";

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
      </div>
      <PastDueBanner />
      <CurrentPlanBanner />
      {planLabel ? (
        <UpgradeFlow
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