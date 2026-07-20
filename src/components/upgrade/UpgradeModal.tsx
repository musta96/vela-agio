import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UpgradeFlow } from "./UpgradeFlow";
import { CurrentPlanBanner } from "@/components/pricing/CurrentPlanBanner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureKey?: string;
  featureName?: string;
  /** Path to return to after successful upgrade — defaults to current path. */
  returnPath?: string;
}

/**
 * Contextual upgrade modal used by paywall triggers. On successful upgrade
 * Stripe redirects back to `returnPath`, so the user lands on the content
 * they were trying to access — not a generic dashboard.
 */
export function UpgradeModal({ open, onOpenChange, featureKey, featureName, returnPath }: Props) {
  // Track the element that had focus when the dialog opened so we can hand
  // focus back to it after close. Without this, keyboard users get dumped on
  // <body> because the modal is triggered imperatively (no DialogTrigger for
  // Radix's FocusScope to point at).
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) {
        returnFocusRef.current = active;
      }
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef.current;
          if (target && document.body.contains(target)) {
            event.preventDefault();
            target.focus();
          }
          returnFocusRef.current = null;
        }}
      >
        <DialogHeader>
          <DialogTitle>Upgrade to Vela Pro</DialogTitle>
        </DialogHeader>
        <div className="mb-3">
          <CurrentPlanBanner compact />
        </div>
        <UpgradeFlow
          contextFeatureKey={featureKey}
          contextFeatureName={featureName}
          returnPath={returnPath}
          compact
        />
      </DialogContent>
    </Dialog>
  );
}