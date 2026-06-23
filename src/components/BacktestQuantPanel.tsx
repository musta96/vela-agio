import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Atom, ShieldAlert } from "lucide-react";
import {
  AreaChart,
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  returns as toReturns,
  valueAtRisk,
  expectedShortfall,
  stdev,
  mean,
  TRADING_DAYS,
} from "@/lib/riskMetrics";
import { MACRO_SCENARIOS, applyMacroScenario, quantile } from "@/lib/quantScenarios";
import { MonteCarloHistogram } from "@/components/MonteCarloHistogram";
import { useStableMemo } from "@/lib/computeCache";

export interface BacktestQuantPanelProps {
  /** Equity curve (t = ms, value = portfolio value, benchmark optional). */
  equity: { t: number; value: number; benchmark?: number }[];
  /** Final basket constituents as backtested. */
  holdings: { symbol: string; weight: number; name?: string }[];
  /** Currency symbol for axis labels. Defaults to "€". */
  currency?: string;
}

/** Mulberry32 — deterministic PRNG keyed by `seed`. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bootstrap (sample with replacement) `paths` × `horizon` returns from `rets`. */
function bootstrapMonteCarlo(
  rets: number[],
  startValue: number,
  horizonDays: number,
  paths: number,
  seed = 42,
): { finals: number[]; fan: { step: number; p05: number; p50: number; p95: number }[] } {
  if (!rets.length || startValue <= 0) return { finals: [], fan: [] };
  const rand = rng(seed);
  const allPaths: number[][] = [];
  const finals: number[] = [];
  for (let p = 0; p < paths; p++) {
    let v = startValue;
    const path: number[] = [startValue];
    for (let d = 0; d < horizonDays; d++) {
      const r = rets[Math.floor(rand() * rets.length)];
      v *= 1 + r;
      path.push(v);
    }
    allPaths.push(path);
    finals.push(v);
  }
  // Build fan chart at ~36 sample points along the horizon.
  const samples = Math.min(36, horizonDays);
  const stride = Math.max(1, Math.floor(horizonDays / samples));
  const fan: { step: number; p05: number; p50: number; p95: number }[] = [];
  for (let s = 0; s <= horizonDays; s += stride) {
    const slice = allPaths.map((p) => p[s]);
    fan.push({
      step: s,
      p05: quantile(slice, 0.05),
      p50: quantile(slice, 0.50),
      p95: quantile(slice, 0.95),
    });
  }
  return { finals, fan };
}

export function BacktestQuantPanel({ equity, holdings, currency = "€" }: BacktestQuantPanelProps) {
  const [horizonLabel, setHorizonLabel] = useState<"3M" | "6M" | "1Y" | "3Y">("1Y");
  const horizonDays = horizonLabel === "3M" ? 63 : horizonLabel === "6M" ? 126 : horizonLabel === "1Y" ? 252 : 756;
  const paths = 1500;

  const closes = useMemo(() => equity.map((e) => e.value), [equity]);
  const rets = useMemo(() => toReturns(closes), [closes]);
  const startValue = closes[closes.length - 1] ?? 0;

  // Historical VaR / CVaR over the backtested equity.
  const histStats = useMemo(() => {
    if (rets.length < 20) return null;
    const mu = mean(rets);
    const sd = stdev(rets);
    return {
      var95: valueAtRisk(rets, 0.95),
      cvar95: expectedShortfall(rets, 0.95),
      var99: valueAtRisk(rets, 0.99),
      cvar99: expectedShortfall(rets, 0.99),
      annVol: sd * Math.sqrt(TRADING_DAYS),
      annRet: mu * TRADING_DAYS,
      observations: rets.length,
    };
  }, [rets]);

  // Monte Carlo bootstrap — content-keyed cache to avoid recompute on rerender.
  const mc = useStableMemo(
    () => bootstrapMonteCarlo(rets, startValue, horizonDays, paths),
    { n: rets.length, startValue, horizonDays, paths },
  );

  // Macro scenario stress: weight × final equity per holding.
  const scenarioImpacts = useStableMemo(
    () => {
      if (!holdings.length || startValue <= 0) return [];
      const positions = holdings.map((h) => ({
        symbol: h.symbol,
        name: h.name,
        value: Math.max(0, h.weight) * startValue,
      }));
      return MACRO_SCENARIOS.map((s) => applyMacroScenario(positions, s));
    },
    { holdings: holdings.map((h) => `${h.symbol}:${h.weight}`).join("|"), startValue },
  );

  const fmtMoney = (v: number) =>
    `${v < 0 ? "−" : ""}${currency}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtPct = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

  if (rets.length < 20) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Atom className="h-4 w-4 text-primary" /> Quantitative Analysis
          </CardTitle>
          <CardDescription>Need at least 20 equity bars to run VaR, Monte Carlo, or scenario stress.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const mcP05 = quantile(mc.finals, 0.05);
  const mcP50 = quantile(mc.finals, 0.50);
  const mcP95 = quantile(mc.finals, 0.95);
  const probLoss = mc.finals.filter((v) => v < startValue).length / Math.max(1, mc.finals.length);

  const fanData = mc.fan.map((p) => ({
    step: p.step,
    P95: Math.round(p.p95),
    P50: Math.round(p.p50),
    P05: Math.round(p.p05),
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Atom className="h-4 w-4 text-primary" /> Quantitative Analysis
            </CardTitle>
            <CardDescription>
              Monte Carlo, historical VaR / CVaR and macro scenario stress applied to this backtested basket.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {(["3M", "6M", "1Y", "3Y"] as const).map((h) => (
              <Button
                key={h}
                size="sm"
                variant={horizonLabel === h ? "default" : "ghost"}
                className="h-7 text-xs px-2.5"
                onClick={() => setHorizonLabel(h)}
                aria-pressed={horizonLabel === h}
              >
                {h}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="mc">
          <TabsList>
            <TabsTrigger value="mc"><Activity className="h-3.5 w-3.5 mr-1.5" /> Monte Carlo</TabsTrigger>
            <TabsTrigger value="var"><ShieldAlert className="h-3.5 w-3.5 mr-1.5" /> VaR / CVaR</TabsTrigger>
            <TabsTrigger value="scenarios"><Atom className="h-3.5 w-3.5 mr-1.5" /> Macro scenarios</TabsTrigger>
          </TabsList>

          {/* Monte Carlo */}
          <TabsContent value="mc" className="space-y-4 pt-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Expected (P50)" value={fmtMoney(mcP50)} tone="muted" />
              <Stat label="Downside (P5)" value={fmtMoney(mcP05)} tone="bear" />
              <Stat label="Upside (P95)" value={fmtMoney(mcP95)} tone="bull" />
              <Stat label="P(loss)" value={`${(probLoss * 100).toFixed(1)}%`} tone={probLoss > 0.4 ? "bear" : "muted"} />
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                Distribution of {horizonLabel} terminal value · {paths.toLocaleString()} paths
              </div>
              <MonteCarloHistogram values={mc.finals} unit={currency} target={startValue} height={220} />
              <div className="mt-1 text-[10px] text-muted-foreground italic">Dashed marker = starting value · bootstrap of historical daily returns.</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Fan chart · percentile cones</div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={fanData}>
                  <defs>
                    <linearGradient id="qpFan" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="step" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${Math.round(v / 21)}m`} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${currency}${Math.round(v / 1000)}k`} />
                  <Tooltip
                    formatter={(v: number) => fmtMoney(v)}
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  />
                  <Area type="monotone" dataKey="P95" stroke="hsl(var(--bull))" fill="url(#qpFan)" />
                  <Area type="monotone" dataKey="P50" stroke="hsl(var(--primary))" fill="none" strokeWidth={2} />
                  <Area type="monotone" dataKey="P05" stroke="hsl(var(--bear))" fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          {/* VaR / CVaR */}
          <TabsContent value="var" className="space-y-3 pt-3">
            {histStats && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Stat label="Ann. return" value={fmtPct(histStats.annRet, 1)} tone={histStats.annRet >= 0 ? "bull" : "bear"} />
                  <Stat label="Ann. vol" value={fmtPct(histStats.annVol, 1)} tone="muted" />
                  <Stat label="Observations" value={String(histStats.observations)} tone="muted" />
                  <Stat label="Horizon" value="Daily" tone="muted" />
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-1.5 px-3">Confidence</th>
                        <th className="py-1.5 px-3 text-right">VaR (%)</th>
                        <th className="py-1.5 px-3 text-right">VaR ({currency})</th>
                        <th className="py-1.5 px-3 text-right">CVaR (%)</th>
                        <th className="py-1.5 px-3 text-right">CVaR ({currency})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { lbl: "95%", v: histStats.var95, c: histStats.cvar95 },
                        { lbl: "99%", v: histStats.var99, c: histStats.cvar99 },
                      ].map((row) => (
                        <tr key={row.lbl} className="border-b border-border/40">
                          <td className="py-1.5 px-3">{row.lbl}</td>
                          <td className="py-1.5 px-3 text-right font-mono text-bear">{(row.v * 100).toFixed(2)}%</td>
                          <td className="py-1.5 px-3 text-right font-mono text-bear">{fmtMoney(row.v * startValue)}</td>
                          <td className="py-1.5 px-3 text-right font-mono text-bear">{(row.c * 100).toFixed(2)}%</td>
                          <td className="py-1.5 px-3 text-right font-mono text-bear">{fmtMoney(row.c * startValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  Historical method, 1-day horizon. VaR = worst expected daily loss at the given confidence; CVaR = average loss beyond VaR.
                </p>
              </>
            )}
          </TabsContent>

          {/* Macro Scenarios */}
          <TabsContent value="scenarios" className="space-y-3 pt-3">
            {scenarioImpacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Run a backtest with at least one holding to see scenario stress.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-1.5 px-3">Scenario</th>
                      <th className="py-1.5 px-3 text-right">P/L %</th>
                      <th className="py-1.5 px-3 text-right">P/L</th>
                      <th className="py-1.5 px-3">Worst asset class</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarioImpacts
                      .slice()
                      .sort((a, b) => a.pnlPct - b.pnlPct)
                      .map((s) => {
                        const worstBucket = [...s.byBucket].sort((a, b) => a.pnl - b.pnl)[0];
                        return (
                          <tr key={s.scenario.id} className="border-b border-border/40">
                            <td className="py-1.5 px-3">
                              <div className="font-medium">{s.scenario.name}</div>
                              <div className="text-[10px] text-muted-foreground">{s.scenario.description}</div>
                            </td>
                            <td className={`py-1.5 px-3 text-right font-mono ${s.pnlPct >= 0 ? "text-bull" : "text-bear"}`}>{fmtPct(s.pnlPct, 2)}</td>
                            <td className={`py-1.5 px-3 text-right font-mono ${s.pnl >= 0 ? "text-bull" : "text-bear"}`}>{fmtMoney(s.pnl)}</td>
                            <td className="py-1.5 px-3">
                              {worstBucket ? (
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] font-normal">{worstBucket.bucket}</Badge>
                                  <span className="font-mono text-[11px] text-bear">{fmtPct(worstBucket.pnlPct, 1)}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground italic">
              Each scenario applies its macro shock to current basket weights using asset-class / sector / geography sensitivities.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "bull" | "bear" | "muted" }) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm ${cls}`}>{value}</div>
    </div>
  );
}

export default BacktestQuantPanel;