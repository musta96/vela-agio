import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { OHLCBar } from "@/lib/technicalIndicators";
import { analyze } from "@/lib/technicalIndicators";
import {
  riskSummary,
  positionSize,
  mansfieldRS,
  classifyRegime,
  mtfConfluence,
  detectChartPatterns,
} from "@/lib/riskMetrics";

interface Props {
  bars: OHLCBar[];
  weeklyBars: OHLCBar[];
  benchBars: OHLCBar[];
  benchLabel: string;
  currencySign: string;
}

const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;
const fmtNum = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "-");

export const RiskPanel = ({ bars, weeklyBars, benchBars, benchLabel, currencySign }: Props) => {
  const [equity, setEquity] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);

  const risk = useMemo(() => riskSummary(bars, benchBars), [bars, benchBars]);
  const regime = useMemo(() => classifyRegime(bars), [bars]);
  const rs = useMemo(
    () =>
      benchBars.length > 60
        ? mansfieldRS(bars.map((b) => b.close), benchBars.map((b) => b.close))
        : null,
    [bars, benchBars]
  );
  const techDaily = useMemo(() => (bars.length >= 60 ? analyze(bars) : null), [bars]);
  const techWeekly = useMemo(() => (weeklyBars.length >= 60 ? analyze(weeklyBars) : null), [weeklyBars]);
  const mtf = useMemo(() => {
    const arr: { tf: string; score: number }[] = [];
    if (techDaily) arr.push({ tf: "1D", score: techDaily.score });
    if (techWeekly) arr.push({ tf: "1W", score: techWeekly.score });
    return arr.length ? mtfConfluence(arr) : null;
  }, [techDaily, techWeekly]);
  const chartPatterns = useMemo(() => detectChartPatterns(bars), [bars]);

  if (!risk) {
    return <Card className="p-12 text-center text-muted-foreground">Need at least 30 bars of history.</Card>;
  }

  const sizing = risk.stops
    ? positionSize(equity, riskPct, risk.stops.entry, risk.stops.longStop)
    : null;

  const regimeTone =
    regime.regime === "strong-trend"
      ? "text-success border-success/30 bg-success/10"
      : regime.regime === "trending"
      ? "text-primary border-primary/30 bg-primary/10"
      : regime.regime === "ranging"
      ? "text-muted-foreground border-border bg-muted/30"
      : "text-destructive border-destructive/30 bg-destructive/10";

  return (
    <div className="space-y-6">
      {/* Risk metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Risk profile</CardTitle>
          <CardDescription>
            Annualized stats over loaded history. Benchmark: {benchLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Realized vol" value={fmtPct(risk.vol)} hint="Annualized σ" />
          <Stat
            label="Sharpe"
            value={fmtNum(risk.sharpe)}
            tone={risk.sharpe > 1 ? "good" : risk.sharpe < 0 ? "bad" : "neutral"}
          />
          <Stat
            label="Sortino"
            value={fmtNum(risk.sortino)}
            tone={risk.sortino > 1 ? "good" : risk.sortino < 0 ? "bad" : "neutral"}
          />
          <Stat
            label="Calmar"
            value={fmtNum(risk.calmar)}
            tone={risk.calmar > 1 ? "good" : risk.calmar < 0 ? "bad" : "neutral"}
          />
          <Stat
            label="Max drawdown"
            value={fmtPct(risk.maxDD)}
            tone={Math.abs(risk.maxDD) > 0.3 ? "bad" : Math.abs(risk.maxDD) > 0.15 ? "neutral" : "good"}
          />
          <Stat label="VaR 95% (daily)" value={fmtPct(risk.var95)} tone="bad" hint="Worst-day loss in 95% of days" />
          <Stat label="Expected shortfall" value={fmtPct(risk.es95)} tone="bad" hint="Avg loss in the worst 5% of days" />
          <Stat
            label={`Beta vs ${benchLabel}`}
            value={risk.beta != null ? fmtNum(risk.beta) : "-"}
            tone={risk.beta != null && Math.abs(risk.beta) > 1.3 ? "bad" : "neutral"}
          />
        </CardContent>
      </Card>

      {/* Stops & position sizing */}
      {risk.stops && (
        <Card>
          <CardHeader>
            <CardTitle>ATR stop-loss & position sizing</CardTitle>
            <CardDescription>
              Stops use 1.5×ATR(14). Targets use a 2R / 3R framework. Adjust equity and risk-per-trade to size the position.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Entry" value={`${currencySign}${risk.stops.entry.toFixed(2)}`} />
              <Stat
                label="Long stop"
                value={`${currencySign}${risk.stops.longStop.toFixed(2)}`}
                tone="bad"
                hint={`-${risk.stops.stopDistancePct.toFixed(2)}%`}
              />
              <Stat label="TP 2R" value={`${currencySign}${risk.stops.longTarget1.toFixed(2)}`} tone="good" />
              <Stat label="TP 3R" value={`${currencySign}${risk.stops.longTarget2.toFixed(2)}`} tone="good" />
              <Stat label="ATR(14)" value={risk.stops.atr.toFixed(4)} />
              <Stat label="Short stop" value={`${currencySign}${risk.stops.shortStop.toFixed(2)}`} tone="bad" />
              <Stat label="Short TP 2R" value={`${currencySign}${risk.stops.shortTarget1.toFixed(2)}`} tone="good" />
              <Stat label="Short TP 3R" value={`${currencySign}${risk.stops.shortTarget2.toFixed(2)}`} tone="good" />
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <Label htmlFor="equity">Account equity</Label>
                <Input
                  id="equity"
                  type="number"
                  value={equity}
                  onChange={(e) => setEquity(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div>
                <Label htmlFor="risk">Risk per trade %</Label>
                <Input
                  id="risk"
                  type="number"
                  step="0.1"
                  value={riskPct}
                  onChange={(e) => setRiskPct(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              {sizing && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Suggested size</p>
                  <p className="text-2xl font-bold">{sizing.shares.toLocaleString()} sh</p>
                  <p className="text-xs text-muted-foreground">
                    Notional {currencySign}{sizing.notional.toFixed(0)} · {sizing.pctOfEquity.toFixed(1)}% of equity · risk {currencySign}{sizing.dollarRisk.toFixed(0)}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Regime & MTF */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Market regime</CardTitle>
            <CardDescription>Via ADX(14) + realized vol</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge variant="outline" className={regimeTone}>{regime.regime.replace("-", " ").toUpperCase()}</Badge>
            <p className="text-xs text-muted-foreground">
              ADX {regime.adx != null ? regime.adx.toFixed(1) : "-"} · σ {regime.vol.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">
              {regime.regime === "strong-trend"
                ? "Trend-following works best; avoid mean-reversion."
                : regime.regime === "trending"
                ? "Trend is forming; trend setups favored."
                : regime.regime === "ranging"
                ? "Mean-reversion plays preferred; fade extremes."
                : "Choppy / unclear - reduce position size."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Multi-timeframe confluence</CardTitle>
            <CardDescription>1D + 1W agreement on direction</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {mtf ? (
              <>
                <Badge
                  variant="outline"
                  className={
                    mtf.direction === "bullish"
                      ? "text-success border-success/30 bg-success/10"
                      : mtf.direction === "bearish"
                      ? "text-destructive border-destructive/30 bg-destructive/10"
                      : "text-muted-foreground border-border bg-muted/30"
                  }
                >
                  {mtf.direction.toUpperCase()}{mtf.agree ? " · CONFIRMED" : " · MIXED"}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Daily score {techDaily?.score ?? "-"} · Weekly score {techWeekly?.score ?? "-"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {mtf.agree
                    ? "Both timeframes agree - higher-conviction setup."
                    : "Timeframes diverge - wait for alignment or trade smaller size."}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading weekly history…</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mansfield RS + chart patterns */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Relative strength vs {benchLabel}</CardTitle>
            <CardDescription>Mansfield RS (52-week)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {rs && rs.current != null ? (
              <>
                <Badge
                  variant="outline"
                  className={
                    rs.current > 0
                      ? "text-success border-success/30 bg-success/10"
                      : "text-destructive border-destructive/30 bg-destructive/10"
                  }
                >
                  {rs.current > 0 ? "OUTPERFORMING" : "UNDERPERFORMING"}
                </Badge>
                <p className="text-2xl font-bold">
                  {rs.current > 0 ? "+" : ""}{rs.current.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">
                  20-bar slope: {rs.slope != null ? `${rs.slope >= 0 ? "+" : ""}${rs.slope.toFixed(2)}` : "-"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Filters out tickers that only rise because the index rises.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Benchmark data unavailable.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Chart patterns</CardTitle>
            <CardDescription>Rule-based (last 120 bars)</CardDescription>
          </CardHeader>
          <CardContent>
            {chartPatterns.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {chartPatterns.map((p, i) => {
                  const bull = p.includes("Bottom") || p.includes("Inverse") || p === "Ascending Triangle";
                  return (
                    <Badge
                      key={i}
                      variant="outline"
                      className={
                        bull
                          ? "text-success border-success/30 bg-success/10"
                          : "text-destructive border-destructive/30 bg-destructive/10"
                      }
                    >
                      {p}
                    </Badge>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No major chart pattern detected.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const Stat = ({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad" | "neutral";
}) => (
  <div className="rounded-lg border border-border/60 p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p
      className={`text-lg font-mono font-semibold ${
        tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "text-foreground"
      }`}
    >
      {value}
    </p>
    {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
  </div>
);