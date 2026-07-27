import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Lock, Sparkles, ArrowRight } from "lucide-react";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { deriveGateMeta } from "@/lib/gating/routeFeatureMap";
import { trackLockedRouteCta } from "@/lib/gating/gatingAnalytics";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
}

/**
 * "See what's inside" modal. Given the feature the user tried to reach,
 * lists every catalog entry included in the cheapest plan that unlocks
 * it — split into "you're missing" (not in current entitlements) and
 * "already yours" (already covered). Renders a personalized upgrade
 * path (current plan → required plan) with a direct CTA.
 */
export function MissingFeaturesModal({ open, onOpenChange, feature }: Props) {
  const gate = useFeatureGate();
  const meta = useMemo(
    () => deriveGateMeta(feature, gate.catalog, gate.plans),
    [feature, gate.catalog, gate.plans],
  );
  const targetPlan = useMemo(
    () => gate.plans.find((p) => p.slug === meta.targetPlan?.slug) ?? null,
    [gate.plans, meta.targetPlan?.slug],
  );

  const { missing, included } = useMemo(() => {
    const catalogByKey = new Map(gate.catalog.map((c) => [c.key, c]));
    const planKeys = targetPlan?.feature_keys ?? [];
    const missing: typeof gate.catalog = [];
    const included: typeof gate.catalog = [];
    for (const k of planKeys) {
      const entry = catalogByKey.get(k);
      if (!entry) continue;
      if (gate.entitlements.featureKeys.has(k)) included.push(entry);
      else missing.push(entry);
    }
    // Sort by catalog order (already sorted), but pin the blocked
    // feature to the top of "missing" for context.
    missing.sort((a, b) => (a.key === feature ? -1 : b.key === feature ? 1 : 0));
    return { missing, included };
  }, [gate.catalog, gate.entitlements.featureKeys, targetPlan, feature]);

  useEffect(() => {
    if (!open) return;
    trackLockedRouteCta({
      feature,
      cta: "see_whats_inside",
      planSlug: gate.entitlements.planSlug,
      requiredPlanSlug: meta.targetPlan?.slug ?? null,
      pathname: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  }, [open, feature, gate.entitlements.planSlug, meta.targetPlan?.slug]);

  const upgradeHref = meta.targetPlan?.slug
    ? `/upgrade?plan=${encodeURIComponent(meta.targetPlan.slug)}&source=missing-features-modal&feature=${encodeURIComponent(feature)}`
    : "/upgrade";

  const currentPlanName = gate.entitlements.planName ?? "Free";
  const requiredPlanName = meta.targetPlan?.name ?? "Pro";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" /> {currentPlanName}
            </Badge>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <Badge className="gap-1">
              <Sparkles className="h-3 w-3" /> {requiredPlanName}
            </Badge>
          </div>
          <DialogTitle>What you'll get with {requiredPlanName}</DialogTitle>
          <DialogDescription>
            You tried to open <strong>{meta.name}</strong>. Here's every feature
            you're missing on your current {currentPlanName} plan — and everything
            already included.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              You're missing {missing.length} {missing.length === 1 ? "feature" : "features"}
            </h3>
            {missing.length ? (
              <ul className="space-y-2">
                {missing.map((f) => (
                  <li
                    key={f.key}
                    className={
                      "flex items-start gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm " +
                      (f.key === feature ? "ring-1 ring-primary/40" : "")
                    }
                  >
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <div className="font-medium">
                        {f.name}
                        {f.key === feature && (
                          <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                            You just tried this
                          </span>
                        )}
                      </div>
                      {f.description && (
                        <div className="text-xs text-muted-foreground">{f.description}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                You already have every feature this plan includes.
              </p>
            )}
          </section>

          {included.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Already yours ({included.length})
              </h3>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {included.map((f) => (
                  <li key={f.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span>{f.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
          <Button variant="ghost" asChild>
            <Link
              to="/pricing"
              onClick={() =>
                trackLockedRouteCta({
                  feature,
                  cta: "compare_plans",
                  planSlug: gate.entitlements.planSlug,
                  requiredPlanSlug: meta.targetPlan?.slug ?? null,
                  target: "/pricing",
                })
              }
            >
              Compare plans
            </Link>
          </Button>
          <Button asChild className="gap-2">
            <Link
              to={upgradeHref}
              onClick={() =>
                trackLockedRouteCta({
                  feature,
                  cta: "primary_upgrade",
                  planSlug: gate.entitlements.planSlug,
                  requiredPlanSlug: meta.targetPlan?.slug ?? null,
                  target: upgradeHref,
                })
              }
            >
              <Sparkles className="h-4 w-4" />
              Upgrade to {requiredPlanName}
              {meta.targetPlan?.priceLabel && (
                <span className="text-xs opacity-80">· {meta.targetPlan.priceLabel}</span>
              )}
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default MissingFeaturesModal;