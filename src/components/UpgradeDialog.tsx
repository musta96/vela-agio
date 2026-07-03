import { UpgradeModal } from "@/components/upgrade/UpgradeModal";

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
  /** Path to return to after successful upgrade. Defaults to current URL. */
  returnPath?: string;
};

interface Props {
  state: UpgradePromptState;
  onOpenChange: (open: boolean) => void;
}

/**
 * Contextual paywall trigger. Opens the in-app upgrade flow inline (modal)
 * instead of navigating to a marketing pricing page. After successful
 * upgrade the user returns directly to the content they were trying to
 * access via the `returnPath` on the state.
 */
export function UpgradeDialog({ state, onOpenChange }: Props) {
  return (
    <UpgradeModal
      open={state.open}
      onOpenChange={onOpenChange}
      featureKey={state.featureKey}
      featureName={state.featureName ?? state.featureDescription}
      returnPath={state.returnPath}
    />
  );
}