import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Zap } from "lucide-react";
import type { ActionableInsight, Bias } from "@/lib/ta";

const iconFor = (b: Bias) => b === "bullish"
  ? <TrendingUp className="h-4 w-4 text-success" />
  : b === "bearish"
  ? <TrendingDown className="h-4 w-4 text-destructive" />
  : <Minus className="h-4 w-4 text-muted-foreground" />;

const bgFor = (b: Bias) => b === "bullish"
  ? "bg-success/10 border-success/30"
  : b === "bearish"
  ? "bg-destructive/10 border-destructive/30"
  : "bg-muted/20 border-border";

export function InsightsCard({ insights }: { insights: ActionableInsight[] }) {
  if (!insights.length) return null;
  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Actionable insights</h3>
        <Badge variant="outline" className="text-[10px]">{insights.length} signals</Badge>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {insights.map((s) => (
          <div key={s.id} className={`p-3 rounded-md border flex gap-3 ${bgFor(s.bias)}`}>
            <div className="mt-0.5">{iconFor(s.bias)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm">{s.name}</p>
                <Badge variant="outline" className="text-[10px] capitalize">{s.bias}</Badge>
                <Badge variant="secondary" className="text-[10px] capitalize">{s.confidence}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{s.detail}</p>
              <p className="text-xs mt-1"><span className="font-medium">How to trade:</span> {s.howToTrade}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}