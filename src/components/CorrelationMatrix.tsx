import { useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  correlationMatrix,
  correlationStats,
  correlationBreakdowns,
  correlationMemoSection,
  type CorrelationMatrix as Matrix,
  type CorrelationStats,
  type CorrelationBreakdowns,
} from "@/lib/correlation";
import { Layers } from "lucide-react";

type Props = {
  symbols: string[];
  /** Aligned returns: rows = time, cols = assets (same order as `symbols`). */
  returns: number[][];
  /** Fired whenever the matrix is recomputed — feeds the memo generator. */
  onComputed?: (payload: {
    symbols: string[];
    matrix: Matrix;
    stats: CorrelationStats;
    breakdowns: CorrelationBreakdowns;
    memoSection: string;
  }) => void;
  className?: string;
};

/**
 * Diverging colour scale for correlation cells. Strong positive → bear red,
 * strong negative → bull green, near-zero → neutral surface. Uses semantic
 * design tokens (no hard-coded hex) so dark/light modes stay coherent.
 */
function cellStyle(rho: number): React.CSSProperties {
  const r = Math.max(-1, Math.min(1, rho));
  const intensity = Math.min(1, Math.abs(r));
  const opacity = 0.08 + intensity * 0.55;
  const token = r >= 0 ? "--bear" : "--bull";
  return {
    backgroundColor: `hsl(var(${token}) / ${opacity})`,
    color: intensity > 0.55 ? "hsl(var(--background))" : "hsl(var(--foreground))",
  };
}

function fmtRho(x: number | null): string {
  return x === null ? "—" : (x >= 0 ? "+" : "") + x.toFixed(2);
}

export function CorrelationMatrix({ symbols, returns, onComputed, className }: Props) {
  const matrix = useMemo<Matrix>(() => correlationMatrix(returns), [returns]);
  const stats = useMemo(() => correlationStats(symbols, matrix), [symbols, matrix]);
  const breakdowns = useMemo(() => correlationBreakdowns(symbols, matrix), [symbols, matrix]);
  const memoSection = useMemo(
    () => correlationMemoSection(symbols, matrix),
    [symbols, matrix],
  );

  useEffect(() => {
    if (!matrix.length || !onComputed) return;
    onComputed({ symbols, matrix, stats, breakdowns, memoSection });
  }, [matrix, symbols, stats, breakdowns, memoSection, onComputed]);

  if (!matrix.length) return null;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Correlation Matrix
          </CardTitle>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">
              Avg ρ {stats.avgPairwise.toFixed(2)}
            </Badge>
            <Badge variant="outline">
              Diversification {stats.diversificationScore}/100
            </Badge>
            <Badge variant="outline">{stats.pairCount} pairs</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Heatmap */}
        <div className="overflow-x-auto">
          <div
            className="grid text-[11px] font-mono"
            style={{
              gridTemplateColumns: `minmax(60px, auto) repeat(${symbols.length}, minmax(48px, 1fr))`,
            }}
          >
            <div />
            {symbols.map((s) => (
              <div key={`h-${s}`} className="px-2 py-1 text-center text-muted-foreground truncate">
                {s}
              </div>
            ))}
            {symbols.map((row, i) => (
              <div className="contents" key={`row-${row}`}>
                <div className="px-2 py-1 text-muted-foreground truncate">{row}</div>
                {symbols.map((col, j) => (
                  <div
                    key={`${row}-${col}`}
                    className="px-2 py-1 text-center border border-border/40"
                    style={cellStyle(matrix[i][j])}
                    title={`${row} ↔ ${col}: ${matrix[i][j].toFixed(3)}`}
                  >
                    {matrix[i][j].toFixed(2)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Extremes */}
        {stats.maxPair && stats.minPair && (
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-border/60 p-3">
              <div className="text-xs text-muted-foreground">Most correlated</div>
              <div className="font-mono">
                {stats.maxPair.a} ↔ {stats.maxPair.b}
                <span className="ml-2 text-bear">{fmtRho(stats.maxPair.rho)}</span>
              </div>
            </div>
            <div className="rounded-md border border-border/60 p-3">
              <div className="text-xs text-muted-foreground">Least correlated</div>
              <div className="font-mono">
                {stats.minPair.a} ↔ {stats.minPair.b}
                <span className="ml-2 text-bull">{fmtRho(stats.minPair.rho)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Breakdowns */}
        <div className="grid lg:grid-cols-3 gap-4">
          {(
            [
              ["Sector", breakdowns.bySector],
              ["Geography", breakdowns.byGeography],
              ["Asset class", breakdowns.byAssetClass],
            ] as const
          ).map(([label, groups]) => (
            <div key={label} className="rounded-md border border-border/60 p-3">
              <div className="text-xs font-semibold mb-2">{label}</div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-xs font-mono">
                <div className="text-muted-foreground">Group</div>
                <div className="text-muted-foreground text-right">Intra ρ</div>
                <div className="text-muted-foreground text-right">Inter ρ</div>
                {groups.map((g) => (
                  <div key={`${label}-${g.group}`} className="contents">
                    <div className="truncate" title={g.members.join(", ")}>
                      {g.group} <span className="text-muted-foreground">({g.members.length})</span>
                    </div>
                    <div className="text-right">{fmtRho(g.avgIntra)}</div>
                    <div className="text-right">{fmtRho(g.avgInter)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Daily log-return correlations over the loaded window. Concentrated intra-group
          correlations (≥ 0.7) indicate redundant exposure; near-zero or negative inter-group
          values are the desirable diversifying relationships.
        </p>
      </CardContent>
    </Card>
  );
}

export default CorrelationMatrix;