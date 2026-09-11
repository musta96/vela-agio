import { useMemo } from "react";

interface MiniSparklineProps {
  trend?: "up" | "down" | "flat";
  points?: number[];
  width?: number;
  height?: number;
  className?: string;
  stroke?: string;
}

/** Tiny inline sparkline matching v2 mockup pack. */
export function MiniSparkline({
  trend,
  points,
  width = 96,
  height = 28,
  className = "",
  stroke,
}: MiniSparklineProps) {
  const data = useMemo(() => {
    const clean = (points ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (clean.length > 1) return clean;
    if (trend === "down") return [9, 8, 9, 7, 8, 6, 5, 4, 3];
    if (trend === "flat") return [5, 5, 6, 5, 5, 6, 5, 5, 5];
    return [3, 4, 4, 5, 6, 6, 8, 9, 10];
  }, [points, trend]);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const path = data
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(2)},${(height - ((v - min) / range) * (height - 4) - 2).toFixed(2)}`)
    .join(" ");

  const inferred = (() => {
    if (stroke) return stroke;
    const dir = data[data.length - 1] - data[0];
    if (dir > 0) return "hsl(var(--success))";
    if (dir < 0) return "hsl(var(--destructive))";
    return "hsl(var(--muted-foreground))";
  })();

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <path d={path} stroke={inferred} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function ChangePill({ pct, className = "" }: { pct: number; className?: string }) {
  const value = typeof pct === "number" && Number.isFinite(pct) ? pct : 0;
  const positive = value > 0.005;
  const negative = pct < -0.005;
  const cls = positive
    ? "text-success"
    : negative
    ? "text-destructive"
    : "text-muted-foreground";
  const sign = positive ? "+" : "";
  return (
    <span className={`text-sm font-semibold tabular-nums ${cls} ${className}`}>
      {sign}{pct.toFixed(2)}%
    </span>
  );
}