import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Waves } from "lucide-react";
import {
  ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import type { Bar } from "@/lib/ta/types";
import { detectSweeps, recentSwings, DEFAULT_SWEEP_CONFIG, type Sweep } from "@/lib/ta/sweeps";

interface Props { bars: Bar[]; }

export function LiquiditySweepCard({ bars }: Props) {
  const [lookback, setLookback] = useState(DEFAULT_SWEEP_CONFIG.lookback);
  const [wickRatio, setWickRatio] = useState(DEFAULT_SWEEP_CONFIG.wickRatio);
  const [penATR, setPenATR] = useState(DEFAULT_SWEEP_CONFIG.minPenetrationATR);
  const [reclaimBars, setReclaimBars] = useState(DEFAULT_SWEEP_CONFIG.reclaimBars);

  const sweeps: Sweep[] = useMemo(
    () => detectSweeps(bars, { lookback, wickRatio, minPenetrationATR: penATR, reclaimBars }),
    [bars, lookback, wickRatio, penATR, reclaimBars],
  );
  const swings = useMemo(() => recentSwings(bars, Math.max(lookback, 60), 8), [bars, lookback]);
  const chartData = useMemo(() => bars.slice(-160).map((b) => ({ t: b.t, close: b.close, date: new Date(b.t).toLocaleDateString() })), [bars]);
  const firstT = chartData[0]?.t ?? 0;

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center gap-2 mb-3">
        <Waves className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Liquidity sweep detector</h3>
        <Badge variant="outline" className="ml-auto text-[10px]">{sweeps.length} events</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <SliderCell label={`Swing lookback: ${lookback}`} value={lookback} min={10} max={100} step={5} onChange={setLookback} />
        <SliderCell label={`Wick / body ≥ ${wickRatio.toFixed(1)}`} value={wickRatio} min={1.5} max={5} step={0.1} onChange={setWickRatio} />
        <SliderCell label={`Penetration ≥ ${penATR.toFixed(2)} ATR`} value={penATR} min={0.05} max={1.5} step={0.05} onChange={setPenATR} />
        <SliderCell label={`Reclaim within ${reclaimBars} bars`} value={reclaimBars} min={0} max={5} step={1} onChange={setReclaimBars} />
      </div>

      <div className="w-full h-[280px]">
        <ResponsiveContainer>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" fontSize={10} minTickGap={40} stroke="hsl(var(--muted-foreground))" />
            <YAxis domain={["auto", "auto"]} fontSize={10} stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
            <Line type="monotone" dataKey="close" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} />
            {swings.map((p, i) => (
              <ReferenceLine
                key={`swing-${i}`}
                y={p.price}
                stroke={p.kind === "high" ? "hsl(var(--destructive))" : "hsl(var(--success))"}
                strokeDasharray="3 3"
                strokeOpacity={0.5}
                label={{ value: p.kind === "high" ? "SH" : "SL", position: "insideRight", fill: p.kind === "high" ? "hsl(var(--destructive))" : "hsl(var(--success))", fontSize: 9 }}
              />
            ))}
            {sweeps.filter((s) => s.t >= firstT).map((s, i) => (
              <ReferenceDot key={`sw-${i}`} x={new Date(s.t).toLocaleDateString()} y={s.sweptLevel}
                r={5} fill={s.bias === "bullish" ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                stroke="hsl(var(--background))" strokeWidth={1.5} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 max-h-56 overflow-auto border border-border rounded">
        <table className="text-xs w-full">
          <thead className="bg-muted/40 sticky top-0"><tr>
            <th className="text-left p-2">Date</th>
            <th className="text-left p-2">Bias</th>
            <th className="text-right p-2">Swept</th>
            <th className="text-right p-2">Penetration (ATR)</th>
            <th className="text-right p-2">Reclaimed</th>
          </tr></thead>
          <tbody>
            {sweeps.slice(-10).reverse().map((s, i) => (
              <tr key={i} className="border-t border-border">
                <td className="p-2">{new Date(s.t).toLocaleDateString()}</td>
                <td className={`p-2 font-medium ${s.bias === "bullish" ? "text-success" : "text-destructive"}`}>{s.bias}</td>
                <td className="p-2 text-right">{s.sweptLevel.toFixed(2)}</td>
                <td className="p-2 text-right">{s.penetrationATR.toFixed(2)}</td>
                <td className="p-2 text-right">{s.reclaimed ? "✓" : "—"}</td>
              </tr>
            ))}
            {sweeps.length === 0 && (
              <tr><td colSpan={5} className="p-3 text-muted-foreground text-center">No sweeps match these thresholds. Loosen wick ratio or penetration.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SliderCell({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-[11px]">{label}</Label>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} className="mt-2" />
    </div>
  );
}