import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Waves } from "lucide-react";
import { computeVolatility } from "@/lib/ta/volatility";
import type { Bar } from "@/lib/ta/types";

interface Props { bars: Bar[]; }

const regimeStyle: Record<string, string> = {
  low: "border-success/40 bg-success/10 text-success",
  normal: "border-border bg-muted/40 text-muted-foreground",
  elevated: "border-warning/40 bg-warning/10 text-warning-foreground",
  extreme: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function VolatilityCard({ bars }: Props) {
  const v = useMemo(() => computeVolatility(bars), [bars]);
  if (!v) return null;

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Waves className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Volatility read</h3>
        </div>
        <Badge variant="outline" className={`uppercase ${regimeStyle[v.regime]}`}>{v.regime} volatility</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded border border-border">
          <p className="text-muted-foreground">ATR(14)</p>
          <p className="font-semibold text-base">{v.atr14.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">{v.atrPct.toFixed(2)}% of price</p>
        </div>
        <div className="p-3 rounded border border-border">
          <p className="text-muted-foreground">ATR percentile</p>
          <p className="font-semibold text-base">{(v.atrPercentile * 100).toFixed(0)}%</p>
          <p className="text-[10px] text-muted-foreground">{v.expanding ? "expanding" : "contracting/steady"}</p>
        </div>
        <div className="p-3 rounded border border-border">
          <p className="text-muted-foreground">Realized vol (ann.)</p>
          <p className="font-semibold text-base">{v.realizedVolAnnualPct.toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground">z-score {v.realizedZ.toFixed(2)}</p>
        </div>
        <div className="p-3 rounded border border-border">
          <p className="text-muted-foreground">BB/KC squeeze</p>
          <p className="font-semibold text-base">{v.squeezeRatio.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">{v.squeezeRatio < 1 ? "squeeze active" : "no squeeze"}</p>
        </div>
      </div>
      {v.breakoutReady && (
        <p className="mt-3 text-xs p-2 rounded border border-success/30 bg-success/10 text-success">
          Low ATR percentile + Bollinger inside Keltner — the classic setup for a volatility expansion breakout. Watch for the first strong bar that expands range beyond 1.5× ATR(14).
        </p>
      )}
    </Card>
  );
}