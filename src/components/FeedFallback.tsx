import { Inbox, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** What was being loaded, e.g. "movers", "news", "deal flow". */
  label?: string;
  onRetry?: () => void;
}

/**
 * Friendly empty/error fallback for data feeds (movers, news, deal flow,
 * watchlist, etc.) when the underlying provider/edge function fails. Never
 * shows raw error strings to the user.
 */
export function FeedFallback({ label = "data", onRetry }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 flex flex-col items-center text-center gap-2">
      <Inbox className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium">No {label} available right now</p>
      <p className="text-xs text-muted-foreground max-w-sm">
        We couldn't reach the data provider. This is usually temporary - please try again shortly.
      </p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RotateCcw className="h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}