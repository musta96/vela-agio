import { ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles } from "lucide-react";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { UpgradeDialog } from "@/components/UpgradeDialog";

interface Props {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
  /** Render the inline upgrade card (default) or null when blocked. */
  silent?: boolean;
}

/**
 * Renders `children` only when the user's plan unlocks `feature`. Otherwise
 * shows a compact upgrade card (or the provided `fallback`) and surfaces
 * the shared upgrade dialog when "See plans" is clicked.
 */
export function FeatureGate({ feature, children, fallback, silent }: Props) {
  const gate = useFeatureGate();
  const blocked = !gate.entitlements.loading && !gate.has(feature);

  // Audit: log every block (silent or visible). Hook dedupes per 5 min.
  useEffect(() => {
    if (blocked) {
      // Lazy-load the block, the gate hook already debounces.
      // Re-using promptUpgrade would open the dialog, so call the lower-level audit via a no-op prompt.
      // Instead we briefly create the prompt state without opening it.
      void (async () => {
        try {
          // Use the public surface: just trigger promptUpgrade silently when not visible.
          // For the inline upgrade card the user will see the prompt only if they click —
          // logging here ensures we still capture the block event.
          const { supabase } = await import("@/integrations/supabase/client");
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          await supabase.from("feature_gate_blocks").insert({
            user_id: user.id,
            feature_key: feature,
            current_tier: gate.entitlements.tier,
            current_plan_slug: gate.entitlements.planSlug,
            page_path: typeof window !== "undefined" ? window.location.pathname : null,
          });
        } catch { /* best-effort */ }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked, feature]);

  if (gate.entitlements.loading && !gate.entitlements.featureKeys.size) {
    // Cached entitlements would have set featureKeys; otherwise render fallback to avoid flicker.
    return silent ? null : (fallback ? <>{fallback}</> : (
      <Card className="p-5 text-center border-dashed animate-pulse">
        <div className="h-4 w-24 bg-muted mx-auto rounded" />
      </Card>
    ));
  }
  if (gate.has(feature)) return <>{children}</>;
  if (silent) return null;
  if (fallback) return <>{fallback}</>;

  const meta = gate.catalog.find(c => c.key === feature);
  const target = gate.plans.find(p => (p.feature_keys ?? []).includes(feature));
  return (
    <>
      <Card className="p-5 text-center space-y-2 border-dashed">
        <div className="mx-auto h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Lock className="h-4 w-4" />
        </div>
        <div className="font-semibold">{meta?.name ?? "Premium feature"}</div>
        {meta?.description && <p className="text-xs text-muted-foreground">{meta.description}</p>}
        {target?.name && (
          <div className="text-xs text-muted-foreground">
            Unlocks on <strong className="text-foreground">{target.name}</strong>
            {target.price_label && <span className="text-muted-foreground"> · {target.price_label}</span>}
          </div>
        )}
        <div className="flex justify-center gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={() => gate.promptUpgrade(feature)}>
            Details
          </Button>
          <Button asChild size="sm" className="gap-2">
            <Link to={target?.slug ? `/upgrade?plan=${encodeURIComponent(target.slug)}` : "/upgrade"}>
              <Sparkles className="h-4 w-4" /> {target?.name ? `Upgrade to ${target.name}` : "Upgrade"}
            </Link>
          </Button>
        </div>
      </Card>
      <UpgradeDialog state={gate.prompt} onOpenChange={(open) => gate.setPrompt({ ...gate.prompt, open })} />
    </>
  );
}