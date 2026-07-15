import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Layers } from "lucide-react";
import { useTopDown, DEFAULT_TOP_DOWN } from "@/hooks/useTopDown";
import { scoreTimeframe, alignmentSummary } from "@/lib/ta/topDown";
import type { Bias } from "@/lib/ta/types";

const iconFor = (b: Bias) =>
  b === "bullish" ? <TrendingUp className="h-4 w-4 text-success" />
  : b === "bearish" ? <TrendingDown className="h-4 w-4 text-destructive" />
  : <Minus className="h-4 w-4 text-muted-foreground" />;

const bgFor = (b: Bias) =>
  b === "bullish" ? "border-success/40 bg-success/10"
  : b === "bearish" ? "border-destructive/40 bg-destructive/10"
  : "border-border bg-muted/30";

export function TopDownCard({ symbol }: { symbol: string }) {
  const { frames, loading, error } = useTopDown(symbol, DEFAULT_TOP_DOWN);

  const cards = useMemo(
    () => frames.map((f) => scoreTimeframe(f.cfg.label, f.bars as any)),
    [frames],
  );
  const alignment = useMemo(() => alignmentSummary(cards), [cards]);

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Top-Down · Multi-timeframe alignment</h3>
        </div>
        {cards.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {alignment.label}
            </Badge>
            <span className={`text-sm font-bold ${
              alignment.score > 15 ? "text-success"
              : alignment.score < -15 ? "text-destructive"
              : "text-muted-foreground"
            }`}>
              {alignment.score > 0 ? "+" : ""}{alignment.score}
            </span>
          </div>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Fetching all timeframes…</p>}
      {error && !loading && <p className="text-sm text-destructive">{error}</p>}

      {!loading && cards.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            {alignment.bullish} bullish · {alignment.bearish} bearish · {alignment.neutral} neutral across {cards.length} timeframes.
            Trade with the higher-timeframe bias; use lower timeframes to time entries.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((c) => (
              <div key={c.timeframe} className={`p-3 rounded-md border ${bgFor(c.bias)}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{c.timeframe}</span>
                  <div className="flex items-center gap-1">
                    {iconFor(c.bias)}
                    <span className="text-xs font-bold">
                      {c.score > 0 ? "+" : ""}{c.score}
                    </span>
                  </div>
                </div>
                <p className="text-xs font-medium mb-1">{c.trendLabel}</p>
                {c.lastClose != null && (
                  <p className="text-[11px] text-muted-foreground mb-1">
                    Last {c.lastClose.toFixed(2)} · {c.bars} bars
                  </p>
                )}
                {(c.nearestSupport != null || c.nearestResistance != null) && (
                  <p className="text-[11px] text-muted-foreground mb-2">
                    {c.nearestSupport != null && <>S {c.nearestSupport.toFixed(2)} </>}
                    {c.nearestResistance != null && <>R {c.nearestResistance.toFixed(2)}</>}
                  </p>
                )}
                {c.reasons.length > 0 && (
                  <ul className="text-[11px] text-muted-foreground space-y-0.5 mt-2">
                    {c.reasons.slice(0, 4).map((r, i) => (
                      <li key={i} className="truncate">• {r}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
