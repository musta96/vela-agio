import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineChart } from "lucide-react";
import { classifyRegimes, regimePerformance, REGIME_LABELS, type Regime } from "@/lib/backtest/regimes";
import type { Bar } from "@/lib/backtest/clientSim";

interface Props {
  bars: Bar[];
  equity: { t: number; value: number }[];
}

const TREND_ORDER: Regime[] = ["trend_up", "range", "trend_down"];
const VOL_ORDER:   Regime[] = ["high_vol", "low_vol"];

export function RegimeBreakdownCard({ bars, equity }: Props) {
  const { trendStats, volStats } = useMemo(() => {
    const { trend, vol } = classifyRegimes(bars);
    return {
      trendStats: regimePerformance(bars, equity, trend),
      volStats:   regimePerformance(bars, equity, vol),
    };
  }, [bars, equity]);

  if (!bars.length || !equity.length) return null;

  const renderBucket = (stats: ReturnType<typeof regimePerformance>, order: Regime[]) => {
    const byRegime = new Map(stats.map((s) => [s.regime, s]));
    return (
      <div className="grid gap-2 sm:grid-cols-3">
        {order.map((r) => {
          const s = byRegime.get(r);
          if (!s) {
            return (
              <div key={r} className="p-2 rounded-md border border-dashed border-border bg-muted/10">
                <p className="text-[11px] font-semibold text-muted-foreground">{REGIME_LABELS[r]}</p>
                <p className="text-[10px] text-muted-foreground">No bars classified in this regime.</p>
              </div>
            );
          }
          const beatsBench = s.returnPct >= s.benchPct;
          return (
            <div key={r} className={`p-2 rounded-md border text-xs ${
              s.returnPct > 0 ? "border-success/40 bg-success/10"
              : s.returnPct < 0 ? "border-destructive/40 bg-destructive/10"
              : "border-border bg-muted/20"
            }`}>
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold">{REGIME_LABELS[r]}</p>
                <Badge variant="outline" className="text-[10px]">{s.bars} bars</Badge>
              </div>
              <p className={`text-sm font-semibold ${s.returnPct >= 0 ? "text-success" : "text-destructive"}`}>
                {s.returnPct >= 0 ? "+" : ""}{s.returnPct.toFixed(2)}%
              </p>
              <p className="text-[10px] text-muted-foreground">
                vs buy&amp;hold {s.benchPct >= 0 ? "+" : ""}{s.benchPct.toFixed(2)}% ·{" "}
                <span className={beatsBench ? "text-success" : "text-destructive"}>{beatsBench ? "beats" : "trails"}</span>
              </p>
              <p className="text-[10px] text-muted-foreground">DD {s.maxDdPct.toFixed(2)}% · win days {s.winPct.toFixed(0)}%</p>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2"><LineChart className="h-4 w-4 text-primary" /><CardTitle className="text-base">Regime breakdown</CardTitle></div>
        <CardDescription className="text-xs">
          Segments the backtest by market state and measures strategy return in each. A strategy that only prints returns in one regime is not robust.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground mb-1">By trend regime (20/50 SMA)</p>
          {renderBucket(trendStats, TREND_ORDER)}
        </div>
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground mb-1">By volatility regime (20-bar realized vs. median)</p>
          {renderBucket(volStats, VOL_ORDER)}
        </div>
      </CardContent>
    </Card>
  );
}