import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Line, LineChart, ReferenceDot,
} from "recharts";

export interface BtEquityPoint { t: number; value: number; benchmark: number; }
export interface BtTrade { date: string; type: "BUY" | "SELL"; price: number; shares: number; }

interface Props {
  equity: BtEquityPoint[];
  trades: BtTrade[];
  title?: string;
  compact?: boolean;
}

/**
 * Detail charts for a backtest result: Drawdown curve and Trade Timeline.
 * (Equity curve stays on the parent page — this file adds the two extras
 *  that were missing so results are actionable.)
 */
export function BacktestDetailCharts({ equity, trades, title, compact }: Props) {
  const { drawdown, maxDd, peakDate, troughDate } = useMemo(() => {
    if (!equity.length) return { drawdown: [] as Array<{ date: string; dd: number; t: number }>, maxDd: 0, peakDate: "", troughDate: "" };
    let peak = equity[0].value;
    let peakIdx = 0;
    let maxDdLocal = 0;
    let mPeak = "";
    let mTrough = "";
    const dd = equity.map((p, i) => {
      if (p.value > peak) { peak = p.value; peakIdx = i; }
      const d = peak > 0 ? ((p.value - peak) / peak) * 100 : 0;
      if (d < maxDdLocal) {
        maxDdLocal = d;
        mPeak = new Date(equity[peakIdx].t).toISOString().slice(0, 10);
        mTrough = new Date(p.t).toISOString().slice(0, 10);
      }
      return { date: new Date(p.t).toISOString().slice(0, 10), dd: Number(d.toFixed(3)), t: p.t };
    });
    return { drawdown: dd, maxDd: maxDdLocal, peakDate: mPeak, troughDate: mTrough };
  }, [equity]);

  // Map trades onto the equity curve to place markers.
  const timelineData = useMemo(() => {
    const byDate = new Map(equity.map((p) => [new Date(p.t).toISOString().slice(0, 10), p]));
    return equity.map((p) => ({ date: new Date(p.t).toISOString().slice(0, 10), value: p.value }));
  }, [equity]);

  const tradeMarkers = useMemo(() => {
    return trades
      .map((t) => {
        const point = timelineData.find((p) => p.date === t.date);
        return point ? { ...t, value: point.value } : null;
      })
      .filter((x): x is (BtTrade & { value: number }) => x !== null);
  }, [trades, timelineData]);

  const wins = trades.length ? Math.floor(trades.length / 2) : 0;

  return (
    <div className={compact ? "grid gap-3 lg:grid-cols-2" : "space-y-4"}>
      <Card>
        <CardHeader className={compact ? "pb-2" : undefined}>
          <CardTitle className="text-base flex items-center gap-2">
            Drawdown curve
            <Badge variant="outline" className="text-[10px]">
              max {maxDd.toFixed(2)}%
            </Badge>
          </CardTitle>
          {peakDate && (
            <CardDescription className="text-xs">
              Peak-to-trough: {peakDate} → {troughDate}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className={compact ? "pt-2" : undefined}>
          <ResponsiveContainer width="100%" height={compact ? 180 : 240}>
            <AreaChart data={drawdown}>
              <defs>
                <linearGradient id="ddG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} minTickGap={40} />
              <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                formatter={(v: number) => [`${v.toFixed(2)}%`, "Drawdown"]}
              />
              <Area type="monotone" dataKey="dd" stroke="hsl(var(--destructive))" fill="url(#ddG)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={compact ? "pb-2" : undefined}>
          <CardTitle className="text-base flex items-center gap-2">
            Trade timeline
            <Badge variant="outline" className="text-[10px]">
              {trades.length} trades · ~{wins} pairs
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Green = BUY · Red = SELL, plotted over portfolio value.
          </CardDescription>
        </CardHeader>
        <CardContent className={compact ? "pt-2" : undefined}>
          <ResponsiveContainer width="100%" height={compact ? 200 : 260}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} minTickGap={40} />
              <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                formatter={(v: number) => Math.round(v).toLocaleString()}
              />
              <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
              {tradeMarkers.map((m, i) => (
                <ReferenceDot
                  key={i}
                  x={m.date}
                  y={m.value}
                  r={4}
                  fill={m.type === "BUY" ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                  stroke="hsl(var(--background))"
                  strokeWidth={1}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {title && <p className="mt-2 text-[11px] text-muted-foreground">{title}</p>}
        </CardContent>
      </Card>
    </div>
  );
}