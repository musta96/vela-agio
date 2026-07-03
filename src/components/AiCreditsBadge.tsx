import { Link } from "react-router-dom";
import { Sparkles, KeyRound, Crown, Infinity as InfinityIcon } from "lucide-react";
import { useAiCredits } from "@/hooks/useAiCredits";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  compact?: boolean;
  className?: string;
}

/**
 * Compact pill showing how many monthly AI credits the user has used vs. their plan cap.
 * - BYO key  → "Own key · unlimited"
 * - Paid + cap → "123 / 500 AI credits"  (amber ≥80%, red when exhausted)
 * - Free / no AI → "AI not in plan" link to /pricing
 * Non-AI features are unaffected by this — paper trading and the rest of the app keep working.
 */
export function AiCreditsBadge({ compact = false, className = "" }: Props) {
  const { status, loading, unlimited, hasCap, used, limit, pctUsed, exhausted } = useAiCredits();

  if (loading && !status) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground ${className}`}>
        <Sparkles className="h-3 w-3" /> …
      </span>
    );
  }
  if (!status) return null;

  // BYO key → unmetered
  if (unlimited) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 text-success px-2 py-0.5 text-[10px] font-medium ${className}`}>
              <KeyRound className="h-3 w-3" />
              {compact ? "BYO" : "Own key · unlimited"}
            </span>
          </TooltipTrigger>
          <TooltipContent>You're using your own API key — no monthly cap applies.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // No AI in plan
  if (!hasCap && status.source !== "beta") {
    return (
      <Link
        to="/upgrade"
        className={`inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 text-warning px-2 py-0.5 text-[10px] font-medium hover:bg-warning/20 ${className}`}
        title="Your current plan doesn't include AI credits. Upgrade to unlock the assistant."
      >
        <Sparkles className="h-3 w-3" /> AI not in plan
      </Link>
    );
  }

  // Unlimited beta override
  if (status.source === "beta" && !hasCap) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium ${className}`}>
        <InfinityIcon className="h-3 w-3" /> Beta · unmetered
      </span>
    );
  }

  const tone = exhausted
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : pctUsed >= 80
    ? "border-warning/30 bg-warning/10 text-warning"
    : "border-border bg-muted/40 text-foreground/80";

  const Icon = status.source === "paid" ? Crown : Sparkles;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/settings?tab=Billing"
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium hover:opacity-80 ${tone} ${className}`}
          >
            <Icon className="h-3 w-3" />
            {compact ? `${used}/${limit}` : `${used} / ${limit} AI credits`}
          </Link>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px] text-xs">
          <div className="font-medium capitalize">{status.tier} plan · {pctUsed}% used</div>
          <div className="mt-0.5 text-muted-foreground">
            {exhausted
              ? "You've hit your monthly AI cap. Paper trading and the rest of the app keep working — upgrade or add your own API key to use the AI again."
              : `${(limit as number) - used} AI credits left this month. Renews on the 1st.`}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}