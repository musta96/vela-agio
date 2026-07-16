import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LineChart, SlidersHorizontal, RotateCcw } from "lucide-react";
import {
  classifyRegimes, regimePerformance, REGIME_LABELS, DEFAULT_REGIME_CONFIG,
  type Regime, type RegimeConfig,
} from "@/lib/backtest/regimes";
import type { Bar } from "@/lib/backtest/clientSim";

interface Props {
  bars: Bar[];
  equity: { t: number; value: number }[];
}

const TREND_ORDER: Regime[] = ["trend_up", "range", "trend_down"];
const VOL_ORDER:   Regime[] = ["high_vol", "low_vol"];

export function RegimeBreakdownCard({ bars, equity }: Props) {
  const [config, setConfig] = useState<RegimeConfig>(DEFAULT_REGIME_CONFIG);
  const [showControls, setShowControls] = useState(false);
  const { trendStats, volStats } = useMemo(() => {
    const { trend, vol } = classifyRegimes(bars, config);
    return {
      trendStats: regimePerformance(bars, equity, trend),
      volStats:   regimePerformance(bars, equity, vol),
    };
  }, [bars, equity, config]);

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
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <LineChart className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Regime breakdown</CardTitle>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1"
                    onClick={() => setShowControls((v) => !v)}>
              <SlidersHorizontal className="h-3.5 w-3.5" /> {showControls ? "Hide" : "Configure"}
            </Button>
            {JSON.stringify(config) !== JSON.stringify(DEFAULT_REGIME_CONFIG) && (
              <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1"
                      onClick={() => setConfig(DEFAULT_REGIME_CONFIG)}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
          </div>
        </div>
        <CardDescription className="text-xs">
          Segments the backtest by market state and measures strategy return in each. A strategy that only prints returns in one regime is not robust.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showControls && (
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3 text-[11px]">
            <div>
              <p className="font-semibold text-foreground mb-1.5">Trend thresholds</p>
              <div className="grid gap-2 grid-cols-2 md:grid-cols-5">
                <NumberField label="Fast SMA" value={config.smaFast} onChange={(v) => setConfig({ ...config, smaFast: Math.max(2, v) })} />
                <NumberField label="Slow SMA" value={config.smaSlow} onChange={(v) => setConfig({ ...config, smaSlow: Math.max(3, v) })} />
                <NumberField label="Slope lookback" value={config.slopeLookback} onChange={(v) => setConfig({ ...config, slopeLookback: Math.max(1, v) })} />
                <NumberField label="Slope thr (%)" value={config.slopeThreshold * 100} step={0.05}
                             onChange={(v) => setConfig({ ...config, slopeThreshold: v / 100 })} />
                <NumberField label="Spread thr (%)" value={config.spreadThreshold * 100} step={0.1}
                             onChange={(v) => setConfig({ ...config, spreadThreshold: v / 100 })} />
              </div>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1.5">Volatility buckets</p>
              <div className="grid gap-2 grid-cols-2 md:grid-cols-3">
                <NumberField label="Vol window" value={config.volWindow} onChange={(v) => setConfig({ ...config, volWindow: Math.max(2, v) })} />
                <NumberField label="High vol × median" value={config.highVolMult} step={0.05}
                             onChange={(v) => setConfig({ ...config, highVolMult: Math.max(1, v) })} />
                <NumberField label="Low vol × median" value={config.lowVolMult} step={0.05}
                             onChange={(v) => setConfig({ ...config, lowVolMult: Math.min(1, v) })} />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Thresholds are compared against the slow-SMA slope, the fast-vs-slow spread, and the rolling realized volatility median across the backtest window.
            </p>
          </div>
        )}

        <div>
          <p className="text-[11px] font-semibold text-muted-foreground mb-1">
            By trend regime ({config.smaFast}/{config.smaSlow} SMA)
          </p>
          {renderBucket(trendStats, TREND_ORDER)}
        </div>
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground mb-1">
            By volatility regime ({config.volWindow}-bar realized vs. median)
          </p>
          {renderBucket(volStats, VOL_ORDER)}
        </div>
      </CardContent>
    </Card>
  );
}

function NumberField({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input type="number" step={step ?? 1} value={Number.isFinite(value) ? value : 0}
             onChange={(e) => onChange(Number(e.target.value))} className="h-8 text-xs" />
    </div>
  );
}