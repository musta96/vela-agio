import { useEffect, useMemo, useState } from "react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, AlertTriangle, Activity, Zap, FileDown } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePortfolio } from "@/hooks/usePortfolio";
import type { OHLCBar } from "@/lib/technicalIndicators";
import {
  computePortfolioRisk,
  portfolioReturns,
  applyStress,
  DEFAULT_SCENARIOS,
  factorExposures,
  concentration,
  type PortfolioPosition,
  type PortfolioRisk,
} from "@/lib/portfolioRisk";
import { MacroScenarioLab } from "@/components/MacroScenarioLab";
import { ScenarioVarBreakdown } from "@/components/ScenarioVarBreakdown";
import {
  varCvarByAssetClass,
  scenarioByAssetClassMatrix,
  type BreakdownPosition,
} from "@/lib/scenarioVar";
import { MACRO_SCENARIOS, type ScenarioImpact } from "@/lib/quantScenarios";
import { generatePortfolioRiskReport, buildPortfolioRiskFilename } from "@/lib/pdfReports";
import { useStableMemo } from "@/lib/computeCache";
import { toast } from "sonner";

const FACTOR_PROXIES = [
  { factor: "US Market", symbol: "SPY" },
  { factor: "EU Market", symbol: "EZU" },
  { factor: "Small caps", symbol: "IWM" },
  { factor: "Momentum", symbol: "MTUM" },
  { factor: "Value", symbol: "VLUE" },
  { factor: "Quality", symbol: "QUAL" },
  { factor: "Low volatility", symbol: "USMV" },
  { factor: "Tech (NDX)", symbol: "QQQ" },
];

const BENCHMARK_SYMBOL = "SPY";

async function fetchBars(symbol: string): Promise<OHLCBar[]> {
  const { data, error } = await supabase.functions.invoke("market-data", {
    body: { action: "ohlc", symbol, range: "1y", interval: "1d" },
  });
  if (error || !data?.bars) return [];
  return data.bars as OHLCBar[];
}

async function fetchQuote(symbol: string): Promise<number | null> {
  const { data } = await supabase.functions.invoke("market-data", {
    body: { action: "quote", symbols: [symbol] },
  });
  const q = (data as any)?.quotes?.[0];
  return q?.price ?? null;
}

const Risk = () => {
  const { holdings: pfHoldings } = usePortfolio();
  const holdings = useMemo(
    () => pfHoldings.map((h) => ({ symbol: h.symbol, name: h.name ?? h.symbol, shares: h.shares })),
    [pfHoldings],
  );
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [benchmark, setBenchmark] = useState<OHLCBar[]>([]);
  const [factors, setFactors] = useState<Array<{ factor: string; symbol: string; bars: OHLCBar[] }>>([]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [macroImpact, setMacroImpact] = useState<ScenarioImpact | null>(null);

  // Holdings now sourced from the canonical `usePortfolio` hook so Risk
  // always reconciles with the Dashboard / Portfolio header totals.

  // Load bars for all holdings + benchmark + factor proxies
  useEffect(() => {
    if (holdings.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setStage("Loading holdings…");
      const enriched: PortfolioPosition[] = [];
      for (const h of holdings) {
        const [bars, price] = await Promise.all([fetchBars(h.symbol), fetchQuote(h.symbol)]);
        if (cancelled) return;
        const px = price ?? bars[bars.length - 1]?.close ?? 0;
        enriched.push({ symbol: h.symbol, name: h.name, bars, value: h.shares * px });
      }
      if (cancelled) return;
      setPositions(enriched);
      setStage("Loading benchmark…");
      const b = await fetchBars(BENCHMARK_SYMBOL);
      if (cancelled) return;
      setBenchmark(b);
      setStage("Loading factor exposures…");
      const facBars: typeof factors = [];
      for (const f of FACTOR_PROXIES) {
        const fb = await fetchBars(f.symbol);
        if (cancelled) return;
        facBars.push({ ...f, bars: fb });
      }
      if (cancelled) return;
      setFactors(facBars);
      setStage("");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [holdings]);

  const risk: PortfolioRisk | null = useMemo(
    () => (positions.length ? computePortfolioRisk(positions, benchmark) : null),
    [positions, benchmark],
  );

  const portRets = useMemo(() => portfolioReturns(positions), [positions]);
  const factorBetas = useMemo(
    () => (portRets.length && factors.length ? factorExposures(portRets, factors) : []),
    [portRets, factors],
  );
  const conc = useMemo(() => concentration(positions), [positions]);
  const totalVal = positions.reduce((s, p) => s + p.value, 0);

  const stressRows = useMemo(() => {
    if (!risk) return [];
    return DEFAULT_SCENARIOS.map((s) => ({ ...s, ...applyStress(positions, s, risk.beta) }));
  }, [positions, risk]);

  const fmtPct = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

  // Breakdown inputs shared by the on-screen card and the PDF report.
  const breakdownPositions: BreakdownPosition[] = useMemo(
    () => positions.map((p) => ({
      symbol: p.symbol,
      name: p.name,
      value: p.value,
      closes: p.bars.map((b) => b.close),
    })),
    [positions],
  );

  const breakdown = useStableMemo(
    () => varCvarByAssetClass(breakdownPositions, [0.95, 0.99]),
    { positions: breakdownPositions.map((p) => [p.symbol, p.value, p.closes?.length ?? 0]) },
  );
  const scenarioMatrix = useStableMemo(
    () => scenarioByAssetClassMatrix(breakdownPositions, MACRO_SCENARIOS.slice(0, 6)),
    { positions: breakdownPositions.map((p) => [p.symbol, p.value]) },
  );

  const exportPdf = () => {
    if (!risk) return;
    try {
      const { filename } = generatePortfolioRiskReport({
        totalValue: totalVal,
        currency: "€",
        metrics: { vol: risk.vol, sharpe: risk.sharpe, maxDD: risk.maxDD, beta: risk.beta },
        histVar: { var95: risk.var95, cvar95: risk.cvar95, var99: risk.var99, parametricVaR95: risk.parametricVaR95 },
        byAssetClass: breakdown.byClass,
        portfolio: breakdown.portfolio,
        scenarioMatrix: scenarioMatrix.rows,
        scenarioOrder: scenarioMatrix.scenarios.map((s) => ({ id: s.id, name: s.name })),
        stressRows,
        topPositions: positions
          .slice()
          .sort((a, b) => b.value - a.value)
          .slice(0, 10)
          .map((p) => ({ symbol: p.symbol, name: p.name, value: p.value, weight: totalVal > 0 ? p.value / totalVal : 0 })),
      }, { filename: buildPortfolioRiskFilename() });
      toast.success("Risk report exported", { description: filename });
    } catch (e) {
      toast.error("Could not export risk PDF", { description: (e as Error).message });
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO
        title="Portfolio Risk Engine - VaR, Stress Tests, Factor Exposure"
        description="Pro-grade risk analytics for your portfolio: VaR, CVaR, Monte Carlo stress, factor exposure, concentration, and beta."
        path="/risk"
      />
      <PageHeader
        icon={ShieldAlert}
        title="Portfolio Risk Engine"
        description="Value-at-Risk, stress tests, factor exposure, and concentration analysis for your live portfolio."
        actions={
          risk ? (
            <Button variant="outline" size="sm" className="gap-2" onClick={exportPdf}>
              <FileDown className="h-4 w-4" /> Export PDF
            </Button>
          ) : undefined
        }
      />

        {holdings.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-warning" />
              No holdings yet. <Link to="/portfolio" className="text-primary underline">Add positions to your portfolio</Link> to see risk analytics.
            </CardContent>
          </Card>
        ) : loading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-primary" />
              {stage || "Loading…"}
            </CardContent>
          </Card>
        ) : !risk ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Not enough data to compute risk yet.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Top metrics - v2 unified KPI strip */}
            <div className="bg-card border border-border rounded-2xl divide-y md:divide-y-0 md:divide-x divide-border grid grid-cols-2 md:grid-cols-4">
              {[
                { l: "Portfolio value", v: `€${totalVal.toFixed(0)}`, t: "" },
                { l: "Ann. volatility", v: `${(risk.vol * 100).toFixed(1)}%`, t: "" },
                { l: "Sharpe (1Y)", v: risk.sharpe.toFixed(2), t: risk.sharpe > 1 ? "text-success" : risk.sharpe < 0 ? "text-destructive" : "" },
                { l: "Max drawdown", v: `${(risk.maxDD * 100).toFixed(1)}%`, t: "text-destructive" },
              ].map((m) => (
                <div key={m.l} className="p-5 flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{m.l}</span>
                  <span className={`text-2xl font-bold tracking-tight ${m.t}`}>{m.v}</span>
                </div>
              ))}
            </div>

            {/* VaR */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Value-at-Risk (1-day)</CardTitle>
                <CardDescription>How much you could lose on a single bad day.</CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-4 gap-3 text-sm">
                <VarCell label="Historical VaR 95%" pct={risk.var95} val={risk.var95 * totalVal} />
                <VarCell label="Historical CVaR 95%" pct={risk.cvar95} val={risk.cvar95 * totalVal} />
                <VarCell label="Historical VaR 99%" pct={risk.var99} val={risk.var99 * totalVal} />
                <VarCell label="Parametric VaR 95%" pct={risk.parametricVaR95} val={risk.parametricVaR95 * totalVal} />
              </CardContent>
            </Card>

            {/* Stress tests */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-warning" /> Stress scenarios</CardTitle>
                <CardDescription>Simulated P/L under historical and hypothetical shocks (portfolio beta = {risk.beta?.toFixed(2) ?? "-"}).</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-border">
                        <th className="py-2 pr-3">Scenario</th>
                        <th className="py-2 pr-3">Description</th>
                        <th className="py-2 pr-3 text-right">P/L %</th>
                        <th className="py-2 pr-3 text-right">P/L €</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stressRows.map((s) => (
                        <tr key={s.name} className="border-b border-border/40">
                          <td className="py-2 pr-3 font-medium">{s.name}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{s.description}</td>
                          <td className={`py-2 pr-3 text-right font-mono ${s.pnlPct >= 0 ? "text-success" : "text-destructive"}`}>{fmtPct(s.pnlPct)}</td>
                          <td className={`py-2 pr-3 text-right font-mono ${s.pnl >= 0 ? "text-success" : "text-destructive"}`}>{(s.pnl >= 0 ? "+€" : "−€") + Math.abs(s.pnl).toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Macro scenario lab — per-position sensitivities */}
            <MacroScenarioLab
              positions={positions.map((p) => ({ symbol: p.symbol, name: p.name, value: p.value }))}
              onImpactChange={setMacroImpact}
            />

            {/* VaR / CVaR + scenario breakdown table */}
            <ScenarioVarBreakdown
              positions={breakdownPositions}
              currency="€"
            />

            {/* Factor exposures */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Factor exposures</CardTitle>
                <CardDescription>Portfolio beta to common style factors (1Y daily returns).</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-2">
                  {factorBetas.map((f) => (
                    <div key={f.symbol} className="flex items-center justify-between rounded border border-border/50 px-3 py-2">
                      <div>
                        <div className="text-sm font-medium">{f.factor}</div>
                        <div className="text-xs text-muted-foreground font-mono">{f.symbol}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-muted rounded overflow-hidden">
                          <div
                            className={`h-full ${f.beta >= 0 ? "bg-primary" : "bg-destructive"}`}
                            style={{ width: `${Math.min(100, Math.abs(f.beta) * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-sm w-12 text-right">{f.beta.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Concentration */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Concentration</CardTitle>
                <CardDescription>Herfindahl-Hirschman index and weights of top positions.</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-4 gap-3 text-sm">
                <Metric label="HHI" value={conc.hhi.toFixed(3)} tone={conc.hhi > 0.25 ? "bad" : conc.hhi < 0.15 ? "good" : undefined} />
                <Metric label="Top 1 weight" value={`${(conc.top1 * 100).toFixed(1)}%`} tone={conc.top1 > 0.3 ? "bad" : undefined} />
                <Metric label="Top 3 weight" value={`${(conc.top3 * 100).toFixed(1)}%`} />
                <Metric label="Effective # holdings" value={conc.effectiveN.toFixed(1)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Position contribution</CardTitle>
                <CardDescription>Per-position weight, volatility, and beta vs benchmark.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-border">
                        <th className="py-2 pr-3">Symbol</th>
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3 text-right">Value</th>
                        <th className="py-2 pr-3 text-right">Weight</th>
                        <th className="py-2 pr-3 text-right">Vol</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions
                        .slice()
                        .sort((a, b) => b.value - a.value)
                        .map((p) => {
                          const rets = p.bars.length > 30 ? p.bars.map((b) => b.close) : [];
                          const vol = rets.length ? Math.sqrt(252) * 100 * (function () {
                            const r: number[] = [];
                            for (let i = 1; i < rets.length; i++) r.push(rets[i] / rets[i - 1] - 1);
                            const m = r.reduce((s, x) => s + x, 0) / r.length;
                            const sd = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, r.length - 1));
                            return sd;
                          })() : null;
                          return (
                            <tr key={p.symbol} className="border-b border-border/40">
                              <td className="py-2 pr-3 font-mono">{p.symbol}</td>
                              <td className="py-2 pr-3 text-muted-foreground">{p.name}</td>
                              <td className="py-2 pr-3 text-right font-mono">€{p.value.toFixed(0)}</td>
                              <td className="py-2 pr-3 text-right font-mono">{((p.value / totalVal) * 100).toFixed(1)}%</td>
                              <td className="py-2 pr-3 text-right font-mono">{vol ? `${vol.toFixed(1)}%` : "-"}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
    </div>
  );
};

const Metric = ({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) => (
  <div className="rounded border border-border/50 p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`text-xl font-bold font-mono ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}>{value}</p>
  </div>
);

const VarCell = ({ label, pct, val }: { label: string; pct: number; val: number }) => (
  <div className="rounded border border-border/50 p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-lg font-bold font-mono text-destructive">{(pct * 100).toFixed(2)}%</p>
    <p className="text-xs text-muted-foreground">≈ −€{Math.abs(val).toFixed(0)}</p>
  </div>
);

export default Risk;