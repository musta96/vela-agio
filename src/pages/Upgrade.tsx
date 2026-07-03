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

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0 max-w-3xl mx-auto">
      <SEO title="Upgrade to Pro | Vela" description="Unlock every Pro feature. See your current usage and pick monthly or annual billing." path="/upgrade" />
      <PageHeader
        icon={Sparkles}
        title="Upgrade to Pro"
        description="Everything you're missing, side-by-side with what you're using today."
      />
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