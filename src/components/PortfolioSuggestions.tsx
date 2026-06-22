import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, RefreshCw, ArrowRight, AlertTriangle, TrendingUp, Scale, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type SuggestionsHolding = { symbol: string; name: string; shares: number; avg_price: number };

type SellSignal = {
  symbol: string;
  action: string;
  trim_pct?: number;
  urgency?: "high" | "medium" | "low";
  rationale: string;
};
type Improvement = { title: string; type: string; detail: string };
type AdvisorResp = {
  sell_signals?: SellSignal[];
  improvements?: Improvement[];
  portfolio_summary?: { concentration_risk?: string; sector_tilt?: string; goal_fit?: string };
  error?: string;
};

const ACTION_LABEL: Record<string, string> = {
  consider_reducing_fully: "Consider reducing",
  consider_trimming: "Consider trimming",
  appears_stable: "Appears stable",
  consider_increasing: "Consider adding",
  // legacy fallbacks from older runs
  sell_all: "Consider reducing",
  trim: "Consider trimming",
  hold: "Appears stable",
  add: "Consider adding",
};
const URGENCY_BADGE: Record<string, string> = {
  high: "bg-destructive/15 text-destructive border-destructive/30",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

function cacheKey(portfolioId?: string | null, holdings?: SuggestionsHolding[]) {
  const sig = (holdings ?? []).map((h) => `${h.symbol}:${h.shares}`).sort().join("|");
  return `vela:suggestions:${portfolioId ?? "all"}:${sig}`;
}

export function PortfolioSuggestions({
  holdings,
  portfolioId,
  portfolioName,
  compact = false,
}: {
  holdings: SuggestionsHolding[];
  portfolioId?: string | null;
  portfolioName?: string;
  compact?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AdvisorResp | null>(null);
  const key = cacheKey(portfolioId, holdings);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) setResult(JSON.parse(raw));
      else setResult(null);
    } catch { setResult(null); }
  }, [key]);

  const run = async () => {
    if (!holdings.length) { toast.error("Add at least one holding first"); return; }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("advisor", {
        body: { holdings, goals: { description: "general balanced growth" }, riskProfile: "balanced", lang: "en" },
      });
      if (error) throw error;
      if (data?.error === "rate_limited") { toast.error("Rate limited. Try again shortly."); return; }
      if (data?.error === "credits_exhausted") { toast.error("AI credits are unavailable. Check Plans & billing or add your own key in Settings → Connections."); return; }
      setResult(data);
      try { sessionStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not generate suggestions");
    } finally { setRunning(false); }
  };

  const topSignals = (result?.sell_signals ?? []).slice(0, compact ? 2 : 5);
  const topImprovements = (result?.improvements ?? []).slice(0, compact ? 2 : 5);
  const hasContent = topSignals.length > 0 || topImprovements.length > 0;

  const Header = (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm">
            Suggestions{portfolioName ? ` for ${portfolioName}` : ""}
          </h3>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Educational research from the Portfolio Coach. Not investment advice.
          </p>
        </div>
      </div>
      <Button size="sm" variant={hasContent ? "outline" : "default"} onClick={run} disabled={running || !holdings.length} className="gap-1.5 shrink-0">
        {running ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {hasContent ? "Refresh" : "Generate"}
      </Button>
    </div>
  );

  const Empty = (
    <p className="text-xs text-muted-foreground">
      {holdings.length === 0
        ? "Add at least one holding to get suggestions."
        : `Click Generate to analyze ${holdings.length} position${holdings.length === 1 ? "" : "s"}.`}
    </p>
  );

  const Loading = (
    <div className="space-y-2">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      {!compact && <Skeleton className="h-12 w-full" />}
    </div>
  );

  const Footer = (
    <div className="flex flex-wrap gap-1.5 pt-3 mt-3 border-t border-border">
      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1">
        <Link to="/advisor"><Lightbulb className="h-3 w-3" />Portfolio Coach<ArrowRight className="h-3 w-3" /></Link>
      </Button>
      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1">
        <Link to="/rebalance"><Scale className="h-3 w-3" />Rebalance<ArrowRight className="h-3 w-3" /></Link>
      </Button>
      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1">
        <Link to="/optimizer"><TrendingUp className="h-3 w-3" />Optimizer<ArrowRight className="h-3 w-3" /></Link>
      </Button>
    </div>
  );

  return (
    <Card className="p-4">
      {Header}
      {running ? Loading : !hasContent ? Empty : (
        <div className="space-y-2.5">
          {topSignals.map((s, i) => (
            <div key={`s-${i}`} className="flex items-start gap-2 p-2.5 rounded-md border border-border bg-background/40">
              <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${s.urgency === "high" ? "text-destructive" : s.urgency === "medium" ? "text-amber-500" : "text-muted-foreground"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                  <span className="font-mono text-xs font-semibold">{s.symbol}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{ACTION_LABEL[s.action] ?? s.action}</Badge>
                  {s.trim_pct ? <span className="text-[10px] text-muted-foreground">{s.trim_pct}%</span> : null}
                  {s.urgency && <Badge className={`text-[10px] px-1.5 py-0 border ${URGENCY_BADGE[s.urgency]}`} variant="outline">{s.urgency}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{s.rationale}</p>
              </div>
            </div>
          ))}
          {topImprovements.map((m, i) => (
            <div key={`i-${i}`} className="flex items-start gap-2 p-2.5 rounded-md border border-border bg-background/40">
              <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-semibold">{m.title}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{m.type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{m.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {Footer}
    </Card>
  );
}