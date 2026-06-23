import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Activity,
  Atom,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  Settings2,
  Share2,
  ShieldAlert,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";
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
import { MACRO_SCENARIOS, applyMacroScenario, quantile, type ScenarioImpact } from "@/lib/quantScenarios";
import { MonteCarloHistogram } from "@/components/MonteCarloHistogram";
import { useStableMemo } from "@/lib/computeCache";
import { getInstrumentMeta } from "@/lib/instrumentMeta";
import { buildQuantShareUrl, decodeQuantParam } from "@/lib/quantShareLink";
import { exportQuantCsv, exportQuantPdf } from "@/lib/quantPanelExport";

export interface BacktestQuantPanelProps {
  /** Equity curve (t = ms, value = portfolio value, benchmark optional). */
  equity: { t: number; value: number; benchmark?: number }[];
  /** Final basket constituents as backtested. */
  holdings: { symbol: string; weight: number; name?: string }[];
  /** Currency symbol for axis labels. Defaults to "€". */
  currency?: string;
  /** Optional context for share links and exports. */
  strategy?: string;
  range?: string;
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

const HORIZON_PRESETS: { label: "3M" | "6M" | "1Y" | "3Y"; days: number }[] = [
  { label: "3M", days: 63 },
  { label: "6M", days: 126 },
  { label: "1Y", days: 252 },
  { label: "3Y", days: 756 },
];
const CONFIDENCE_OPTIONS = [0.9, 0.95, 0.99] as const;

export function BacktestQuantPanel({
  equity,
  holdings,
  currency = "€",
  strategy,
  range,
}: BacktestQuantPanelProps) {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const hydratedRef = useRef(false);

  const [horizonDays, setHorizonDays] = useState<number>(252);
  const [paths, setPaths] = useState<number>(1500);
  const [confidences, setConfidences] = useState<number[]>([0.95, 0.99]);
  const [openScenario, setOpenScenario] = useState<ScenarioImpact | null>(null);
  const [openVar, setOpenVar] = useState<{ confidence: number; varPct: number; cvarPct: number } | null>(null);

  const horizonLabel = useMemo(() => {
    const found = HORIZON_PRESETS.find((p) => p.days === horizonDays);
    return found ? found.label : `${horizonDays}d`;
  }, [horizonDays]);

  // Hydrate from `?quant=` once on mount.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const token = searchParams.get("quant");
    const parsed = decodeQuantParam(token);
    if (parsed?.s) {
      setHorizonDays(parsed.s.horizonDays);
      setPaths(parsed.s.paths);
      setConfidences(parsed.s.confidences);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closes = useMemo(() => equity.map((e) => e.value), [equity]);
  const rets = useMemo(() => toReturns(closes), [closes]);
  const startValue = closes[closes.length - 1] ?? 0;

  // Historical VaR / CVaR over the backtested equity.
  const histStats = useMemo(() => {
    if (rets.length < 20) return null;
    const mu = mean(rets);
    const sd = stdev(rets);
    return {
      annVol: sd * Math.sqrt(TRADING_DAYS),
      annRet: mu * TRADING_DAYS,
      observations: rets.length,
      var95: valueAtRisk(rets, 0.95),
      cvar95: expectedShortfall(rets, 0.95),
      var99: valueAtRisk(rets, 0.99),
      cvar99: expectedShortfall(rets, 0.99),
    };
  }, [rets]);

  // Risk rows for the currently selected confidence levels.
  const varRows = useMemo(() => {
    if (!rets.length) return [];
    return confidences
      .slice()
      .sort((a, b) => a - b)
      .map((c) => ({
        confidence: c,
        varPct: valueAtRisk(rets, c),
        cvarPct: expectedShortfall(rets, c),
      }));
  }, [rets, confidences]);

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

  // Factor attribution: aggregate basket weights by sector / asset class / geography.
  // Used to explain what drives the Monte Carlo dispersion and macro-scenario tails.
  const factorBreakdown = useMemo(() => {
    const buckets = {
      assetClass: new Map<string, number>(),
      sector: new Map<string, number>(),
      geography: new Map<string, number>(),
    };
    holdings.forEach((h) => {
      const meta = getInstrumentMeta(h.symbol);
      const w = Math.max(0, h.weight);
      buckets.assetClass.set(meta.assetClass, (buckets.assetClass.get(meta.assetClass) ?? 0) + w);
      buckets.sector.set(meta.sector, (buckets.sector.get(meta.sector) ?? 0) + w);
      buckets.geography.set(meta.geography, (buckets.geography.get(meta.geography) ?? 0) + w);
    });
    const sort = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, weight: v }));
    const concentration = (m: Map<string, number>) => {
      const total = [...m.values()].reduce((s, v) => s + v, 0) || 1;
      const shares = [...m.values()].map((v) => v / total);
      return shares.reduce((s, v) => s + v * v, 0); // HHI ∈ (0,1], higher = more concentrated
    };
    return {
      assetClass: sort(buckets.assetClass),
      sector: sort(buckets.sector),
      geography: sort(buckets.geography),
      hhi: {
        assetClass: concentration(buckets.assetClass),
        sector: concentration(buckets.sector),
        geography: concentration(buckets.geography),
      },
    };
  }, [holdings]);

  // Pairwise "co-movement proxy" between holdings derived from meta overlap.
  // Disclosed in the UI — full return-history correlation lives in the Optimizer.
  const coMovement = useMemo(() => {
    const metas = holdings.map((h) => ({ h, m: getInstrumentMeta(h.symbol) }));
    const matrix = metas.map((a) =>
      metas.map((b) => {
        if (a.h.symbol === b.h.symbol) return 1;
        let score = 0.05;
        if (a.m.assetClass === b.m.assetClass) score += 0.4;
        if (a.m.sector === b.m.sector) score += 0.35;
        if (a.m.geography === b.m.geography) score += 0.15;
        return Math.min(0.95, score);
      }),
    );
    let sum = 0;
    let n = 0;
    for (let i = 0; i < matrix.length; i++) {
      for (let j = i + 1; j < matrix.length; j++) { sum += matrix[i][j]; n++; }
    }
    return { matrix, symbols: holdings.map((h) => h.symbol), avg: n ? sum / n : 0 };
  }, [holdings]);

  const fmtMoney = (v: number) =>
    `${v < 0 ? "−" : ""}${currency}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtPct = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
  const fmtWeight = (v: number) => `${(v * 100).toFixed(1)}%`;

  const handleShare = async () => {
    const url = buildQuantShareUrl({
      s: { horizonDays, paths, confidences },
      h: holdings.map((h) => ({ symbol: h.symbol, weight: h.weight, name: h.name })),
      range,
      strategy,
    });
    if (!url) return;
    // Persist the token in the current URL so the chip is also active in this tab.
    const next = new URLSearchParams(searchParams);
    const token = new URL(url).searchParams.get("quant");
    if (token) next.set("quant", token);
    setSearchParams(next, { replace: true });
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Share link copied", description: "Paste it anywhere to reopen this analysis." });
    } catch {
      toast({ title: "Share link ready", description: url });
    }
  };

  const exportInput = () => ({
    basket: holdings.map((h) => ({ symbol: h.symbol, weight: h.weight, name: h.name })),
    strategy,
    range,
    horizonLabel,
    horizonDays,
    paths,
    confidences,
    currency,
    startValue,
    finals: mc.finals,
    histStats,
    varRows,
    scenarios: scenarioImpacts,
  });

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
    <>
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
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              {HORIZON_PRESETS.map((h) => (
                <Button
                  key={h.label}
                  size="sm"
                  variant={horizonDays === h.days ? "default" : "ghost"}
                  className="h-7 text-xs px-2.5"
                  onClick={() => setHorizonDays(h.days)}
                  aria-pressed={horizonDays === h.days}
                >
                  {h.label}
                </Button>
              ))}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs" aria-label="Configure simulation">
                  <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Configure
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-3" align="end">
                <div className="space-y-1.5">
                  <Label htmlFor="qp-horizon" className="text-xs">Horizon (trading days)</Label>
                  <Input
                    id="qp-horizon"
                    type="number"
                    min={5}
                    max={1260}
                    step={5}
                    value={horizonDays}
                    onChange={(e) => {
                      const v = Math.max(5, Math.min(1260, Math.round(Number(e.target.value) || 0)));
                      setHorizonDays(v);
                    }}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qp-paths" className="text-xs">Monte Carlo paths</Label>
                  <Input
                    id="qp-paths"
                    type="number"
                    min={100}
                    max={10000}
                    step={100}
                    value={paths}
                    onChange={(e) => {
                      const v = Math.max(100, Math.min(10000, Math.round(Number(e.target.value) || 0)));
                      setPaths(v);
                    }}
                    className="h-8"
                  />
                  <p className="text-[10px] text-muted-foreground">More paths = smoother tails, slower compute.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Confidence levels</Label>
                  <div className="flex flex-col gap-1.5">
                    {CONFIDENCE_OPTIONS.map((c) => {
                      const checked = confidences.includes(c);
                      return (
                        <label key={c} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(state) => {
                              setConfidences((prev) => {
                                const next = state ? [...prev, c] : prev.filter((x) => x !== c);
                                return next.length ? next.sort((a, b) => a - b) : [0.95];
                              });
                            }}
                          />
                          {(c * 100).toFixed(0)}%
                        </label>
                      );
                    })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleShare} aria-label="Share analysis link">
              <Share2 className="h-3.5 w-3.5 mr-1.5" /> Share
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs" aria-label="Export analysis">
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportQuantCsv(exportInput())}>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> CSV report
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportQuantPdf(exportInput())}>
                  <FileText className="h-3.5 w-3.5 mr-2" /> PDF report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="mc">
          <TabsList>
            <TabsTrigger value="mc"><Activity className="h-3.5 w-3.5 mr-1.5" /> Monte Carlo</TabsTrigger>
            <TabsTrigger value="var"><ShieldAlert className="h-3.5 w-3.5 mr-1.5" /> VaR / CVaR</TabsTrigger>
            <TabsTrigger value="scenarios"><Atom className="h-3.5 w-3.5 mr-1.5" /> Macro scenarios</TabsTrigger>
            <TabsTrigger value="factors"><Layers className="h-3.5 w-3.5 mr-1.5" /> Factors</TabsTrigger>
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {varRows.map((row) => (
                    <ClickableStat
                      key={`var-${row.confidence}`}
                      label={`VaR ${(row.confidence * 100).toFixed(0)}%`}
                      value={fmtMoney(row.varPct * startValue)}
                      sub={`${(row.varPct * 100).toFixed(2)}% · click for breakdown`}
                      tone="bear"
                      onClick={() => setOpenVar(row)}
                    />
                  ))}
                  {varRows.map((row) => (
                    <ClickableStat
                      key={`cvar-${row.confidence}`}
                      label={`CVaR ${(row.confidence * 100).toFixed(0)}%`}
                      value={fmtMoney(row.cvarPct * startValue)}
                      sub={`${(row.cvarPct * 100).toFixed(2)}% · click for breakdown`}
                      tone="bear"
                      onClick={() => setOpenVar(row)}
                    />
                  ))}
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
                        <th className="py-1.5 px-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {varRows.map((row) => (
                        <tr
                          key={row.confidence}
                          className="border-b border-border/40 cursor-pointer hover:bg-muted/30"
                          onClick={() => setOpenVar(row)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpenVar(row); }}
                        >
                          <td className="py-1.5 px-3">{(row.confidence * 100).toFixed(0)}%</td>
                          <td className="py-1.5 px-3 text-right font-mono text-bear">{(row.varPct * 100).toFixed(2)}%</td>
                          <td className="py-1.5 px-3 text-right font-mono text-bear">{fmtMoney(row.varPct * startValue)}</td>
                          <td className="py-1.5 px-3 text-right font-mono text-bear">{(row.cvarPct * 100).toFixed(2)}%</td>
                          <td className="py-1.5 px-3 text-right font-mono text-bear">{fmtMoney(row.cvarPct * startValue)}</td>
                          <td className="py-1.5 px-3 text-right text-muted-foreground"><ChevronRight className="h-3.5 w-3.5 inline" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  Historical method, 1-day horizon. Click any tile or row for the per-holding contribution breakdown.
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
                      <th className="py-1.5 px-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {scenarioImpacts
                      .slice()
                      .sort((a, b) => a.pnlPct - b.pnlPct)
                      .map((s) => {
                        const worstBucket = [...s.byBucket].sort((a, b) => a.pnl - b.pnl)[0];
                        return (
                          <tr
                            key={s.scenario.id}
                            className="border-b border-border/40 cursor-pointer hover:bg-muted/30"
                            onClick={() => setOpenScenario(s)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpenScenario(s); }}
                          >
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
                            <td className="py-1.5 px-3 text-right text-muted-foreground"><ChevronRight className="h-3.5 w-3.5 inline" /></td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground italic">
              Click any scenario for the per-holding contribution breakdown.
            </p>
          </TabsContent>

          {/* Factors & Correlations */}
          <TabsContent value="factors" className="space-y-4 pt-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Stat label="Asset-class HHI" value={factorBreakdown.hhi.assetClass.toFixed(2)} tone={factorBreakdown.hhi.assetClass > 0.4 ? "bear" : "muted"} />
              <Stat label="Sector HHI" value={factorBreakdown.hhi.sector.toFixed(2)} tone={factorBreakdown.hhi.sector > 0.4 ? "bear" : "muted"} />
              <Stat label="Geography HHI" value={factorBreakdown.hhi.geography.toFixed(2)} tone={factorBreakdown.hhi.geography > 0.4 ? "bear" : "muted"} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <FactorTable title="Asset class" rows={factorBreakdown.assetClass} />
              <FactorTable title="Sector" rows={factorBreakdown.sector} />
              <FactorTable title="Geography" rows={factorBreakdown.geography} />
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Pairwise co-movement proxy</div>
                <Badge variant="outline" className="text-[10px] font-normal">avg ρ̂ {coMovement.avg.toFixed(2)}</Badge>
              </div>
              {coMovement.symbols.length === 0 ? (
                <p className="text-sm text-muted-foreground">No holdings to compare.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-[10px]">
                    <thead>
                      <tr>
                        <th />
                        {coMovement.symbols.map((s) => (
                          <th key={s} className="px-1 py-0.5 font-mono text-muted-foreground">{s}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {coMovement.matrix.map((row, i) => (
                        <tr key={i}>
                          <td className="px-1 py-0.5 font-mono text-muted-foreground">{coMovement.symbols[i]}</td>
                          {row.map((v, j) => {
                            const intensity = Math.round(v * 255);
                            return (
                              <td
                                key={j}
                                className="w-7 h-7 text-center font-mono text-[10px]"
                                style={{
                                  background: `hsl(var(--primary) / ${v.toFixed(2)})`,
                                  color: v > 0.55 ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
                                }}
                                title={`${coMovement.symbols[i]} ↔ ${coMovement.symbols[j]} ≈ ${v.toFixed(2)}`}
                              >
                                {intensity > -1 ? v.toFixed(2) : ""}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-[10px] text-muted-foreground italic">
                Meta-derived proxy (asset class · sector · geography overlap). Use the Optimizer page for full
                return-history Pearson correlation. Concentrated factor exposure here narrows Monte Carlo
                dispersion and amplifies macro-scenario tails.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>

      {/* Scenario drill-down */}
      <Sheet open={!!openScenario} onOpenChange={(o) => { if (!o) setOpenScenario(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {openScenario && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Atom className="h-4 w-4 text-primary" /> {openScenario.scenario.name}
                </SheetTitle>
                <SheetDescription>{openScenario.scenario.description}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Stat label="Portfolio P/L" value={fmtMoney(openScenario.pnl)} tone={openScenario.pnl >= 0 ? "bull" : "bear"} />
                <Stat label="Portfolio P/L %" value={fmtPct(openScenario.pnlPct, 2)} tone={openScenario.pnlPct >= 0 ? "bull" : "bear"} />
              </div>
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">By asset class</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-border text-[10px] uppercase text-muted-foreground">
                      <th className="py-1 px-2">Bucket</th>
                      <th className="py-1 px-2 text-right">P/L</th>
                      <th className="py-1 px-2 text-right">P/L %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openScenario.byBucket.map((b) => (
                      <tr key={b.bucket} className="border-b border-border/40">
                        <td className="py-1 px-2"><Badge variant="outline" className="text-[10px] font-normal">{b.bucket}</Badge></td>
                        <td className={`py-1 px-2 text-right font-mono ${b.pnl >= 0 ? "text-bull" : "text-bear"}`}>{fmtMoney(b.pnl)}</td>
                        <td className={`py-1 px-2 text-right font-mono ${b.pnlPct >= 0 ? "text-bull" : "text-bear"}`}>{fmtPct(b.pnlPct, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Per-position contribution</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-border text-[10px] uppercase text-muted-foreground">
                      <th className="py-1 px-2">Symbol</th>
                      <th className="py-1 px-2 text-right">Weight</th>
                      <th className="py-1 px-2 text-right">Shock</th>
                      <th className="py-1 px-2 text-right">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openScenario.byPosition.slice().sort((a, b) => a.pnl - b.pnl).map((p) => (
                      <tr key={p.symbol} className="border-b border-border/40">
                        <td className="py-1 px-2 font-mono">{p.symbol}</td>
                        <td className="py-1 px-2 text-right font-mono">{fmtWeight(p.weight)}</td>
                        <td className={`py-1 px-2 text-right font-mono ${p.shockPct >= 0 ? "text-bull" : "text-bear"}`}>{fmtPct(p.shockPct, 2)}</td>
                        <td className={`py-1 px-2 text-right font-mono ${p.pnl >= 0 ? "text-bull" : "text-bear"}`}>{fmtMoney(p.pnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* VaR / CVaR drill-down */}
      <Sheet open={!!openVar} onOpenChange={(o) => { if (!o) setOpenVar(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {openVar && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-bear" /> Loss attribution · {(openVar.confidence * 100).toFixed(0)}%
                </SheetTitle>
                <SheetDescription>
                  Estimated per-holding contribution to the {fmtPct(openVar.varPct, 2)} VaR /{" "}
                  {fmtPct(openVar.cvarPct, 2)} CVaR loss, allocated proportionally to portfolio weight.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Stat label="VaR" value={fmtMoney(openVar.varPct * startValue)} tone="bear" />
                <Stat label="CVaR" value={fmtMoney(openVar.cvarPct * startValue)} tone="bear" />
              </div>
              <div className="mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-border text-[10px] uppercase text-muted-foreground">
                      <th className="py-1 px-2">Symbol</th>
                      <th className="py-1 px-2">Asset class</th>
                      <th className="py-1 px-2 text-right">Weight</th>
                      <th className="py-1 px-2 text-right">VaR share</th>
                      <th className="py-1 px-2 text-right">CVaR share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.slice().sort((a, b) => b.weight - a.weight).map((h) => {
                      const meta = getInstrumentMeta(h.symbol);
                      return (
                        <tr key={h.symbol} className="border-b border-border/40">
                          <td className="py-1 px-2 font-mono">{h.symbol}</td>
                          <td className="py-1 px-2"><Badge variant="outline" className="text-[10px] font-normal">{meta.assetClass}</Badge></td>
                          <td className="py-1 px-2 text-right font-mono">{fmtWeight(h.weight)}</td>
                          <td className="py-1 px-2 text-right font-mono text-bear">{fmtMoney(openVar.varPct * startValue * h.weight)}</td>
                          <td className="py-1 px-2 text-right font-mono text-bear">{fmtMoney(openVar.cvarPct * startValue * h.weight)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[10px] text-muted-foreground italic">
                Weight-proportional approximation. A full per-asset return decomposition requires return
                histories per holding (available in the Optimizer).
              </p>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
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

function ClickableStat({
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "bull" | "bear" | "muted";
  onClick: () => void;
}) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-md border border-border bg-muted/30 p-2 hover:bg-muted/60 hover:border-primary/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className={`font-mono text-sm ${cls}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </button>
  );
}

function FactorTable({ title, rows }: { title: string; rows: { key: string; weight: number }[] }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.key} className="space-y-0.5">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate" title={r.key}>{r.key}</span>
                <span className="font-mono text-muted-foreground">{(r.weight * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, r.weight * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BacktestQuantPanel;