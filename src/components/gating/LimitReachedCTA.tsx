import { Link } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Inline card shown next to an "Add" action when the user has hit a numeric
 * plan cap (watchlist, positions, portfolios). Non-punitive tone.
 */
export function LimitReachedCTA({
  title, description, unlocksOn = "Pro", source, planSlug = "pro",
}: {
  title: string;
  description: string;
  unlocksOn?: string;
  source?: string;
  planSlug?: string;
}) {
  return (
    <Card className="p-4 border-dashed flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
        <Lock className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Button asChild size="sm" className="gap-2 shrink-0">
        <Link to={`/pricing?plan=${encodeURIComponent(planSlug)}${source ? `&source=${encodeURIComponent(source)}` : ""}`}>
          <Sparkles className="h-4 w-4" /> Upgrade to {unlocksOn}
        </Link>
      </Button>
    </Card>
  );
}