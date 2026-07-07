import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import type { PayoffPoint } from "@/lib/options/payoff";

interface Props {
  points: PayoffPoint[];
  breakevens: number[];
  spot: number | null;
  strikes: number[];
  maxProfit: number;
  maxLoss: number;
}

function fmtUsd(n: number) {
  if (!Number.isFinite(n)) return n > 0 ? "∞" : "-∞";
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(0)}`;
}

export function PayoffChart({ points, breakevens, spot, strikes, maxProfit, maxLoss }: Props) {
  const data = useMemo(
    () =>
      points.map((p) => ({
        S: p.S,
        pnl: p.pnl,
        profit: p.pnl >= 0 ? p.pnl : 0,
        loss: p.pnl < 0 ? p.pnl : 0,
      })),
    [points],
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Stat label="Max profit" value={fmtUsd(maxProfit)} tone={Number.isFinite(maxProfit) ? "pos" : "warn"} />
        <Stat label="Max loss" value={fmtUsd(maxLoss)} tone={Number.isFinite(maxLoss) ? "neg" : "danger"} />
        <Stat
          label="Breakeven(s)"
          value={breakevens.length ? breakevens.map((b) => `$${b.toFixed(2)}`).join(", ") : "none"}
        />
        <Stat label="Spot" value={spot != null ? `$${spot.toFixed(2)}` : "—"} />
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis
              dataKey="S"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
              tick={{ fontSize: 10 }}
              stroke="hsl(var(--muted-foreground))"
            />
            <YAxis
              tickFormatter={(v) => fmtUsd(Number(v))}
              tick={{ fontSize: 10 }}
              stroke="hsl(var(--muted-foreground))"
              width={56}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 11,
              }}
              formatter={(v: number) => fmtUsd(v)}
              labelFormatter={(v: number) => `Underlying $${v.toFixed(2)}`}
            />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
            {spot != null && (
              <ReferenceLine
                x={spot}
                stroke="hsl(var(--primary))"
                strokeDasharray="3 3"
                label={{ value: "spot", fontSize: 10, fill: "hsl(var(--primary))", position: "top" }}
              />
            )}
            {strikes.map((k) => (
              <ReferenceLine
                key={`k-${k}`}
                x={k}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="1 3"
                opacity={0.6}
              />
            ))}
            {breakevens.map((b, i) => (
              <ReferenceLine
                key={`be-${i}`}
                x={b}
                stroke="hsl(var(--warning, var(--foreground)))"
                label={{ value: `BE ${b.toFixed(2)}`, fontSize: 10, position: "insideTopRight" }}
              />
            ))}
            <Area type="monotone" dataKey="profit" stroke="none" fill="hsl(142 71% 45% / 0.25)" isAnimationActive={false} />
            <Area type="monotone" dataKey="loss" stroke="none" fill="hsl(0 72% 51% / 0.25)" isAnimationActive={false} />
            <Line type="monotone" dataKey="pnl" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" | "warn" | "danger" }) {
  const cls =
    tone === "pos" ? "text-emerald-500"
    : tone === "neg" ? "text-red-500"
    : tone === "warn" ? "text-amber-500"
    : tone === "danger" ? "text-red-600"
    : "text-foreground";
  return (
    <div className="p-2 rounded-md border border-border bg-muted/30">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}