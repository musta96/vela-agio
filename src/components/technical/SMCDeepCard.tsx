import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, TrendingDown } from "lucide-react";
import type { FullAnalysis } from "@/lib/ta";

interface Props {
  analysis: FullAnalysis;
  lastPrice: number;
}

function bg(bias: "bullish" | "bearish" | "neutral") {
  return bias === "bullish"
    ? "border-success/30 bg-success/5 text-success"
    : bias === "bearish"
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : "border-border bg-muted/30 text-muted-foreground";
}

export function SMCDeepCard({ analysis, lastPrice }: Props) {
  const fvgs = analysis.fvgs.filter((f) => !f.filled).slice(-8);
  const obs = analysis.orderBlocks.slice(-8);
  const grabs = analysis.liquidityGrabs.slice(-6);
  const shifts = analysis.structure.slice(-6);
  const zones = analysis.supplyDemand.filter((z) => z.fresh).slice(-6);

  const nearestFVG = fvgs
    .map((f) => ({ f, d: Math.min(Math.abs(f.top - lastPrice), Math.abs(f.bottom - lastPrice)) / lastPrice }))
    .sort((a, b) => a.d - b.d)[0];

  const bullBias = shifts.filter((s) => s.bias === "bullish").length + grabs.filter((g) => g.bias === "bullish").length;
  const bearBias = shifts.filter((s) => s.bias === "bearish").length + grabs.filter((g) => g.bias === "bearish").length;
  const smcRead = bullBias > bearBias ? "bullish" : bearBias > bullBias ? "bearish" : "neutral";

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Smart Money Concepts (deep read)</h3>
        </div>
        <Badge variant="outline" className={`uppercase ${bg(smcRead)}`}>
          {smcRead === "bullish" ? <TrendingUp className="h-3 w-3 mr-1 inline" /> : smcRead === "bearish" ? <TrendingDown className="h-3 w-3 mr-1 inline" /> : null}
          {smcRead}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground mb-2">Market structure shifts</p>
          {shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent BOS / CHoCH detected.</p>
          ) : (
            <ul className="space-y-1.5">
              {shifts.map((s, i) => (
                <li key={i} className={`text-xs p-2 rounded border ${bg(s.bias)}`}>
                  <span className="font-semibold">{s.kind}</span> {s.bias === "bullish" ? "↑" : "↓"} at {s.level.toFixed(2)} · {new Date(s.t).toLocaleDateString()}
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs uppercase text-muted-foreground mb-2 mt-4">Liquidity sweeps</p>
          {grabs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No liquidity grabs in window.</p>
          ) : (
            <ul className="space-y-1.5">
              {grabs.map((g, i) => (
                <li key={i} className={`text-xs p-2 rounded border ${bg(g.bias)}`}>
                  Swept {g.bias === "bullish" ? "lows" : "highs"} at {g.sweptLevel.toFixed(2)}, reclaimed {g.reclaimPrice.toFixed(2)} · {new Date(g.t).toLocaleDateString()}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-xs uppercase text-muted-foreground mb-2">Fair Value Gaps (unfilled)</p>
          {fvgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open FVGs in window.</p>
          ) : (
            <ul className="space-y-1.5">
              {fvgs.map((f, i) => (
                <li key={i} className={`text-xs p-2 rounded border ${bg(f.bias)}`}>
                  {f.bias === "bullish" ? "Bullish" : "Bearish"} FVG · {f.bottom.toFixed(2)}–{f.top.toFixed(2)}
                  {nearestFVG?.f === f && <Badge className="ml-2 text-[10px]" variant="secondary">nearest</Badge>}
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs uppercase text-muted-foreground mb-2 mt-4">Order blocks & fresh S/D zones</p>
          {obs.length + zones.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fresh institutional zones.</p>
          ) : (
            <ul className="space-y-1.5">
              {obs.map((o, i) => (
                <li key={`ob-${i}`} className={`text-xs p-2 rounded border ${bg(o.bias)}`}>
                  OB {o.bias} · {o.bottom.toFixed(2)}–{o.top.toFixed(2)}
                </li>
              ))}
              {zones.map((z, i) => (
                <li key={`sd-${i}`} className={`text-xs p-2 rounded border ${bg(z.bias)}`}>
                  {z.bias === "bullish" ? "Demand" : "Supply"} · {z.bottom.toFixed(2)}–{z.top.toFixed(2)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}