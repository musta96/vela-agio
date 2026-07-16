import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, ArrowRight } from "lucide-react";
import type { Condition, RiskConfig } from "@/lib/ta/strategyTypes";
import type { CostConfig } from "@/lib/backtest/costs";
import type { Bar, SimResult } from "@/lib/backtest/clientSim";
import { simulateCustom } from "@/lib/backtest/clientSim";
import { runCachedParallel } from "@/lib/backtest/simCache";

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

const OBJECTIVES: Array<{ key: "totalReturn" | "sharpe" | "winRate"; label: string }> = [
  { key: "sharpe", label: "Sharpe" },
  { key: "totalReturn", label: "Total return %" },
  { key: "winRate", label: "Win rate %" },
];

interface FoldResult {
  fold: number;
  isFrom: string; isTo: string;
  oosFrom: string; oosTo: string;
  bestX: number; bestY: number;
  isMetric: number;
  oosReturn: number;
  oosSharpe: number;
  oosMaxDD: number;
  oosTrades: number;
}

export function WalkForwardOptimizerCard({ bars, rules, initial, costs }: Props) {
  const axes = useMemo(() => buildAxisOptions(rules), [rules]);
  const [axisXKey, setAxisXKey] = useState<string>(() => axes[0]?.label ?? "");
  const [axisYKey, setAxisYKey] = useState<string>(() => (axes[1] ?? axes[0])?.label ?? "");
  const [xFrom, setXFrom] = useState<number>(20);
  const [xTo, setXTo] = useState<number>(40);
  const [yFrom, setYFrom] = useState<number>(60);
  const [yTo, setYTo] = useState<number>(80);
  const [steps, setSteps] = useState<number>(4);
  const [folds, setFolds] = useState<number>(4);
  const [trainPct, setTrainPct] = useState<number>(70);
  const [objective, setObjective] = useState<typeof OBJECTIVES[number]["key"]>("sharpe");
  const [results, setResults] = useState<FoldResult[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [running, setRunning] = useState(false);

  if (axes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /><CardTitle className="text-base">Walk-forward optimization</CardTitle></div>
          <CardDescription className="text-xs">Requires a custom strategy with at least one numeric parameter to optimize.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const axisX = axes.find((a) => a.label === axisXKey) ?? axes[0];
  const axisY = axes.find((a) => a.label === axisYKey) ?? axes[0];

  const runOptimization = async () => {
    setRunning(true);
    setResults(null);
    const xs = linspace(xFrom, xTo, steps);
    const ys = linspace(yFrom, yTo, steps);
    const foldSize = Math.floor(bars.length / folds);
    if (foldSize < 20) {
      setRunning(false);
      return;
    }
    const totalPerFold = xs.length * ys.length;
    setProgress({ done: 0, total: folds * totalPerFold });

    const out: FoldResult[] = [];
    let done = 0;

    for (let f = 0; f < folds; f++) {
      const fromIdx = f * foldSize;
      const toIdx = f === folds - 1 ? bars.length : (f + 1) * foldSize;
      const foldBars = bars.slice(fromIdx, toIdx);
      const splitIdx = Math.floor((foldBars.length * trainPct) / 100);
      const isBars = foldBars.slice(0, splitIdx);
      const oosBars = foldBars.slice(splitIdx);
      if (isBars.length < 20 || oosBars.length < 10) {
        done += totalPerFold;
        setProgress({ done, total: folds * totalPerFold });
        continue;
      }

      // In-sample grid search — parallelized across the worker pool.
      const jobs: { rules: Props["rules"]; x: number; y: number }[] = [];
      for (const y of ys) for (const x of xs) {
        let r = applyAxis(rules, axisX, x);
        r = applyAxis(r, axisY, y);
        jobs.push({ rules: r, x, y });
      }
      const baseDone = done;
      const { results: isResults } = await runCachedParallel(
        isBars, jobs.map((j) => j.rules), initial, costs,
        (d) => { done = baseDone + d; setProgress({ done, total: folds * totalPerFold }); },
      );
      let best: { x: number; y: number; metric: number } | null = null;
      for (let k = 0; k < jobs.length; k++) {
        const m = isResults[k].metrics[objective];
        if (best === null || m > best.metric) best = { x: jobs[k].x, y: jobs[k].y, metric: m };
      }
      done = baseDone + jobs.length;
      setProgress({ done, total: folds * totalPerFold });
      if (!best) continue;

      // Evaluate best on the out-of-sample slice, starting fresh capital.
      let r = applyAxis(rules, axisX, best.x);
      r = applyAxis(r, axisY, best.y);
      const oosRes: SimResult = simulateCustom(oosBars, r, initial, costs);

      out.push({
        fold: f + 1,
        isFrom: new Date(isBars[0].t).toISOString().slice(0, 10),
        isTo:   new Date(isBars[isBars.length - 1].t).toISOString().slice(0, 10),
        oosFrom: new Date(oosBars[0].t).toISOString().slice(0, 10),
        oosTo:   new Date(oosBars[oosBars.length - 1].t).toISOString().slice(0, 10),
        bestX: best.x, bestY: best.y,
        isMetric: best.metric,
        oosReturn: oosRes.metrics.totalReturn,
        oosSharpe: oosRes.metrics.sharpe,
        oosMaxDD:  oosRes.metrics.maxDrawdown,
        oosTrades: oosRes.metrics.totalTrades,
      });
    }

    setResults(out);
    setRunning(false);
  };

  const aggregate = useMemo(() => {
    if (!results || results.length === 0) return null;
    const n = results.length;
    const meanOosRet = results.reduce((s, r) => s + r.oosReturn, 0) / n;
    const meanOosSharpe = results.reduce((s, r) => s + r.oosSharpe, 0) / n;
    const positive = results.filter((r) => r.oosReturn > 0).length;
    const worstDd = Math.min(...results.map((r) => r.oosMaxDD));
    const label = positive / n >= 0.75 && meanOosRet > 0 ? "Robust out-of-sample"
                 : positive / n >= 0.5 && meanOosRet > 0 ? "Mixed"
                 : meanOosRet > 0 ? "Fragile positive" : "Fragile / overfit";
    return { meanOosRet, meanOosSharpe, positive, n, worstDd, label };
  }, [results]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /><CardTitle className="text-base">Walk-forward optimization</CardTitle></div>
        <CardDescription className="text-xs">
          For each fold, grid-search the best parameter combo on the training slice and evaluate it unchanged on the following out-of-sample slice. Consistent OOS returns = a strategy that generalizes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          <ParamRange label="X parameter" axes={axes} axisKey={axisX.label} setAxisKey={setAxisXKey}
                      from={xFrom} to={xTo} setFrom={setXFrom} setTo={setXTo} />
          <ParamRange label="Y parameter" axes={axes} axisKey={axisY.label} setAxisKey={setAxisYKey}
                      from={yFrom} to={yTo} setFrom={setYFrom} setTo={setYTo} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-[11px]">Grid steps</Label>
            <Input type="number" min={2} max={7} value={steps}
                   onChange={(e) => setSteps(Math.max(2, Math.min(7, Number(e.target.value) || 2)))}
                   className="h-8 w-16 text-xs" />
          </div>
          <div>
            <Label className="text-[11px]">Folds</Label>
            <Input type="number" min={2} max={8} value={folds}
                   onChange={(e) => setFolds(Math.max(2, Math.min(8, Number(e.target.value) || 2)))}
                   className="h-8 w-16 text-xs" />
          </div>
          <div>
            <Label className="text-[11px]">Train %</Label>
            <Input type="number" min={40} max={90} value={trainPct}
                   onChange={(e) => setTrainPct(Math.max(40, Math.min(90, Number(e.target.value) || 70)))}
                   className="h-8 w-16 text-xs" />
          </div>
          <div>
            <Label className="text-[11px]">Objective</Label>
            <Select value={objective} onValueChange={(v) => setObjective(v as any)}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{OBJECTIVES.map((o) => <SelectItem key={o.key} value={o.key} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={runOptimization} disabled={running || bars.length < 80}>
            {running ? "Optimizing…" : `Run · ${folds}×${steps * steps} sims`}
          </Button>
        </div>

        {(running || progress.done > 0) && (
          <div className="space-y-1">
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} className="h-1.5" />
            <p className="text-[10px] text-muted-foreground">{progress.done}/{progress.total} simulations</p>
          </div>
        )}

        {results && results.length === 0 && (
          <p className="text-xs text-muted-foreground">Not enough bars for the chosen folds. Lower the fold count or extend the backtest range.</p>
        )}

        {results && results.length > 0 && (
          <>
            {aggregate && (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <Badge variant="outline">{aggregate.label}</Badge>
                <span className="text-muted-foreground">
                  OOS avg return <span className={aggregate.meanOosRet >= 0 ? "text-success font-semibold" : "text-destructive font-semibold"}>
                    {aggregate.meanOosRet >= 0 ? "+" : ""}{aggregate.meanOosRet.toFixed(2)}%
                  </span> · avg Sharpe <span className="font-semibold text-foreground">{aggregate.meanOosSharpe.toFixed(2)}</span> ·
                  {" "}{aggregate.positive}/{aggregate.n} positive folds · worst DD {aggregate.worstDd.toFixed(2)}%
                </span>
              </div>
            )}
            <div className="overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left py-1 pr-2">Fold</th>
                    <th className="text-left py-1 pr-2">In-sample</th>
                    <th className="text-left py-1 pr-2">Best params</th>
                    <th className="text-right py-1 pr-2">IS {objective}</th>
                    <th className="text-left py-1 pr-2">Out-of-sample</th>
                    <th className="text-right py-1 pr-2">OOS return</th>
                    <th className="text-right py-1 pr-2">OOS Sharpe</th>
                    <th className="text-right py-1 pr-2">OOS DD</th>
                    <th className="text-right py-1 pr-2">Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.fold} className="border-t border-border">
                      <td className="py-1.5 pr-2 font-semibold">F{r.fold}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{r.isFrom} → {r.isTo}</td>
                      <td className="py-1.5 pr-2">
                        <span className="font-medium">{axisX.label.split("·").pop()?.trim()}={r.bestX.toFixed(2)}</span>
                        <ArrowRight className="inline h-3 w-3 mx-1 text-muted-foreground" />
                        <span className="font-medium">{axisY.label.split("·").pop()?.trim()}={r.bestY.toFixed(2)}</span>
                      </td>
                      <td className="text-right pr-2">{r.isMetric.toFixed(2)}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{r.oosFrom} → {r.oosTo}</td>
                      <td className={`text-right pr-2 font-semibold ${r.oosReturn >= 0 ? "text-success" : "text-destructive"}`}>
                        {r.oosReturn >= 0 ? "+" : ""}{r.oosReturn.toFixed(2)}%
                      </td>
                      <td className="text-right pr-2">{r.oosSharpe.toFixed(2)}</td>
                      <td className="text-right pr-2 text-destructive">{r.oosMaxDD.toFixed(2)}%</td>
                      <td className="text-right pr-2 text-muted-foreground">{r.oosTrades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground">
              A big IS/OOS gap (great in-sample, poor out-of-sample) is the classic overfitting signature.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ParamRange({
  label, axes, axisKey, setAxisKey, from, to, setFrom, setTo,
}: {
  label: string;
  axes: AxisKind[];
  axisKey: string;
  setAxisKey: (v: string) => void;
  from: number; to: number;
  setFrom: (v: number) => void; setTo: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Select value={axisKey} onValueChange={setAxisKey}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{axes.map((a) => <SelectItem key={a.label} value={a.label} className="text-xs">{a.label}</SelectItem>)}</SelectContent>
      </Select>
      <div className="grid grid-cols-2 gap-1">
        <Input type="number" value={from} onChange={(e) => setFrom(Number(e.target.value))} className="h-8 text-xs" />
        <Input type="number" value={to}   onChange={(e) => setTo(Number(e.target.value))}   className="h-8 text-xs" />
      </div>
    </div>
  );
}