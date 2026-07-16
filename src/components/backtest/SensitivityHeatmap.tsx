import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Grid3x3 } from "lucide-react";
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Condition, RiskConfig } from "@/lib/ta/strategyTypes";
import type { CostConfig } from "@/lib/backtest/costs";
import type { Bar, SimResult } from "@/lib/backtest/clientSim";
import { describeCondition } from "@/lib/ta/strategyTypes";
import { runCached, runCachedParallel, cacheStats } from "@/lib/backtest/simCache";

interface Props {
  bars: Bar[];
  rules: { entry: Condition[]; exit: Condition[]; risk: RiskConfig };
  initial: number;
  costs: CostConfig;
}

type AxisKind =
  | { scope: "entry" | "exit"; index: number; field: "value" | "period" | "fast" | "slow"; label: string }
  | { scope: "risk"; field: "stopPct" | "targetPct" | "riskPct"; label: string };

function buildAxisOptions(rules: Props["rules"]): AxisKind[] {
  const out: AxisKind[] = [];
  const collect = (list: Condition[], scope: "entry" | "exit") => {
    list.forEach((c, i) => {
      if (c.value !== undefined) out.push({ scope, index: i, field: "value",  label: `${scope} #${i + 1} · ${c.type}.value` });
      if (c.period !== undefined) out.push({ scope, index: i, field: "period", label: `${scope} #${i + 1} · ${c.type}.period` });
      if (c.fast !== undefined)   out.push({ scope, index: i, field: "fast",   label: `${scope} #${i + 1} · ${c.type}.fast` });
      if (c.slow !== undefined)   out.push({ scope, index: i, field: "slow",   label: `${scope} #${i + 1} · ${c.type}.slow` });
    });
  };
  collect(rules.entry, "entry");
  collect(rules.exit, "exit");
  if (rules.risk?.stopPct   !== undefined) out.push({ scope: "risk", field: "stopPct",   label: "risk.stopPct" });
  if (rules.risk?.targetPct !== undefined) out.push({ scope: "risk", field: "targetPct", label: "risk.targetPct" });
  if (rules.risk?.riskPct   !== undefined) out.push({ scope: "risk", field: "riskPct",   label: "risk.riskPct" });
  return out;
}

function applyAxis(rules: Props["rules"], axis: AxisKind, v: number): Props["rules"] {
  const clone: Props["rules"] = {
    entry: rules.entry.map((c) => ({ ...c })),
    exit:  rules.exit.map((c) => ({ ...c })),
    risk:  { ...rules.risk },
  };
  if (axis.scope === "risk") (clone.risk as any)[axis.field] = v;
  else {
    const target = axis.scope === "entry" ? clone.entry : clone.exit;
    (target[axis.index] as any)[axis.field] = v;
  }
  return clone;
}

function linspace(from: number, to: number, steps: number): number[] {
  if (steps < 2) return [from];
  const out: number[] = [];
  for (let i = 0; i < steps; i++) out.push(from + ((to - from) * i) / (steps - 1));
  return out;
}

const METRICS: Array<{ key: "totalReturn" | "sharpe" | "maxDrawdown" | "winRate"; label: string; higherIsBetter: boolean }> = [
  { key: "totalReturn", label: "Total return %", higherIsBetter: true },
  { key: "sharpe",      label: "Sharpe",         higherIsBetter: true },
  { key: "maxDrawdown", label: "Max drawdown %", higherIsBetter: true /* less-negative better */ },
  { key: "winRate",     label: "Win rate %",     higherIsBetter: true },
];

export function SensitivityHeatmap({ bars, rules, initial, costs }: Props) {
  const axes = useMemo(() => buildAxisOptions(rules), [rules]);
  const [axisXKey, setAxisXKey] = useState<string>(() => axes[0]?.label ?? "");
  const [axisYKey, setAxisYKey] = useState<string>(() => (axes[1] ?? axes[0])?.label ?? "");
  const [xFrom, setXFrom] = useState<number>(20);
  const [xTo, setXTo] = useState<number>(40);
  const [yFrom, setYFrom] = useState<number>(60);
  const [yTo, setYTo] = useState<number>(80);
  const [steps, setSteps] = useState<number>(5);
  const [metricKey, setMetricKey] = useState<typeof METRICS[number]["key"]>("totalReturn");
  const [grid, setGrid] = useState<number[][] | null>(null);
  const [xVals, setXVals] = useState<number[]>([]);
  const [yVals, setYVals] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; hits: number }>({ done: 0, total: 0, hits: 0 });
  const [drill, setDrill] = useState<{
    x: number; y: number; xi: number; yi: number;
    metric: number; result: SimResult; rules: Props["rules"];
  } | null>(null);

  if (axes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><Grid3x3 className="h-4 w-4 text-primary" /><CardTitle className="text-base">Parameter sensitivity</CardTitle></div>
          <CardDescription className="text-xs">Add at least one custom rule with a numeric parameter to sweep.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const axisX = axes.find((a) => a.label === axisXKey) ?? axes[0];
  const axisY = axes.find((a) => a.label === axisYKey) ?? axes[0];

  const run = async () => {
    setRunning(true);
    const xs = linspace(xFrom, xTo, steps);
    const ys = linspace(yFrom, yTo, steps);
    const total = xs.length * ys.length;
    setProgress({ done: 0, total, hits: 0 });
    // Build full job list, then fan out across the worker pool.
    const jobs: { entry: Condition[]; exit: Condition[]; risk: RiskConfig }[] = [];
    for (let yi = 0; yi < ys.length; yi++) {
      for (let xi = 0; xi < xs.length; xi++) {
        let r = applyAxis(rules, axisX, xs[xi]);
        r = applyAxis(r, axisY, ys[yi]);
        jobs.push(r);
      }
    }
    const { results, hits } = await runCachedParallel(bars, jobs, initial, costs,
      (done, tot, h) => setProgress({ done, total: tot, hits: h }));
    const g: number[][] = [];
    let k = 0;
    for (let yi = 0; yi < ys.length; yi++) {
      const row: number[] = [];
      for (let xi = 0; xi < xs.length; xi++) row.push(results[k++].metrics[metricKey]);
      g.push(row);
    }
    setProgress({ done: total, total, hits });
    setXVals(xs); setYVals(ys); setGrid(g); setRunning(false);
  };

  const openDrill = (xi: number, yi: number) => {
    if (!grid) return;
    const x = xVals[xi], y = yVals[yi];
    let r = applyAxis(rules, axisX, x);
    r = applyAxis(r, axisY, y);
    const { result } = runCached(bars, r, initial, costs);
    setDrill({ x, y, xi, yi, metric: grid[yi][xi], result, rules: r });
  };

  const metricInfo = METRICS.find((m) => m.key === metricKey)!;
  const flat = grid?.flat() ?? [];
  const min = flat.length ? Math.min(...flat) : 0;
  const max = flat.length ? Math.max(...flat) : 0;

  const cellColor = (v: number): string => {
    if (max === min) return "hsl(var(--muted))";
    const norm = (v - min) / (max - min); // 0..1
    // For maxDrawdown, values are negative — higher (closer to 0) is better; norm already reflects that.
    const pct = Math.round(norm * 100);
    // Use success/destructive gradient
    return metricInfo.higherIsBetter
      ? `hsl(var(--success) / ${0.15 + pct * 0.006})`
      : `hsl(var(--destructive) / ${0.15 + pct * 0.006})`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2"><Grid3x3 className="h-4 w-4 text-primary" /><CardTitle className="text-base">Parameter sensitivity</CardTitle></div>
        <CardDescription className="text-xs">
          Sweeps two rule parameters across a grid and re-simulates the strategy client-side using the same costs. Helps spot overfit sweet spots vs. broad plateaus.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px]">X axis parameter</Label>
            <Select value={axisX.label} onValueChange={setAxisXKey}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{axes.map((a) => <SelectItem key={a.label} value={a.label} className="text-xs">{a.label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-1">
              <Input type="number" value={xFrom} onChange={(e) => setXFrom(Number(e.target.value))} className="h-8 text-xs" />
              <Input type="number" value={xTo}   onChange={(e) => setXTo(Number(e.target.value))}   className="h-8 text-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Y axis parameter</Label>
            <Select value={axisY.label} onValueChange={setAxisYKey}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{axes.map((a) => <SelectItem key={a.label} value={a.label} className="text-xs">{a.label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-1">
              <Input type="number" value={yFrom} onChange={(e) => setYFrom(Number(e.target.value))} className="h-8 text-xs" />
              <Input type="number" value={yTo}   onChange={(e) => setYTo(Number(e.target.value))}   className="h-8 text-xs" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-[11px]">Steps per axis</Label>
            <Input type="number" min={2} max={9} value={steps} onChange={(e) => setSteps(Math.max(2, Math.min(9, Number(e.target.value) || 2)))} className="h-8 w-20 text-xs" />
          </div>
          <div>
            <Label className="text-[11px]">Metric</Label>
            <Select value={metricKey} onValueChange={(v) => setMetricKey(v as any)}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{METRICS.map((m) => <SelectItem key={m.key} value={m.key} className="text-xs">{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={run} disabled={running || bars.length < 30}>
            {running ? "Simulating…" : `Run ${steps * steps} sims`}
          </Button>
        </div>

        {grid && (
          <div className="overflow-auto">
            <table className="text-[11px] border-separate border-spacing-0.5">
              <thead>
                <tr>
                  <th className="text-right pr-2 text-muted-foreground font-normal">{axisY.label} \ {axisX.label}</th>
                  {xVals.map((x) => <th key={x} className="text-center px-2 text-muted-foreground font-normal">{x.toFixed(2)}</th>)}
                </tr>
              </thead>
              <tbody>
                {grid.map((row, yi) => (
                  <tr key={yi}>
                    <td className="text-right pr-2 text-muted-foreground">{yVals[yi].toFixed(2)}</td>
                    {row.map((v, xi) => (
                      <td key={xi}>
                        <button
                          onClick={() => openDrill(xi, yi)}
                          className="w-full min-w-[3.5rem] text-center px-2 py-1 rounded font-medium hover:ring-2 hover:ring-primary/60 transition"
                          style={{ backgroundColor: cellColor(v) }}
                          title="Click to drill down">
                          {v.toFixed(2)}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-muted-foreground mt-2">
              Range: {min.toFixed(2)} → {max.toFixed(2)}. Click a cell to inspect the exact parameters, equity curve and trades.
              <span className="ml-1">Cache: {cacheStats().size} runs.</span>
            </p>
          </div>
        )}

        {(running || progress.done > 0) && (
          <div className="space-y-1">
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} className="h-1.5" />
            <p className="text-[10px] text-muted-foreground">
              {progress.done}/{progress.total} simulations
              {progress.hits > 0 && <span> · {progress.hits} cache hits</span>}
              {!running && progress.done === progress.total && <span> · done</span>}
            </p>
          </div>
        )}
      </CardContent>

      <DrillDialog drill={drill} onClose={() => setDrill(null)} axisXLabel={axisX.label} axisYLabel={axisY.label} initial={initial} />
    </Card>
  );
}

function DrillDialog({
  drill, onClose, axisXLabel, axisYLabel, initial,
}: {
  drill: { x: number; y: number; metric: number; result: SimResult; rules: { entry: Condition[]; exit: Condition[]; risk: RiskConfig } } | null;
  onClose: () => void;
  axisXLabel: string;
  axisYLabel: string;
  initial: number;
}) {
  if (!drill) return null;
  const { result, rules } = drill;
  const chartData = result.equity.map((e) => ({
    date: new Date(e.t).toLocaleDateString(),
    value: Math.round(e.value),
  }));
  return (
    <Dialog open={!!drill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Sensitivity cell drill-down</DialogTitle>
          <DialogDescription className="text-xs">
            {axisXLabel} = <span className="font-semibold text-foreground">{drill.x.toFixed(3)}</span> ·{" "}
            {axisYLabel} = <span className="font-semibold text-foreground">{drill.y.toFixed(3)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <Kpi label="Return" value={`${result.metrics.totalReturn >= 0 ? "+" : ""}${result.metrics.totalReturn.toFixed(2)}%`} sign={result.metrics.totalReturn >= 0 ? "success" : "destructive"} />
          <Kpi label="Max DD" value={`${result.metrics.maxDrawdown.toFixed(2)}%`} sign="destructive" />
          <Kpi label="Sharpe" value={result.metrics.sharpe.toFixed(2)} sign="foreground" />
          <Kpi label="Trades" value={String(result.metrics.totalTrades)} sign="foreground" />
        </div>

        <div className="mb-3 p-2 rounded border border-border bg-muted/20 text-[11px] space-y-1">
          <p><span className="text-success font-medium">ENTRY</span>: {rules.entry.map(describeCondition).join(" AND ") || "—"}</p>
          <p><span className="text-destructive font-medium">EXIT</span>: {rules.exit.map(describeCondition).join(" AND ") || "—"}
            {rules.risk.stopPct ? ` · stop ${rules.risk.stopPct}%` : ""}
            {rules.risk.targetPct ? ` · target ${rules.risk.targetPct}%` : ""}
          </p>
          <p className="text-[10px] text-muted-foreground">Initial capital: {initial.toLocaleString()} · Final equity: {(result.equity[result.equity.length - 1]?.value ?? initial).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="drillEq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
            <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="url(#drillEq)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>

        <div className="mt-3">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-semibold">Trade log</p>
            <Badge variant="outline" className="text-[10px]">{result.trades.length} executions</Badge>
          </div>
          {result.trades.length === 0 ? (
            <p className="text-xs text-muted-foreground">This parameter combination produced no trades.</p>
          ) : (
            <div className="max-h-52 overflow-auto space-y-0.5">
              {result.trades.map((t, i) => (
                <div key={i} className="flex justify-between text-[11px] border-b border-border/40 py-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={t.type === "BUY" ? "default" : "secondary"} className="text-[9px]">{t.type}</Badge>
                    <span className="text-muted-foreground">{t.date}</span>
                  </div>
                  <span>@ {t.price.toFixed(2)} · {t.shares.toFixed(2)} sh</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ label, value, sign }: { label: string; value: string; sign: "success" | "destructive" | "foreground" }) {
  const colorClass = sign === "success" ? "text-success" : sign === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="p-2 rounded-md border border-border bg-muted/20">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${colorClass}`}>{value}</p>
    </div>
  );
}