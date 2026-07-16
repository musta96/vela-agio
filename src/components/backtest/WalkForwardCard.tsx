import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GitBranch, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export interface WfEquityPoint { t: number; value: number; }

interface Props {
  equity: WfEquityPoint[];
}

interface WindowStats {
  index: number;
  from: string;
  to: string;
  returnPct: number;
  maxDdPct: number;
  sharpe: number;
  points: number;
}

function computeSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(252);
}

function splitStats(equity: WfEquityPoint[], splits: number): WindowStats[] {
  if (equity.length < splits * 4) return [];
  const size = Math.floor(equity.length / splits);
  const out: WindowStats[] = [];
  for (let i = 0; i < splits; i++) {
    const from = i * size;
    const to = i === splits - 1 ? equity.length - 1 : (i + 1) * size - 1;
    const slice = equity.slice(from, to + 1);
    const start = slice[0].value;
    const end = slice[slice.length - 1].value;
    const returnPct = start > 0 ? ((end - start) / start) * 100 : 0;
    // Drawdown within window
    let peak = slice[0].value;
    let maxDd = 0;
    for (const p of slice) {
      if (p.value > peak) peak = p.value;
      const dd = peak > 0 ? ((p.value - peak) / peak) * 100 : 0;
      if (dd < maxDd) maxDd = dd;
    }
    // Daily returns for sharpe
    const rets: number[] = [];
    for (let j = 1; j < slice.length; j++) {
      const prev = slice[j - 1].value;
      if (prev > 0) rets.push((slice[j].value - prev) / prev);
    }
    out.push({
      index: i + 1,
      from: new Date(slice[0].t).toISOString().slice(0, 10),
      to: new Date(slice[slice.length - 1].t).toISOString().slice(0, 10),
      returnPct,
      maxDdPct: maxDd,
      sharpe: computeSharpe(rets),
      points: slice.length,
    });
  }
  return out;
}

export function WalkForwardCard({ equity }: Props) {
  const [splits, setSplits] = useState<number>(4);
  const stats = useMemo(() => splitStats(equity, splits), [equity, splits]);

  const robustness = useMemo(() => {
    if (stats.length === 0) return null;
    const positive = stats.filter((s) => s.returnPct > 0).length;
    const consistency = (positive / stats.length) * 100;
    const meanRet = stats.reduce((s, w) => s + w.returnPct, 0) / stats.length;
    const stdRet = Math.sqrt(
      stats.reduce((s, w) => s + (w.returnPct - meanRet) ** 2, 0) / stats.length,
    );
    const worstDd = Math.min(...stats.map((s) => s.maxDdPct));
    let label: string;
    if (consistency >= 75 && meanRet > 0) label = "Robust";
    else if (consistency >= 50 && meanRet > 0) label = "Mixed";
    else if (meanRet > 0) label = "Fragile positive";
    else label = "Fragile";
    return { positive, consistency, meanRet, stdRet, worstDd, label };
  }, [stats]);

  const chartData = stats.map((s) => ({
    window: `W${s.index}`,
    return: Number(s.returnPct.toFixed(2)),
    dd: Number(s.maxDdPct.toFixed(2)),
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Walk-forward robustness</CardTitle>
            {robustness && (
              <Badge variant="outline" className="text-[10px]">
                {robustness.label} · {robustness.positive}/{stats.length} positive
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Splits</Label>
            <Select value={String(splits)} onValueChange={(v) => setSplits(Number(v))}>
              <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[3, 4, 5, 6, 8, 10].map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <CardDescription className="text-xs">
          Splits the completed backtest into contiguous windows and measures return, drawdown and Sharpe in each. A strategy that only works in one window is fragile.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {stats.length === 0 && (
          <p className="text-xs text-muted-foreground">Not enough data points for {splits} splits. Extend the backtest range or reduce splits.</p>
        )}
        {stats.length > 0 && (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-4">
              {stats.map((s) => {
                const sign = s.returnPct > 0 ? "success" : s.returnPct < 0 ? "destructive" : "muted-foreground";
                return (
                  <div key={s.index} className={`p-2 rounded-md border text-xs ${
                    s.returnPct > 0 ? "border-success/40 bg-success/10"
                    : s.returnPct < 0 ? "border-destructive/40 bg-destructive/10"
                    : "border-border bg-muted/20"
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">Window {s.index}</span>
                      {s.returnPct > 0 ? <TrendingUp className="h-3.5 w-3.5 text-success" />
                        : s.returnPct < 0 ? <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                        : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{s.from} → {s.to}</p>
                    <p className={`text-sm font-semibold text-${sign}`}>{s.returnPct >= 0 ? "+" : ""}{s.returnPct.toFixed(2)}%</p>
                    <p className="text-[10px] text-muted-foreground">DD {s.maxDdPct.toFixed(2)}% · Sharpe {s.sharpe.toFixed(2)}</p>
                  </div>
                );
              })}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="wfRet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="window" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  formatter={(v: number, name) => [`${v.toFixed(2)}%`, name]}
                />
                <Area type="monotone" dataKey="return" name="Return %" stroke="hsl(var(--primary))" fill="url(#wfRet)" strokeWidth={2} />
                <Area type="monotone" dataKey="dd" name="Max DD %" stroke="hsl(var(--destructive))" fill="none" strokeWidth={1.5} strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
            {robustness && (
              <p className="text-[11px] text-muted-foreground mt-3">
                Mean per-window return {robustness.meanRet.toFixed(2)}%, standard deviation {robustness.stdRet.toFixed(2)}%,
                worst window drawdown {robustness.worstDd.toFixed(2)}%. Lower std &amp; higher positive-window ratio = more robust.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}