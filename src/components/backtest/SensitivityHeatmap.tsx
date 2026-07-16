import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Grid3x3 } from "lucide-react";
import type { Condition, RiskConfig } from "@/lib/ta/strategyTypes";
import type { CostConfig } from "@/lib/backtest/costs";
import { simulateCustom, type Bar } from "@/lib/backtest/clientSim";

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
    const g: number[][] = [];
    // Non-blocking: yield to the event loop every row so the UI stays responsive.
    for (let yi = 0; yi < ys.length; yi++) {
      const row: number[] = [];
      for (let xi = 0; xi < xs.length; xi++) {
        let r = applyAxis(rules, axisX, xs[xi]);
        r = applyAxis(r, axisY, ys[yi]);
        const res = simulateCustom(bars, r, initial, costs);
        row.push(res.metrics[metricKey]);
      }
      g.push(row);
      await new Promise((res) => setTimeout(res, 0));
    }
    setXVals(xs); setYVals(ys); setGrid(g); setRunning(false);
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
                      <td key={xi} className="text-center px-2 py-1 rounded font-medium" style={{ backgroundColor: cellColor(v) }}>
                        {v.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-muted-foreground mt-2">
              Range: {min.toFixed(2)} → {max.toFixed(2)}. A single hot cell surrounded by cool ones suggests overfitting.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}