import { ReactNode, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { supabase } from "@/integrations/supabase/client";

interface LockedPreviewProps {
  /** Feature key from feature_catalog. When unlocked, `children` renders as-is. */
  feature: string;
  /** The real, un-blurred first section shown to Free users (with numbers already redacted). */
  previewSlot: ReactNode;
  /** The rest of the report — will be rendered blurred + non-interactive on Free. */
  children: ReactNode;
  /** Optional short title shown in the CTA overlay. Defaults to catalog name. */
  title?: string;
  /** Optional supporting copy shown in the CTA overlay. */
  description?: string;
  /** Analytics source label. */
  source?: string;
}

/**
 * Renders `previewSlot` in full, then `children` behind a blur + inline
 * upgrade CTA when the user's plan lacks `feature`. This matches the
 * "30-second clarity" principle: the user always sees what they're paying
 * to unlock (labels, sections, first paragraph) but every number in the
 * blurred section is redacted upstream via `redactNumbers`.
 */
export function LockedPreview({
  feature, previewSlot, children, title, description, source,
}: LockedPreviewProps) {
  const gate = useFeatureGate();
  const unlocked = !gate.entitlements.loading && gate.has(feature);

  const meta = useMemo(() => gate.catalog.find((c) => c.key === feature), [gate.catalog, feature]);
  const target = useMemo(
    () => gate.plans.find((p) => (p.feature_keys ?? []).includes(feature)),
    [gate.plans, feature],
  );

  // Log the block once per mount so admins can measure friction.
  useEffect(() => {
    if (unlocked || gate.entitlements.loading) return;
    void (async () => {
      try {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, feature]);

  if (unlocked) return <>{children}</>;

  return (
    <div className="space-y-4">
      {previewSlot}

      <div className="relative">
        {/* Blurred, non-interactive continuation — numbers should already be redacted. */}
        <div
          className="pointer-events-none select-none"
          aria-hidden="true"
          style={{ filter: "blur(6px)", opacity: 0.55, maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 55%, rgba(0,0,0,0.35) 100%)", WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 55%, rgba(0,0,0,0.35) 100%)" }}
        >
          {children}
        </div>

        {/* Inline CTA — contextual, at the exact point where the paid value lives. */}
        <div className="absolute inset-0 flex items-end justify-center p-4 sm:p-8">
          <Card className="w-full max-w-md p-5 sm:p-6 text-center space-y-3 shadow-xl border-primary/20">
            <div className="mx-auto h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Lock className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-bold">
                {title ?? meta?.name ?? "Unlock the full report"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {description ?? meta?.description ?? "You're viewing a preview. Upgrade to see the full analysis with live numbers."}
              </p>
            </div>
            {target?.name && (
              <div className="text-xs text-muted-foreground">
                Unlocks on <strong className="text-foreground">{target.name}</strong>
                {target.price_label && <span> · {target.price_label}</span>}
              </div>
            )}
            <div className="flex justify-center gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => gate.promptUpgrade(feature)}>
                See what's inside
              </Button>
              <Button asChild size="sm" className="gap-2">
                <Link to={target?.slug ? `/pricing?plan=${encodeURIComponent(target.slug)}${source ? `&source=${encodeURIComponent(source)}` : ""}` : "/pricing"}>
                  <Sparkles className="h-4 w-4" /> {target?.name ? `Upgrade to ${target.name}` : "Upgrade"}
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <UpgradeDialog state={gate.prompt} onOpenChange={(open) => gate.setPrompt({ ...gate.prompt, open })} />
    </div>
  );
}