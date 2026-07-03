import { useSearchParams } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Sparkles } from "lucide-react";
import { UpgradeFlow } from "@/components/upgrade/UpgradeFlow";
import { PastDueBanner } from "@/components/billing/PastDueBanner";
import { CurrentPlanBanner } from "@/components/pricing/CurrentPlanBanner";

export default function Upgrade() {
  const [params] = useSearchParams();
  const feature = params.get("feature") ?? undefined;
  const featureName = params.get("featureName") ?? undefined;
  const returnPath = params.get("return") ?? undefined;
  const cycleParam = params.get("cycle");
  const initialCycle = cycleParam === "monthly" || cycleParam === "annual" ? cycleParam : undefined;
  const planParam = (params.get("plan") || "").toLowerCase();
  const PLAN_LABELS: Record<string, string> = {
    plus: "Plus",
    pro: "Pro",
    elite: "Elite",
    premium: "Premium",
  };
  const planLabel = PLAN_LABELS[planParam];
  const title = planLabel ? `Upgrade to ${planLabel}` : "Upgrade your plan";
  const description = planLabel
    ? `Everything you're missing on ${planLabel}, side-by-side with what you're using today.`
    : "Compare plans side-by-side with what you're using today, then pick the right fit.";

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0 max-w-3xl mx-auto">
      <SEO title={`${title} | Vela`} description="Compare plans and pick monthly or annual billing." path="/upgrade" />
      <PageHeader icon={Sparkles} title={title} description={description} />
      <PastDueBanner />
      <CurrentPlanBanner />
      <UpgradeFlow
        contextFeatureKey={feature}
        contextFeatureName={featureName}
        returnPath={returnPath}
        initialCycle={initialCycle}
      />
    </div>
  );
}