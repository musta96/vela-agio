import { ReactNode } from "react";
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

  if (gate.entitlements.loading) return null;
  if (gate.has(feature)) return <>{children}</>;
  if (silent) return null;
  if (fallback) return <>{fallback}</>;

  const meta = gate.catalog.find(c => c.key === feature);
  return (
    <>
      <Card className="p-5 text-center space-y-2 border-dashed">
        <div className="mx-auto h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Lock className="h-4 w-4" />
        </div>
        <div className="font-semibold">{meta?.name ?? "Premium feature"}</div>
        {meta?.description && <p className="text-xs text-muted-foreground">{meta.description}</p>}
        <div className="flex justify-center gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={() => gate.promptUpgrade(feature)}>
            Why is this locked?
          </Button>
          <Button asChild size="sm" className="gap-2">
            <Link to="/pricing"><Sparkles className="h-4 w-4" /> Upgrade</Link>
          </Button>
        </div>
      </Card>
      <UpgradeDialog state={gate.prompt} onOpenChange={(open) => gate.setPrompt({ ...gate.prompt, open })} />
    </>
  );
}