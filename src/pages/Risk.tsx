import { useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, AlertTriangle, Activity, Zap, FileDown } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  const { user } = useAuth();
  const [holdings, setHoldings] = useState<Array<{ symbol: string; name: string; shares: number }>>([]);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [benchmark, setBenchmark] = useState<OHLCBar[]>([]);
  const [factors, setFactors] = useState<Array<{ factor: string; symbol: string; bars: OHLCBar[] }>>([]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<string>("");

  // Load holdings
  useEffect(() => {
    (async () => {
      if (user) {
        const { data } = await supabase
          .from("portfolio_holdings")
          .select("symbol,name,shares")
          .order("created_at", { ascending: true });
        if (data) setHoldings(data.map((r) => ({ symbol: r.symbol, name: r.name, shares: Number(r.shares) })));
      } else {
        try {
          const raw = localStorage.getItem("portfolio_holdings");
          if (raw) {
            const arr = JSON.parse(raw) as any[];
            setHoldings(arr.map((r) => ({ symbol: r.symbol, name: r.name, shares: Number(r.shares) })));
          }
        } catch {}
      }
    })();
  }, [user]);

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

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Portfolio Risk Engine — VaR, Stress Tests, Factor Exposure"
        description="Pro-grade risk analytics for your portfolio: VaR, CVaR, Monte Carlo stress, factor exposure, concentration, and beta."
        path="/risk"
      />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-7 w-7 text-primary" /> Portfolio Risk Engine
          </h1>
          <p className="text-muted-foreground mt-1">
            Value-at-Risk, stress tests, factor exposure, and concentration analysis for your live portfolio.
          </p>
        </div>

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
            {/* Top metrics */}
            <div className="grid md:grid-cols-4 gap-3">
              <Metric label="Portfolio value" value={`€${totalVal.toFixed(0)}`} />
              <Metric label="Ann. volatility" value={`${(risk.vol * 100).toFixed(1)}%`} />
              <Metric label="Sharpe (1Y)" value={risk.sharpe.toFixed(2)} tone={risk.sharpe > 1 ? "good" : risk.sharpe < 0 ? "bad" : undefined} />
              <Metric label="Max drawdown" value={`${(risk.maxDD * 100).toFixed(1)}%`} tone="bad" />
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
                <CardDescription>Simulated P/L under historical and hypothetical shocks (portfolio beta = {risk.beta?.toFixed(2) ?? "—"}).</CardDescription>
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
                              <td className="py-2 pr-3 text-right font-mono">{vol ? `${vol.toFixed(1)}%` : "—"}</td>
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
      </main>
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