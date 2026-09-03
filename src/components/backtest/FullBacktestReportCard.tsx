// Full backtest runner for the Advanced Analysis page: executes a preset
// strategy on the loaded real OHLCV series and renders a complete report
// (metrics, equity curve, trade list) with the entry/exit signals used.

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { simulateCustom, type SimResult } from "@/lib/backtest/clientSim";
import type { StrategyRule } from "@/lib/ta/strategyTypes";
import type { Bar } from "@/lib/ta/types";
import { Play, LineChart as LineChartIcon } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceDot } from "recharts";

type PresetKey = "sma_cross" | "rsi_reversion" | "ema_atr";

const PRESETS: Record<PresetKey, { label: string; describe: string; build: () => StrategyRule }> = {
  sma_cross: {
    label: "SMA 20/50 cross",
    describe: "Buy on 20>50 golden cross, sell on death cross.",
    build: () => ({
      entry: [{ type: "sma_cross_up", fast: 20, slow: 50 }],
      exit: [{ type: "sma_cross_down", fast: 20, slow: 50 }],
      risk: { stopPct: 8 },
    }),
  },
  rsi_reversion: {
    label: "RSI mean reversion",
    describe: "Buy RSI(14) < 30, exit RSI > 55 or 6% stop.",
    build: () => ({
      entry: [{ type: "rsi_below", value: 30, period: 14 }],
      exit: [{ type: "rsi_above", value: 55, period: 14 }],
      risk: { stopPct: 6 },
    }),
  },
  ema_atr: {
    label: "EMA 12/26 + ATR stop",
    describe: "Buy EMA cross up, trail with a 2×ATR stop.",
    build: () => ({
      entry: [{ type: "ema_cross_up", fast: 12, slow: 26 }],
      exit: [{ type: "ema_cross_down", fast: 12, slow: 26 }],
      risk: { atrStopMult: 2 },
    }),
  },
};

export function FullBacktestReportCard({ bars, symbol }: { bars: Bar[]; symbol: string }) {
  const [preset, setPreset] = useState<PresetKey>("sma_cross");
  const [initial, setInitial] = useState(10000);
  const [result, setResult] = useState<SimResult | null>(null);
  const [ran, setRan] = useState(false);

  const run = () => {
    const simBars = bars.map((b) => ({ t: b.t, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
    setResult(simulateCustom(simBars, PRESETS[preset].build(), Math.max(100, initial)));
    setRan(true);
  };

  const equity = useMemo(
    () => (result ? result.equity.map((p) => ({ date: new Date(p.t).toLocaleDateString(), value: +p.value.toFixed(2) })) : []),
    [result],
  );
  const tradeDots = useMemo(() => {
    if (!result) return [];
    const byTime = new Map(result.equity.map((p) => [p.t, p.value]));
    return result.trades
      .map((tr) => ({ ...tr, date: new Date(tr.t).toLocaleDateString(), equity: byTime.get(tr.t) }))
      .filter((tr) => tr.equity != null);
  }, [result]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LineChartIcon className="h-5 w-5 text-primary" /> Full backtest on real OHLCV — {symbol}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="bt-preset">Strategy preset</Label>
            <select
              id="bt-preset"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={preset}
              onChange={(e) => { setPreset(e.target.value as PresetKey); setRan(false); }}
            >
              {Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">{PRESETS[preset].describe}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bt-initial">Initial capital</Label>
            <Input id="bt-initial" type="number" min={100} value={initial} onChange={(e) => setInitial(Number(e.target.value) || 10000)} />
          </div>
          <Button onClick={run} className="gap-2"><Play className="h-4 w-4" /> Run backtest</Button>
        </div>

        {ran && result && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Metric label="Total return" value={`${(result.metrics.totalReturn * 100).toFixed(2)}%`} tone={result.metrics.totalReturn >= 0 ? "up" : "down"} />
              <Metric label="Max drawdown" value={`${(result.metrics.maxDrawdown * 100).toFixed(2)}%`} tone="down" />
              <Metric label="Sharpe" value={result.metrics.sharpe.toFixed(2)} />
              <Metric label="Win rate" value={`${(result.metrics.winRate * 100).toFixed(1)}%`} />
              <Metric label="Trades" value={String(result.metrics.totalTrades)} />
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equity} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} minTickGap={48} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} domain={["auto", "auto"]} width={70} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} name="Equity" />
                  {tradeDots.map((tr, i) => (
                    <ReferenceDot
                      key={i}
                      x={tr.date}
                      y={tr.equity as number}
                      r={4}
                      fill={tr.type === "BUY" ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                      stroke="none"
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground">
              Green dots = entry signals, red dots = exit signals. Executed on the real OHLCV series loaded above ({bars.length} bars).
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2">Date</th><th className="pb-2">Side</th><th className="pb-2">Price</th><th className="pb-2">Shares</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.slice(-20).map((tr, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2">{tr.date}</td>
                      <td className={`py-2 font-medium ${tr.type === "BUY" ? "text-success" : "text-destructive"}`}>{tr.type}</td>
                      <td className="py-2 font-mono">{tr.price.toFixed(2)}</td>
                      <td className="py-2 font-mono">{tr.shares.toFixed(4)}</td>
                    </tr>
                  ))}
                  {result.trades.length === 0 && (
                    <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No trades triggered on this interval — try another preset or a longer history.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-lg font-semibold ${tone === "up" ? "text-success" : tone === "down" ? "text-destructive" : ""}`}>{value}</p>
    </Card>
  );
}
