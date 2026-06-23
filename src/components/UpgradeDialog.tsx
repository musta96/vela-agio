import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Check } from "lucide-react";

export type UpgradePromptState = {
  open: boolean;
  featureKey?: string;
  featureName?: string;
  featureDescription?: string;
  requiredPlanName?: string | null;
  requiredPlanSlug?: string | null;
  currentPlanName?: string | null;
};

interface Props {
  state: UpgradePromptState;
  onOpenChange: (open: boolean) => void;
}

export function UpgradeDialog({ state, onOpenChange }: Props) {
  const required = state.requiredPlanName ?? "a higher plan";
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {state.featureName ? `Unlock ${state.featureName}` : "Upgrade required"}
          </DialogTitle>
          <DialogDescription>
            {state.featureDescription
              ?? `This feature is available on the ${required}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <span>Included on <strong>{required}</strong></span>
          </div>
          {state.currentPlanName && (
            <div className="text-xs text-muted-foreground">
              Your current plan: <strong>{state.currentPlanName}</strong>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button asChild className="gap-2">
            <Link
              to={state.requiredPlanSlug ? `/pricing?plan=${encodeURIComponent(state.requiredPlanSlug)}` : "/pricing"}
              onClick={() => onOpenChange(false)}
            >
              <Sparkles className="h-4 w-4" /> See upgrade options
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}