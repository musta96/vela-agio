import { Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** What kind of AI surface failed, used in the title only. */
  title?: string;
  onRetry?: () => void;
}

/**
 * Friendly fallback for AI surfaces (briefing, copilot, sentiment summary…).
 * Used when the AI provider is unavailable, rate-limited, or the stream
 * failed. Never shows raw error strings to the user.
 */
export function AiFallback({ title = "AI summary unavailable", onRetry }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        {title}
      </div>
      <p className="text-xs text-muted-foreground">
        We couldn't generate this AI summary right now. Your data is unaffected — only the AI commentary is missing. Please try again in a moment.
      </p>
      {onRetry && (
        <div>
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}
    </div>
  );
}