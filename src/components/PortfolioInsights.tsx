import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { OHLCBar } from "@/lib/technicalIndicators";
import { returns, beta, correlation, realizedVol, valueAtRisk, sharpe, sortino, maxDrawdown } from "@/lib/riskMetrics";
import { findCatalogEntry } from "@/data/stockCatalog";

export interface PortfolioAnalytics {
  vol: number;
  var95: number;
  sharpe: number;
  sortino: number;
  maxDD: number;
  betaMib: number | null;
  betaSpx: number | null;
  hhi: number;          // 0..1 (sum of squared weights)
  top3Weight: number;   // 0..1
  diversification: string; // grade
  marketExposure: Array<[string, number]>;
  currencyExposure: Array<[string, number]>;
  topContributors: Array<{ symbol: string; pnl: number; pct: number }>;
  riskContribution: Array<{ symbol: string; contribution: number }>;
  correlation: { symbols: string[]; matrix: number[][] } | null;
}

interface Holding { symbol: string; shares: number; avgPrice: number; currentPrice: number; currency?: string; }
interface Props { holdings: Holding[]; onAnalytics?: (a: PortfolioAnalytics | null) => void; }

const ITALIAN_CGT_RATE = 0.26;

export const PortfolioInsights = ({ holdings, onAnalytics }: Props) => {
  const [bars, setBars] = useState<Record<string, OHLCBar[]>>({});
  const [mibBars, setMibBars] = useState<OHLCBar[]>([]);
  const [spxBars, setSpxBars] = useState<OHLCBar[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (holdings.length === 0) return;
    (async () => {
      const results: Record<string, OHLCBar[]> = {};
      await Promise.all(
        holdings.map(async (h) => {
          try {
            const { data } = await supabase.functions.invoke("market-data", {
              body: { action: "ohlc", symbol: h.symbol, range: "1y", interval: "1d" },
            });
            if (data?.bars) results[h.symbol] = data.bars;
          } catch { /* ignore */ }
        })
      );
      // benchmark FTSE MIB
      const [mib, spx] = await Promise.all([
        supabase.functions.invoke("market-data", { body: { action: "ohlc", symbol: "FTSEMIB.MI", range: "1y", interval: "1d" } }),
        supabase.functions.invoke("market-data", { body: { action: "ohlc", symbol: "^GSPC", range: "1y", interval: "1d" } }),
      ]);
      if (!cancelled) {
        setBars(results);
        setMibBars(mib.data?.bars || []);
        setSpxBars(spx.data?.bars || []);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.map((h) => h.symbol).join(",")]);

  const totalValue = holdings.reduce((a, h) => a + h.shares * h.currentPrice, 0);
  const weights = holdings.map((h) => (h.shares * h.currentPrice) / (totalValue || 1));

  // Portfolio returns (weighted) for vol / VaR / beta
  const stats = useMemo(() => {
    if (holdings.length === 0) return null;
    const symBars = holdings.map((h) => bars[h.symbol] || []);
    if (symBars.some((b) => b.length < 30)) return null;
    const minLen = Math.min(...symBars.map((b) => b.length));
    const rets = symBars.map((b) => returns(b.slice(-minLen).map((x) => x.close)));
    const port: number[] = [];
    for (let i = 0; i < rets[0].length; i++) {
      let r = 0;
      rets.forEach((arr, j) => (r += arr[i] * weights[j]));
      port.push(r);
    }
    const mibRets = mibBars.length > 30 ? returns(mibBars.map((b) => b.close)) : [];
    const spxRets = spxBars.length > 30 ? returns(spxBars.map((b) => b.close)) : [];
    const equity = [1];
    port.forEach((r) => equity.push(equity[equity.length - 1] * (1 + r)));
    return {
      vol: realizedVol(port),
      var95: valueAtRisk(port, 0.95),
      sharpe: sharpe(port),
      sortino: sortino(port),
      maxDD: maxDrawdown(equity).maxDD,
      betaMib: mibRets.length ? beta(port, mibRets) : null,
      betaSpx: spxRets.length ? beta(port, spxRets) : null,
      symRets: rets,
      portRets: port,
    };
  }, [bars, mibBars, spxBars, holdings, weights]);

  // Market exposure (from catalog) and currency exposure
  const marketExposure = useMemo(() => {
    const map: Record<string, number> = {};
    holdings.forEach((h, i) => {
      const entry = findCatalogEntry(h.symbol);
      const mkt = entry?.market || "Other";
      map[mkt] = (map[mkt] || 0) + weights[i];
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [holdings, weights]);
  const currencyExposure = useMemo(() => {
    const map: Record<string, number> = {};
    holdings.forEach((h, i) => {
      const cur = h.currency || findCatalogEntry(h.symbol)?.currency || "EUR";
      map[cur] = (map[cur] || 0) + weights[i];
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [holdings, weights]);

  // Concentration: Herfindahl-Hirschman Index over weights
  const hhi = useMemo(() => weights.reduce((a, w) => a + w * w, 0), [weights]);
  const top3Weight = useMemo(() => [...weights].sort((a, b) => b - a).slice(0, 3).reduce((a, w) => a + w, 0), [weights]);
  const diversificationGrade = hhi < 0.15 ? "Excellent" : hhi < 0.25 ? "Good" : hhi < 0.4 ? "Fair" : "Concentrated";
  const diversificationTone = hhi < 0.15 ? "text-success" : hhi < 0.25 ? "text-success" : hhi < 0.4 ? "text-amber-600 dark:text-amber-400" : "text-destructive";

  // Top contributors by P&L
  const topContributors = useMemo(() => {
    return holdings
      .map((h) => {
        const pnl = (h.currentPrice - h.avgPrice) * h.shares;
        return { symbol: h.symbol, pnl, pct: h.avgPrice > 0 ? (h.currentPrice / h.avgPrice - 1) * 100 : 0 };
      })
      .sort((a, b) => b.pnl - a.pnl);
  }, [holdings]);

  // Risk contribution per holding: w_i * vol_i / portVol (Euler approximation)
  const riskContribution = useMemo(() => {
    if (!stats?.symRets) return [];
    const portVol = stats.vol || 1;
    return holdings.map((h, i) => ({
      symbol: h.symbol,
      contribution: (weights[i] * realizedVol(stats.symRets[i])) / portVol,
    })).sort((a, b) => b.contribution - a.contribution);
  }, [stats, holdings, weights]);

  // Correlation matrix
  const corrMatrix = useMemo(() => {
    if (!stats?.symRets) return null;
    return stats.symRets.map((a, i) =>
      stats.symRets.map((b, j) => (i === j ? 1 : correlation(a, b)))
    );
  }, [stats]);

  // Bubble analytics up for the PDF report
  useEffect(() => {
    if (!onAnalytics) return;
    if (!stats) { onAnalytics(null); return; }
    onAnalytics({
      vol: stats.vol,
      var95: stats.var95,
      sharpe: stats.sharpe,
      sortino: stats.sortino,
      maxDD: stats.maxDD,
      betaMib: stats.betaMib,
      betaSpx: stats.betaSpx,
      hhi,
      top3Weight,
      diversification: diversificationGrade,
      marketExposure,
      currencyExposure,
      topContributors,
      riskContribution,
      correlation: corrMatrix ? { symbols: holdings.map((h) => h.symbol), matrix: corrMatrix } : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, hhi, corrMatrix]);

  if (holdings.length === 0) return null;

  return (
    <Card className="mb-8 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted/40 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">Advanced analytics</div>
                <div className="text-xs text-muted-foreground truncate">
                  Risk · correlation · exposure · concentration {stats ? "" : "(loading…)"}
                </div>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>

        {/* Always-visible compact KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-t border-border divide-x divide-border">
          <Kpi label="Ann. vol" value={stats ? `${(stats.vol * 100).toFixed(1)}%` : "—"} />
          <Kpi label="VaR 95% (1d)" value={stats ? `${(stats.var95 * 100).toFixed(2)}%` : "—"} tone="bad" />
          <Kpi label="Sharpe" value={stats ? stats.sharpe.toFixed(2) : "—"} tone={stats && stats.sharpe > 1 ? "good" : undefined} />
          <Kpi label="Sortino" value={stats ? stats.sortino.toFixed(2) : "—"} />
          <Kpi label="Max DD" value={stats ? `${(stats.maxDD * 100).toFixed(1)}%` : "—"} tone="bad" />
          <Kpi label="HHI" value={hhi.toFixed(2)} sub={diversificationGrade} subClass={diversificationTone} />
        </div>

        <CollapsibleContent>
          <div className="grid lg:grid-cols-3 gap-4 p-5 border-t border-border bg-muted/20">
            {/* Risk vs benchmarks */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Risk vs benchmarks</CardTitle>
                <CardDescription className="text-xs">1Y daily, beta vs index</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Row label="Beta vs FTSE MIB" value={stats?.betaMib != null ? stats.betaMib.toFixed(2) : "—"} />
                <Row label="Beta vs S&P 500" value={stats?.betaSpx != null ? stats.betaSpx.toFixed(2) : "—"} />
                <Row label="Top-3 weight" value={`${(top3Weight * 100).toFixed(1)}%`} tone={top3Weight > 0.6 ? "bad" : undefined} />
                <Row label="Diversification" value={diversificationGrade} tone={hhi < 0.25 ? "good" : hhi > 0.4 ? "bad" : undefined} />
              </CardContent>
            </Card>

            {/* Market exposure */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Market exposure</CardTitle>
                <CardDescription className="text-xs">Allocation by market</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {marketExposure.map(([s, w]) => (
                  <Bar key={s} label={s} pct={w} />
                ))}
              </CardContent>
            </Card>

            {/* Currency exposure */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Currency exposure</CardTitle>
                <CardDescription className="text-xs">FX risk by currency</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {currencyExposure.map(([c, w]) => (
                  <Bar key={c} label={c} pct={w} />
                ))}
              </CardContent>
            </Card>

            {/* Top contributors */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top contributors</CardTitle>
                <CardDescription className="text-xs">Best / worst P&amp;L</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {topContributors.slice(0, 3).map((c) => (
                  <Row key={`g-${c.symbol}`} label={c.symbol} value={`€${c.pnl.toFixed(0)} (${c.pct >= 0 ? "+" : ""}${c.pct.toFixed(1)}%)`} tone="good" />
                ))}
                {topContributors.length > 3 && (
                  <>
                    <div className="border-t border-border my-1" />
                    {topContributors.slice(-Math.min(3, topContributors.length - 3)).reverse().map((c) => (
                      <Row key={`b-${c.symbol}`} label={c.symbol} value={`€${c.pnl.toFixed(0)} (${c.pct >= 0 ? "+" : ""}${c.pct.toFixed(1)}%)`} tone="bad" />
                    ))}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Risk contribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Risk contribution</CardTitle>
                <CardDescription className="text-xs">Share of portfolio volatility</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {riskContribution.length ? riskContribution.slice(0, 6).map((r) => (
                  <Bar key={r.symbol} label={r.symbol} pct={r.contribution} />
                )) : <p className="text-xs text-muted-foreground">Need 30+ days of price data per holding.</p>}
              </CardContent>
            </Card>

            {/* Correlation matrix */}
            {corrMatrix && holdings.length > 1 && (
              <Card className="lg:col-span-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Correlation matrix</CardTitle>
                  <CardDescription className="text-xs">1Y daily returns — red = concentration risk, green = diversifying</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="text-xs">
                      <thead>
                        <tr>
                          <th className="px-2 py-1"></th>
                          {holdings.map((h) => (
                            <th key={h.symbol} className="px-2 py-1 font-mono">{h.symbol}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {holdings.map((h, i) => (
                          <tr key={h.symbol}>
                            <td className="px-2 py-1 font-mono">{h.symbol}</td>
                            {holdings.map((_, j) => {
                              const v = corrMatrix[i][j];
                              const c =
                                v > 0.7 ? "bg-destructive/30 text-destructive"
                                : v > 0.4 ? "bg-destructive/15"
                                : v > -0.4 ? "bg-muted/30"
                                : "bg-success/15 text-success";
                              return (
                                <td key={j} className={`px-2 py-1 font-mono text-center ${c}`}>{v.toFixed(2)}</td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

const Kpi = ({ label, value, tone, sub, subClass }: { label: string; value: string; tone?: "good" | "bad"; sub?: string; subClass?: string }) => (
  <div className="px-4 py-3">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={`text-lg font-bold tabular-nums ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}>{value}</div>
    {sub && <div className={`text-[10px] ${subClass || "text-muted-foreground"}`}>{sub}</div>}
  </div>
);

const Bar = ({ label, pct }: { label: string; pct: number }) => (
  <div className="flex items-center gap-2">
    <span className="w-24 truncate text-xs">{label}</span>
    <div className="flex-1 h-1.5 bg-muted rounded">
      <div className="h-1.5 bg-primary rounded" style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%` }} />
    </div>
    <span className="font-mono text-xs w-12 text-right tabular-nums">{(pct * 100).toFixed(1)}%</span>
  </div>
);

const Row = ({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) => (
  <div className="flex justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-mono font-semibold ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}>{value}</span>
  </div>
);