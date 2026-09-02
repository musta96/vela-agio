import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TickerMultiSelect, parseSymbols } from "@/components/TickerMultiSelect";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell,
} from "recharts";
import { MonteCarloHistogram } from "@/components/MonteCarloHistogram";
import { Loader2, Activity, ShieldAlert, TrendingUp, Wand2 } from "lucide-react";
import {
  runPortfolioSimulation, estimateAssetStats, type SimulationResult,
} from "@/lib/portfolioSimulation";
import { correlationMatrix } from "@/lib/correlation";

const RUN_OPTIONS = [
  { value: "1000", label: "1,000 paths" },
  { value: "5000", label: "5,000 paths" },
  { value: "10000", label: "10,000 paths" },
];

const LOOKBACK_OPTIONS = [
  { value: "1y", label: "1 year history" },
  { value: "3y", label: "3 years history" },
  { value: "5y", label: "5 years history" },
];

const fmtCcy = (v: number) =>
  Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M`
    : Math.abs(v) >= 1e3 ? `$${(v / 1e3).toFixed(1)}k`
    : `$${v.toFixed(0)}`;
const fmtPct = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

export default function PortfolioSimulations() {
  const [searchParams] = useSearchParams();

  const [tickers, setTickers] = useState(searchParams.get("symbols") ?? "SPY,QQQ,GLD,TLT");
  const [weightsStr, setWeightsStr] = useState(searchParams.get("weights") ?? "");
  const [initialValue, setInitialValue] = useState<number>(Number(searchParams.get("initial") ?? 100000));
  const [horizonYears, setHorizonYears] = useState<number>(Number(searchParams.get("horizon") ?? 10));
  const [runs, setRuns] = useState<string>(searchParams.get("runs") ?? "5000");
  const [lookback, setLookback] = useState<string>(searchParams.get("lookback") ?? "3y");
  const [riskFree, setRiskFree] = useState<number>(0.04);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [symbolsUsed, setSymbolsUsed] = useState<string[]>([]);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const symbols = parseSymbols(tickers);
      if (!symbols.length) throw new Error("Select at least one instrument.");
      if (symbols.length > 12) throw new Error("Up to 12 instruments are supported in the browser engine.");
      let weights = weightsStr.split(",").map((s) => Number(s.trim())).filter((x) => Number.isFinite(x));
      if (!weights.length || weights.length !== symbols.length) {
        weights = symbols.map(() => 1 / symbols.length);
      } else {
        const total = weights.reduce((a, b) => a + b, 0) || 1;
        weights = weights.map((w) => w / total);
      }
      // Fetch daily OHLC for each ticker
      const series: number[][] = [];
      for (const s of symbols) {
        const { data } = await supabase.functions.invoke("market-data", {
          body: { action: "ohlc", symbol: s, range: lookback, interval: "1d" },
        });
        const bars = (data?.bars ?? []) as { close: number }[];
        const rets: number[] = [];
        for (let i = 1; i < bars.length; i++) {
          const a = bars[i - 1]?.close, b = bars[i]?.close;
          if (a > 0 && b > 0) rets.push(Math.log(b / a));
        }
        if (rets.length < 20) throw new Error(`Insufficient price history for ${s}`);
        series.push(rets);
      }
      // Align to shortest series, estimate stats and correlation
      const T = Math.min(...series.map((r) => r.length));
      const aligned = series.map((s) => s.slice(s.length - T));
      const stats = estimateAssetStats(aligned, 252);
      const rowsByTime: number[][] = [];
      for (let t = 0; t < T; t++) rowsByTime.push(aligned.map((s) => s[t]));
      const corr = correlationMatrix(rowsByTime);
      const assets = symbols.map((sym, i) => ({
        symbol: sym, weight: weights[i], mu: stats[i].mu, sigma: stats[i].sigma,
      }));
      const sim = runPortfolioSimulation({
        assets, corr,
        initialValue,
        horizonYears,
        runs: Number(runs),
        stepsPerYear: 12,
        riskFreeRate: riskFree,
      });
      setResult(sim);
      setSymbolsUsed(symbols);
    } catch (e: any) {
      setError(e?.message ?? "Simulation failed.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Auto-run when copilot links over with prefilled params.
  useEffect(() => {
    if (searchParams.get("auto") === "1" && searchParams.get("symbols")) {
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fanData = (result?.fanChart ?? []).map((p) => ({
    year: Number(p.year.toFixed(2)),
    p05: p.p05, p25: p.p25, p50: p.p50, p75: p.p75, p95: p.p95,
    // Recharts stacked-area trick: render lower bound + (upper - lower) bands
    band95Low: p.p05, band95: p.p95 - p.p05,
    band50Low: p.p25, band50: p.p75 - p.p25,
  }));

  const tornadoData = (result?.sensitivity ?? [])
    .map((s) => ({ symbol: s.symbol, deltaExpected: s.deltaExpected, deltaVar95: s.deltaVar95 }))
    .sort((a, b) => Math.abs(b.deltaExpected) - Math.abs(a.deltaExpected));

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Portfolio Simulations | Vela.ai"
        description="Monte Carlo simulation engine for arbitrary portfolios. Correlated GBM paths, VaR, CVaR, tornado sensitivity."
        path="/simulations"
      />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Portfolio Simulations</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Run correlated Monte Carlo simulations on any portfolio. We fit annualised μ and σ from historical
          log returns, reconstruct the full covariance via Pearson correlation, Cholesky-decompose Σ, and
          simulate GBM paths to surface distributional outcomes, VaR/CVaR and per-asset sensitivities.
        </p>

        {/* Inputs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" /> Simulation Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2 lg:col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Instruments</Label>
              <TickerMultiSelect value={tickers} onChange={setTickers} max={12} placeholder="Search by name or ticker — SPY, Apple, Gold…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weights" className="text-xs uppercase tracking-wider text-muted-foreground">Weights (optional, auto-normalised)</Label>
              <Input id="weights" value={weightsStr} onChange={(e) => setWeightsStr(e.target.value)} placeholder="0.4,0.3,0.15,0.15" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="initial" className="text-xs uppercase tracking-wider text-muted-foreground">Initial portfolio value</Label>
              <Input id="initial" type="number" value={initialValue} onChange={(e) => setInitialValue(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Time horizon: {horizonYears} year{horizonYears === 1 ? "" : "s"}</Label>
              <Slider value={[horizonYears]} min={1} max={30} step={1} onValueChange={(v) => setHorizonYears(v[0])} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rf" className="text-xs uppercase tracking-wider text-muted-foreground">Risk-free rate (annual)</Label>
              <Input id="rf" type="number" step={0.005} value={riskFree} onChange={(e) => setRiskFree(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Number of paths</Label>
              <Select value={runs} onValueChange={setRuns}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RUN_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Lookback window</Label>
              <Select value={lookback} onValueChange={setLookback}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOOKBACK_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 lg:col-span-3 flex justify-end">
              <Button onClick={run} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                {loading ? "Simulating…" : "Run Simulation"}
              </Button>
            </div>
            {error && (
              <div className="md:col-span-2 lg:col-span-3 text-sm text-bear">{error}</div>
            )}
          </CardContent>
        </Card>

        {result && (
          <>
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <Kpi label="Expected value" value={fmtCcy(result.expected)} hint={`CAGR ${fmtPct(result.expectedReturnPct)}`} />
              <Kpi label="Median (P50)" value={fmtCcy(result.median)} />
              <Kpi label="P5 — P95" value={`${fmtCcy(result.percentiles.p05)} → ${fmtCcy(result.percentiles.p95)}`} small />
              <Kpi label="Realised vol" value={`${(result.realizedVolPct * 100).toFixed(1)}%`} hint={`Sharpe ${result.sharpe.toFixed(2)}`} />
              <Kpi label="VaR 95 / 99" value={`${fmtCcy(result.var95)} / ${fmtCcy(result.var99)}`} tone="bear" small />
              <Kpi label="CVaR 95 / 99" value={`${fmtCcy(result.cvar95)} / ${fmtCcy(result.cvar99)}`} tone="bear" small />
              <Kpi label="Prob. of loss" value={`${(result.probLoss * 100).toFixed(1)}%`} tone="bear" />
              <Kpi label="Prob. ≥ 2× value" value={`${(result.probDouble * 100).toFixed(1)}%`} tone="bull" />
              <Kpi label="Paths" value={result.runs.toLocaleString()} />
              <Kpi label="Horizon" value={`${result.horizonYears}y`} />
              <Kpi label="Initial" value={fmtCcy(result.initialValue)} />
              <Kpi label="Assets" value={String(symbolsUsed.length)} hint={symbolsUsed.join(", ")} small />
            </div>

            {/* Distribution + fan chart */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <CardTitle className="text-base">Final value distribution</CardTitle>
                  <span className="text-xs text-muted-foreground ml-auto">P5 / P50 / P95 + Initial</span>
                </CardHeader>
                <CardContent>
                  <MonteCarloHistogram values={result.finalValues} target={result.initialValue} unit="$" height={280} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <CardTitle className="text-base">Fan chart — percentile cones over time</CardTitle>
                  <span className="text-xs text-muted-foreground ml-auto">Shaded: P5-P95 & P25-P75</span>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={fanData} stackOffset="none" margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="year" tickFormatter={(v) => `${v}y`} tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => fmtCcy(Number(v))} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(v: number, key: string) => [fmtCcy(v), key.toUpperCase()]}
                        labelFormatter={(l: number) => `Year ${l}`}
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      />
                      {/* Stacked invisible base + coloured band for P5-P95 */}
                      <Area type="monotone" dataKey="band95Low" stackId="b95" stroke="none" fill="transparent" />
                      <Area type="monotone" dataKey="band95" stackId="b95" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.15} />
                      <Area type="monotone" dataKey="band50Low" stackId="b50" stroke="none" fill="transparent" />
                      <Area type="monotone" dataKey="band50" stackId="b50" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.30} />
                      <Line type="monotone" dataKey="p50" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      <ReferenceLine y={result.initialValue} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: "Initial", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* CDF + Tornado sensitivity */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Cumulative distribution</CardTitle>
                  <span className="text-xs text-muted-foreground ml-auto">P(final ≤ x)</span>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={result.cdf} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="x" tickFormatter={(v) => fmtCcy(Number(v))} tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, "Cumulative prob."]}
                        labelFormatter={(l: number) => `Final ${fmtCcy(Number(l))}`}
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      />
                      <Line type="monotone" dataKey="p" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      <ReferenceLine x={result.initialValue} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: "Initial", position: "top", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /> Tornado sensitivity (+5pp weight)</CardTitle>
                  <span className="text-xs text-muted-foreground ml-auto">Δ Expected (bars) · negative = drag</span>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart layout="vertical" data={tornadoData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => fmtCcy(Number(v))} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="symbol" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip
                        formatter={(v: number, key: string) => [
                          fmtCcy(Number(v)),
                          key === "deltaExpected" ? "Δ Expected value" : "Δ VaR 95%",
                        ]}
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      />
                      <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" />
                      <Bar dataKey="deltaExpected" radius={[0, 3, 3, 0]}>
                        {tornadoData.map((d, i) => (
                          <Cell key={i} fill={d.deltaExpected >= 0 ? "hsl(var(--bull))" : "hsl(var(--bear))"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Educational simulation only. Past returns are no guarantee of future results; GBM assumes log-normal
              returns and constant correlations and will not capture tail events, regime shifts, or non-linear
              instruments. Always consult a licensed advisor before acting.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, hint, tone, small }: {
  label: string; value: string; hint?: string; tone?: "bull" | "bear"; small?: boolean;
}) {
  const toneCls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground";
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono font-semibold ${small ? "text-xs" : "text-base"} ${toneCls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground truncate" title={hint}>{hint}</div>}
    </div>
  );
}