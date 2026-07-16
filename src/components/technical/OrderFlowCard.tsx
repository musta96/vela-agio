import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, TrendingUp, TrendingDown } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { computeOrderFlow } from "@/lib/flow/orderFlow";
import type { Bar as OhlcBar } from "@/lib/ta/types";

interface Props { bars: OhlcBar[]; }

const fmt = (t: number) => new Date(t).toLocaleDateString();

export function OrderFlowCard({ bars }: Props) {
  const flow = useMemo(() => computeOrderFlow(bars.slice(-120)), [bars]);
  const data = flow.points.map((p) => ({ t: p.t, delta: p.delta, cum: p.cumDelta }));
  const biasBg = flow.bias === "bullish" ? "text-success" : flow.bias === "bearish" ? "text-destructive" : "text-muted-foreground";

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Order flow (proxy)</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`uppercase ${biasBg}`}>
            {flow.bias === "bullish" ? <TrendingUp className="h-3 w-3 mr-1 inline" /> : flow.bias === "bearish" ? <TrendingDown className="h-3 w-3 mr-1 inline" /> : null}
            {flow.bias}
          </Badge>
          {flow.divergence && (
            <Badge variant="outline" className={flow.divergence === "bearish" ? "border-destructive/40 text-destructive" : "border-success/40 text-success"}>
              {flow.divergence} divergence
            </Badge>
          )}
        </div>
      </div>
      <div className="w-full h-[220px]">
        <ResponsiveContainer>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="t" tickFormatter={(t) => fmt(t as number)} fontSize={11} stroke="hsl(var(--muted-foreground))" />
            <YAxis yAxisId="d" fontSize={11} stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} labelFormatter={(t) => fmt(t as number)} formatter={(v: number | string) => typeof v === "number" ? v.toFixed(0) : v} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" yAxisId="d" />
            <Bar dataKey="delta" yAxisId="d" name="Δ per bar" fill="hsl(var(--muted-foreground))" opacity={0.6} />
            <Area type="monotone" dataKey="cum" yAxisId="d" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} name="Cumulative Δ" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
        <div className="p-2 rounded border border-success/30 bg-success/5">
          <p className="text-muted-foreground">Buy pressure</p>
          <p className="font-semibold text-success">{flow.buyPct.toFixed(1)}%</p>
        </div>
        <div className="p-2 rounded border border-destructive/30 bg-destructive/5">
          <p className="text-muted-foreground">Sell pressure</p>
          <p className="font-semibold text-destructive">{flow.sellPct.toFixed(1)}%</p>
        </div>
        <div className="p-2 rounded border border-border">
          <p className="text-muted-foreground">Cumulative Δ</p>
          <p className="font-semibold">{flow.totalDelta.toFixed(0)}</p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Proxy signal derived from bar-close position within each bar's range × volume. Not a replacement for L2 tape — use as a confluence, not a stand-alone trigger.
      </p>
    </Card>
  );
}