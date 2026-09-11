interface Props {
  values: number[];
  width?: number;
  height?: number;
  label?: string;
}

/** Tiny inline trend line built from stored watchlist snapshots. */
export function Sparkline({ values, width = 90, height = 26, label }: Props) {
  const clean = (values ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (clean.length < 2) return null;
  values = clean;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 4) - 2).toFixed(1)}`)
    .join(" ");
  const rising = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} role="img" aria-label={label ?? "Price trend"} className="overflow-visible">
      <title>{label ?? "Price trend"}</title>
      <path
        d={d}
        fill="none"
        strokeWidth={1.5}
        className={rising ? "stroke-success" : "stroke-destructive"}
      />
    </svg>
  );
}

export default Sparkline;
