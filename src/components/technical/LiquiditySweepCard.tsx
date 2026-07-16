import { useMemo, useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Waves } from "lucide-react";
import {
  ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import type { Bar } from "@/lib/ta/types";
import { detectSweeps, recentSwings, DEFAULT_SWEEP_CONFIG, type Sweep } from "@/lib/ta/sweeps";

interface Props { bars: Bar[]; }

interface SweepTrade {
  sweepIndex: number;
  t: number;
  bias: "bullish" | "bearish";
  entryPrice: number;
  exitPrice: number;
  pct: number;
}

export function LiquiditySweepCard({ bars }: Props) {
  const [lookback, setLookback] = useState(DEFAULT_SWEEP_CONFIG.lookback);
  const [wickRatio, setWickRatio] = useState(DEFAULT_SWEEP_CONFIG.wickRatio);
  const [penATR, setPenATR] = useState(DEFAULT_SWEEP_CONFIG.minPenetrationATR);
  const [reclaimBars, setReclaimBars] = useState(DEFAULT_SWEEP_CONFIG.reclaimBars);
  const [entryDelay, setEntryDelay] = useState(1);
  const [holdBars, setHoldBars] = useState(5);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  const sweeps: Sweep[] = useMemo(
    () => detectSweeps(bars, { lookback, wickRatio, minPenetrationATR: penATR, reclaimBars }),
    [bars, lookback, wickRatio, penATR, reclaimBars],
  );
  const swings = useMemo(() => recentSwings(bars, Math.max(lookback, 60), 8), [bars, lookback]);
  const chartData = useMemo(() => bars.slice(-160).map((b) => ({ t: b.t, close: b.close, date: new Date(b.t).toLocaleDateString() })), [bars]);
  const firstT = chartData[0]?.t ?? 0;

  const trades: SweepTrade[] = useMemo(() => {
    const out: SweepTrade[] = [];
    for (const s of sweeps) {
      if (!s.reclaimed) continue;
      const entryIdx = s.index + entryDelay;
      const exitIdx = entryIdx + holdBars;
      if (exitIdx >= bars.length) continue;
      const entry = bars[entryIdx].close;
      const exit = bars[exitIdx].close;
      const dir = s.bias === "bullish" ? 1 : -1;
      out.push({ sweepIndex: s.index, t: s.t, bias: s.bias, entryPrice: entry, exitPrice: exit, pct: dir * ((exit - entry) / entry) * 100 });
    }
    return out;
  }, [sweeps, bars, entryDelay, holdBars]);

  const wins = trades.filter((t) => t.pct > 0).length;
  const winRate = trades.length ? (wins / trades.length) * 100 : 0;
  const avg = trades.length ? trades.reduce((s, t) => s + t.pct, 0) / trades.length : 0;

  useEffect(() => {
    if (selectedIdx == null) return;
    const row = rowRefs.current[selectedIdx];
    if (row) row.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedIdx]);

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div>
          <Label className="text-[11px]">Entry delay (bars)</Label>
          <Input type="number" min={0} max={10} value={entryDelay} onChange={(e) => setEntryDelay(Number(e.target.value) || 0)} className="mt-1" />
        </div>
        <div>
          <Label className="text-[11px]">Hold horizon (bars)</Label>
          <Input type="number" min={1} max={40} value={holdBars} onChange={(e) => setHoldBars(Number(e.target.value) || 5)} className="mt-1" />
        </div>
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
                r={selectedIdx === s.index ? 8 : 5}
                fill={s.bias === "bullish" ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                stroke={selectedIdx === s.index ? "hsl(var(--primary))" : "hsl(var(--background))"}
                strokeWidth={selectedIdx === s.index ? 2.5 : 1.5}
                onClick={() => setSelectedIdx(s.index)}
                style={{ cursor: "pointer" }} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {trades.length > 0 && (
        <>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <StatCell label="Sweep trades" value={String(trades.length)} />
            <StatCell label="Win rate" value={`${winRate.toFixed(1)}%`} />
            <StatCell label="Avg P/L" value={`${avg.toFixed(2)}%`} tone={avg >= 0 ? "pos" : "neg"} />
            <StatCell label="Cumulative" value={`${trades.reduce((s, t) => s + t.pct, 0).toFixed(2)}%`} />
          </div>
          <div className="mt-3 max-h-64 overflow-auto border border-border rounded">
            <table className="text-xs w-full">
              <thead className="bg-muted/40 sticky top-0"><tr>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Bias</th>
                <th className="text-right p-2">Entry</th>
                <th className="text-right p-2">Exit</th>
                <th className="text-right p-2">P/L%</th>
              </tr></thead>
              <tbody>
                {trades.slice().reverse().map((t) => {
                  const active = selectedIdx === t.sweepIndex;
                  return (
                    <tr key={t.sweepIndex}
                        ref={(el) => { rowRefs.current[t.sweepIndex] = el; }}
                        onClick={() => setSelectedIdx(t.sweepIndex)}
                        className={`border-t border-border cursor-pointer hover:bg-muted/30 ${active ? "bg-primary/15 outline outline-1 outline-primary" : ""}`}>
                      <td className="p-2">{new Date(t.t).toLocaleDateString()}</td>
                      <td className={`p-2 font-medium ${t.bias === "bullish" ? "text-success" : "text-destructive"}`}>{t.bias}</td>
                      <td className="p-2 text-right">{t.entryPrice.toFixed(2)}</td>
                      <td className="p-2 text-right">{t.exitPrice.toFixed(2)}</td>
                      <td className={`p-2 text-right font-semibold ${t.pct >= 0 ? "text-success" : "text-destructive"}`}>{t.pct.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Click a sweep dot on the chart to jump to its trade — or click a row to highlight its point.</p>
        </>
      )}

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

function StatCell({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const cls = tone === "pos" ? "text-success" : tone === "neg" ? "text-destructive" : "";
  return (
    <div className="p-2 rounded border border-border">
      <p className="text-muted-foreground">{label}</p>
      <p className={`font-semibold text-base ${cls}`}>{value}</p>
    </div>
  );
}