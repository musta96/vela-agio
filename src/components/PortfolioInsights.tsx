import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { OHLCBar } from "@/lib/technicalIndicators";
import { returns, beta, correlation, realizedVol, valueAtRisk } from "@/lib/riskMetrics";
import { findCatalogEntry } from "@/data/stockCatalog";

interface Holding { symbol: string; shares: number; avgPrice: number; currentPrice: number; }
interface Props { holdings: Holding[]; }

const ITALIAN_CGT_RATE = 0.26;

export const PortfolioInsights = ({ holdings }: Props) => {
  const [bars, setBars] = useState<Record<string, OHLCBar[]>>({});
  const [benchBars, setBenchBars] = useState<OHLCBar[]>([]);

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
      const { data: b } = await supabase.functions.invoke("market-data", {
        body: { action: "ohlc", symbol: "FTSEMIB.MI", range: "1y", interval: "1d" },
      });
      if (!cancelled) {
        setBars(results);
        setBenchBars(b?.bars || []);
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
    const benchRets = benchBars.length > 30 ? returns(benchBars.map((b) => b.close)) : [];
    return {
      vol: realizedVol(port),
      var95: valueAtRisk(port, 0.95),
      beta: benchRets.length ? beta(port, benchRets) : null,
      symRets: rets,
    };
  }, [bars, benchBars, holdings, weights]);

  // Sector exposure from catalog
  const sectorExposure = useMemo(() => {
    const map: Record<string, number> = {};
    holdings.forEach((h, i) => {
      const entry = findCatalogEntry(h.symbol);
      const sector = entry?.market || "Other";
      map[sector] = (map[sector] || 0) + weights[i];
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [holdings, weights]);

  // Italian CGT estimate (26% on unrealized gains only — losses offset within same bucket)
  const cgt = useMemo(() => {
    const gain = holdings.reduce((a, h) => a + (h.currentPrice - h.avgPrice) * h.shares, 0);
    const taxable = Math.max(0, gain);
    return { gain, tax: taxable * ITALIAN_CGT_RATE, net: gain - taxable * ITALIAN_CGT_RATE };
  }, [holdings]);

  // Correlation matrix
  const corrMatrix = useMemo(() => {
    if (!stats?.symRets) return null;
    return stats.symRets.map((a, i) =>
      stats.symRets.map((b, j) => (i === j ? 1 : correlation(a, b)))
    );
  }, [stats]);

  if (holdings.length === 0) return null;

  return (
    <div className="grid md:grid-cols-3 gap-4 mb-8">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Portfolio risk</CardTitle>
          <CardDescription>1Y daily returns, weighted</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {stats ? (
            <>
              <Row label="Annualized vol" value={`${(stats.vol * 100).toFixed(1)}%`} />
              <Row label="VaR 95% (daily)" value={`${(stats.var95 * 100).toFixed(2)}%`} tone="bad" />
              <Row label="Beta vs FTSE MIB" value={stats.beta != null ? stats.beta.toFixed(2) : "—"} />
            </>
          ) : (
            <p className="text-muted-foreground">Loading…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Italian capital gains estimate</CardTitle>
          <CardDescription>26% on unrealized gains (if sold today)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row label="Unrealized gain" value={`€${cgt.gain.toFixed(2)}`} tone={cgt.gain >= 0 ? "good" : "bad"} />
          <Row label="Tax (26%)" value={`€${cgt.tax.toFixed(2)}`} tone="bad" />
          <Row label="Net after tax" value={`€${cgt.net.toFixed(2)}`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Market exposure</CardTitle>
          <CardDescription>Allocation by market</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {sectorExposure.map(([s, w]) => (
            <div key={s} className="flex items-center gap-2">
              <span className="w-32 truncate">{s}</span>
              <div className="flex-1 h-2 bg-muted rounded">
                <div className="h-2 bg-primary rounded" style={{ width: `${w * 100}%` }} />
              </div>
              <span className="font-mono text-xs w-12 text-right">{(w * 100).toFixed(1)}%</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {corrMatrix && holdings.length > 1 && (
        <Card className="md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Correlation matrix</CardTitle>
            <CardDescription>1Y daily returns — high correlation = concentration risk</CardDescription>
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
                          <td key={j} className={`px-2 py-1 font-mono text-center ${c}`}>
                            {v.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Red = highly correlated holdings (you're over-concentrated). Green = diversifying.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const Row = ({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) => (
  <div className="flex justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-mono font-semibold ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}>{value}</span>
  </div>
);