import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { histogram, quantile } from "@/lib/quantScenarios";

/**
 * Reusable Monte Carlo distribution chart.
 * Renders a histogram of `values` (e.g. final portfolio values from MC paths)
 * with vertical markers at p05 / p50 / p95 and an optional target line.
 */
export interface MonteCarloHistogramProps {
  values: number[];
  /** Optional target/threshold (e.g. goal amount). Renders a dashed line. */
  target?: number;
  /** Currency or unit prefix for labels (e.g. "€"). */
  unit?: string;
  /** Number of bins (default 24). */
  bins?: number;
  /** Chart height in px. */
  height?: number;
  /** Bins whose centre falls inside this [min, max] range render in the
   *  accent colour, drawing the eye to the user's drilldown selection. */
  highlightRange?: [number, number] | null;
  /** Optional label drawn on the highlight band. */
  highlightLabel?: string;
}

export function MonteCarloHistogram({
  values,
  target,
  unit = "€",
  bins = 24,
  height = 240,
  highlightRange,
  highlightLabel,
}: MonteCarloHistogramProps) {
  const data = useMemo(() => histogram(values, bins), [values, bins]);
  const p05 = useMemo(() => quantile(values, 0.05), [values]);
  const p50 = useMemo(() => quantile(values, 0.50), [values]);
  const p95 = useMemo(() => quantile(values, 0.95), [values]);

  const fmt = (v: number) =>
    Math.abs(v) >= 1_000_000 ? `${unit}${(v / 1_000_000).toFixed(1)}M`
    : Math.abs(v) >= 1_000 ? `${unit}${(v / 1_000).toFixed(0)}k`
    : `${unit}${v.toFixed(0)}`;

  if (!values.length) {
    return <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No simulation data.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis
          dataKey="bin"
          tickFormatter={fmt}
          tick={{ fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v: number) => [`${v} paths`, "Frequency"]}
          labelFormatter={(label: number, payload: any) => {
            const row = payload?.[0]?.payload;
            return row ? `${fmt(row.low)} – ${fmt(row.high)}` : fmt(label);
          }}
          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
        />
        <Bar dataKey="count" fill="hsl(var(--primary))" opacity={0.85}>
          {data.map((d, i) => {
            const inRange = !!highlightRange
              && d.bin >= highlightRange[0]
              && d.bin <= highlightRange[1];
            return (
              <Cell
                key={`bin-${i}`}
                fill={inRange ? "hsl(var(--warning))" : "hsl(var(--primary))"}
                opacity={inRange ? 0.95 : 0.55}
              />
            );
          })}
        </Bar>
        {highlightRange && (
          <ReferenceLine
            x={highlightRange[1]}
            stroke="hsl(var(--warning))"
            strokeDasharray="4 2"
            label={highlightLabel ? { value: highlightLabel, position: "insideTop", fontSize: 10, fill: "hsl(var(--warning))" } : undefined}
          />
        )}
        <ReferenceLine x={p05} stroke="hsl(var(--bear))" strokeDasharray="3 3" label={{ value: "P5", position: "top", fontSize: 10, fill: "hsl(var(--bear))" }} />
        <ReferenceLine x={p50} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: "P50", position: "top", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <ReferenceLine x={p95} stroke="hsl(var(--bull))" strokeDasharray="3 3" label={{ value: "P95", position: "top", fontSize: 10, fill: "hsl(var(--bull))" }} />
        {typeof target === "number" && (
          <ReferenceLine x={target} stroke="hsl(var(--primary))" strokeWidth={2} label={{ value: "Target", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--primary))" }} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

export default MonteCarloHistogram;