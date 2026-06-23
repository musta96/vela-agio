import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Check, ArrowUpRight, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type UpgradePromptState = {
  open: boolean;
  featureKey?: string;
  featureName?: string;
  featureDescription?: string;
  requiredPlanName?: string | null;
  requiredPlanSlug?: string | null;
  requiredPlanPrice?: string | null;
  currentPlanName?: string | null;
  currentTier?: string | null;
};

interface Props {
  state: UpgradePromptState;
  onOpenChange: (open: boolean) => void;
}

export function UpgradeDialog({ state, onOpenChange }: Props) {
  const required = state.requiredPlanName ?? "a higher plan";
  const noUpgrade = !state.requiredPlanName;
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            {state.featureName ? `${state.featureName} is locked` : "Upgrade required"}
          </DialogTitle>
          <DialogDescription>
            {state.featureDescription ?? `This feature isn't included in your current plan.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Side-by-side: current vs required */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Your plan</div>
              <div className="font-semibold mt-1">{state.currentPlanName ?? "Free"}</div>
              {state.currentTier && <Badge variant="outline" className="mt-1 text-[10px] capitalize">{state.currentTier}</Badge>}
            </div>
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 relative">
              <div className="text-[10px] uppercase tracking-wider text-primary">Unlocks on</div>
              <div className="font-semibold mt-1">{state.requiredPlanName ?? "Higher tier"}</div>
              {state.requiredPlanPrice && <div className="text-xs text-muted-foreground mt-1">{state.requiredPlanPrice}</div>}
              <ArrowUpRight className="h-3.5 w-3.5 text-primary absolute top-2 right-2" />
            </div>
          </div>

          {state.featureKey && (
            <div className="flex items-start gap-2 text-xs rounded-md border bg-muted/20 p-2.5">
              <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <div>
                <span className="text-muted-foreground">Feature key:</span>{" "}
                <code className="font-mono text-[11px]">{state.featureKey}</code>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button asChild className="gap-2" disabled={noUpgrade}>
            <Link
              to={state.requiredPlanSlug ? `/pricing?plan=${encodeURIComponent(state.requiredPlanSlug)}` : "/pricing"}
              onClick={() => onOpenChange(false)}
            >
              <Sparkles className="h-4 w-4" />
              {state.requiredPlanName ? `Upgrade to ${state.requiredPlanName}` : "See plans"}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}