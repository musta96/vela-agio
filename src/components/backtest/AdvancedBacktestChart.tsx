import { useMemo } from "react";
import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { detectCandlestickPatterns } from "@/lib/ta/candlesticks";
import { computeAVWAP } from "@/lib/ta/avwap";
import { computeFibonacci } from "@/lib/ta/fib";
import { supportResistance, findTrendlines } from "@/lib/ta/structure";
import { detectOrderBlocks } from "@/lib/ta/smc";
import type { Bar } from "@/lib/ta/types";
import type { DetectorSettings } from "@/lib/ta/detectorSettings";
import type { IndicatorPoint } from "@/lib/ta/indicators";

export function AdvancedBacktestChart({ bars, settings, indicators = [] }: { bars: Bar[]; settings: DetectorSettings; indicators?: IndicatorPoint[] }) {
  const view = useMemo(() => {
    const start = Math.max(0, bars.length - settings.patternLookback);
    const visible = bars.slice(start);
    const patterns = detectCandlestickPatterns(visible).map((p) => ({ ...p, index: p.index + start }));
    const levels = supportResistance(bars, settings.supportResistanceTolerance);
    const obs = detectOrderBlocks(bars);
    const avwap = computeAVWAP(bars, Math.max(0, bars.length - settings.avwapAnchorLookback));
    const fib = computeFibonacci(bars.slice(Math.max(0, bars.length - settings.fibonacciLookback)));
    const trendStart = Math.max(0, bars.length - settings.trendlineLookback);
    const trendlines = findTrendlines(bars.slice(trendStart)).map((t) => ({
      ...t,
      from: { ...t.from, index: t.from.index + trendStart },
      to: { ...t.to, index: t.to.index + trendStart },
      broken: t.broken ? { ...t.broken, index: t.broken.index + trendStart } : undefined,
    }));
    return { patterns, levels, obs, avwap, fib, trendlines };
  }, [bars, settings]);

  if (bars.length < 20) return null;
  const indicatorByTime = new Map(indicators.map((point) => [point.t, point]));
  const data = bars.map((b, i) => ({ ...b, avwap: view.avwap[i]?.avwap ?? undefined, ...indicatorByTime.get(b.t) }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" /> Advanced signal overlays</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">OHLC close with causal annotations for the selected analysis window.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1"><Badge variant="outline">{view.patterns.length} patterns</Badge><Badge variant="outline">{view.levels.length} S/R</Badge><Badge variant="outline">{view.obs.length} order blocks</Badge></div>
      </CardHeader>
      <CardContent>
        <div className="h-[390px] w-full">
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 12, right: 28, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="t" tickFormatter={(t) => new Date(t).toLocaleDateString()} stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis domain={["auto", "auto"]} stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <Tooltip labelFormatter={(t) => new Date(Number(t)).toLocaleDateString()} formatter={(v: number | string) => typeof v === "number" ? v.toFixed(2) : v} />
              <Area dataKey="high" fill="hsl(var(--muted))" fillOpacity={0.08} stroke="none" name="High" />
              <Line dataKey="close" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Close" />
              <Line dataKey="avwap" stroke="hsl(var(--warning))" strokeWidth={1.5} dot={false} name="Anchored VWAP" />
              <Line dataKey="sma20" stroke="hsl(var(--success))" strokeWidth={1.25} dot={false} name="SMA 20" />
              <Line dataKey="sma50" stroke="hsl(var(--destructive))" strokeWidth={1.25} dot={false} name="SMA 50" />
              <Line dataKey="upperBand" stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeWidth={1} dot={false} name="Bollinger upper" />
              <Line dataKey="lowerBand" stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeWidth={1} dot={false} name="Bollinger lower" />
              {view.levels.map((z, i) => <ReferenceLine key={`level-${i}`} y={z.price} stroke={z.type === "support" ? "hsl(var(--success))" : "hsl(var(--destructive))"} strokeDasharray="4 4" strokeOpacity={0.45 + z.strength * 0.4} label={{ value: `${z.type === "support" ? "S" : "R"} ${z.price.toFixed(2)}`, fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />)}
              {view.obs.map((o, i) => <ReferenceArea key={`ob-${i}`} x1={bars[o.index]?.t} x2={bars[bars.length - 1]?.t} y1={o.bottom} y2={o.top} fill={o.bias === "bullish" ? "hsl(var(--primary))" : "hsl(var(--destructive))"} fillOpacity={0.1} stroke={o.bias === "bullish" ? "hsl(var(--primary))" : "hsl(var(--destructive))"} strokeOpacity={0.4} />)}
              {view.fib && <ReferenceArea y1={view.fib.goldenZone.bottom} y2={view.fib.goldenZone.top} fill="hsl(var(--warning))" fillOpacity={0.08} stroke="hsl(var(--warning))" strokeOpacity={0.35} />}
              {view.patterns.slice(-24).map((p, i) => <ReferenceDot key={`p-${i}`} x={bars[p.index]?.t} y={p.bias === "bearish" ? p.priceHigh : p.priceLow} r={4} fill={p.bias === "bearish" ? "hsl(var(--destructive))" : "hsl(var(--success))"} stroke="hsl(var(--background))" label={{ value: p.name, fontSize: 8, position: p.bias === "bearish" ? "top" : "bottom", fill: "hsl(var(--foreground))" }} />)}
              {view.trendlines.map((t, i) => <ReferenceLine key={`trend-${i}`} segment={[{ x: bars[t.from.index]?.t, y: t.from.price }, { x: bars[t.to.index]?.t, y: t.to.price }]} stroke={t.kind === "up" ? "hsl(var(--success))" : "hsl(var(--destructive))"} strokeDasharray="6 3" />)}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-success" />Bullish pattern / support</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-destructive" />Bearish pattern / resistance</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-primary/30" />Order block zone</span></div>
      </CardContent>
    </Card>
  );
}
