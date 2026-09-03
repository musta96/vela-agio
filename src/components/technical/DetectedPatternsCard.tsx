import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CandlestickChart, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { FullAnalysis, Bias } from "@/lib/ta";
import { TermGloss } from "@/components/TermGloss";

const bgFor = (b: Bias) => b === "bullish"
  ? "bg-success/10 border-success/30"
  : b === "bearish"
  ? "bg-destructive/10 border-destructive/30"
  : "bg-muted/20 border-border";

const iconFor = (b: Bias) => b === "bullish"
  ? <TrendingUp className="h-3 w-3 text-success" />
  : b === "bearish"
  ? <TrendingDown className="h-3 w-3 text-destructive" />
  : <Minus className="h-3 w-3 text-muted-foreground" />;

const fmt = (t: number) => new Date(t).toLocaleDateString();

export function DetectedPatternsCard({ analysis }: { analysis: FullAnalysis }) {
  const recentCandles = analysis.candlestickPatterns.slice(-8).reverse();
  const chartPats = analysis.chartPatterns;
  const structure = analysis.structure.slice(-6).reverse();
  const smc = [
    ...analysis.orderBlocks.slice(-3).map((o) => ({ type: "Order Block", bias: o.bias, t: o.t, detail: `Zone ${o.bottom.toFixed(2)} – ${o.top.toFixed(2)}` })),
    ...analysis.fvgs.filter((f) => !f.filled).slice(-3).map((f) => ({ type: "Fair Value Gap", bias: f.bias, t: f.t, detail: `Gap ${Math.min(f.top, f.bottom).toFixed(2)} – ${Math.max(f.top, f.bottom).toFixed(2)}` })),
    ...analysis.liquidityGrabs.slice(-3).map((l) => ({ type: "Liquidity Grab", bias: l.bias, t: l.t, detail: `Swept ${l.sweptLevel.toFixed(2)}, reclaimed ${l.reclaimPrice.toFixed(2)}` })),
    ...analysis.supplyDemand.filter((z) => z.fresh).slice(-3).map((z) => ({ type: z.bias === "bullish" ? "Demand zone" : "Supply zone", bias: z.bias, t: z.to.t, detail: `${z.bottom.toFixed(2)} – ${z.top.toFixed(2)} (fresh)` })),
  ].sort((a, b) => b.t - a.t).slice(0, 8);

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center gap-2 mb-4">
        <CandlestickChart className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Detected patterns & structure</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Column title="Candlestick" empty="No candlestick patterns in the last 8 hits.">
          {recentCandles.map((c, i) => (
            <Row key={i} bias={c.bias} title={c.name} subtitle={c.description} t={c.t} />
          ))}
        </Column>

        <Column title="Chart patterns" empty="No chart patterns detected.">
          {chartPats.map((c, i) => (
            <Row key={i} bias={c.bias} title={c.name}
              subtitle={`Trigger ${c.keyPrice.toFixed(2)}${c.target ? ` → target ${c.target.toFixed(2)}` : ""}${c.invalidation ? ` · invalidation ${c.invalidation.toFixed(2)}` : ""}`} />
          ))}
        </Column>

        <Column title="Market structure & smart-money" empty="No structural shifts or SMC events yet.">
          {structure.map((s, i) => (
            <Row key={`s-${i}`} bias={s.bias}
              title={`${s.kind} · ${s.bias === "bullish" ? "up" : "down"}`}
              subtitle={`Level ${s.level.toFixed(2)}`} t={s.t} />
          ))}
          {smc.map((s, i) => (
            <Row key={`m-${i}`} bias={s.bias} title={s.type} subtitle={s.detail} t={s.t} />
          ))}
        </Column>
      </div>
    </Card>
  );

  function Column({ title, children, empty }: { title: string; empty: string; children: React.ReactNode }) {
    const items = Array.isArray(children) ? children : [children];
    const nonEmpty = items.filter(Boolean);
    return (
      <div>
        <h4 className="text-sm font-semibold mb-2">{title}</h4>
        <div className="space-y-2">
          {nonEmpty.length ? nonEmpty : <p className="text-xs text-muted-foreground">{empty}</p>}
        </div>
      </div>
    );
  }

  function Row({ bias, title, subtitle, t }: { bias: Bias; title: string; subtitle?: string; t?: number }) {
    return (
      <div className={`p-2 rounded-md border ${bgFor(bias)}`}>
        <div className="flex items-center gap-2 flex-wrap">
          {iconFor(bias)}
          <span className="text-sm font-medium">{title}</span>
          {t && <Badge variant="outline" className="text-[10px] ml-auto">{fmt(t)}</Badge>}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
    );
  }
}