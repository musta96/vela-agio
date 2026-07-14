import { useEffect, useMemo, useState } from "react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Repeat } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import {
  computeBuybackImpact, projectBuybacks, fmtMoney, fmtShares, fmtPct,
  type BuybackYear,
} from "@/lib/buybacks/model";
import { supabase } from "@/integrations/supabase/client";

function num(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v?.raw === "number") return v.raw;
  return null;
}

export default function BuybackAnalyzer() {
  const [input, setInput] = useState("AAPL");
  const [symbol, setSymbol] = useState("AAPL");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  // Scenario inputs
  const [annualBuyback, setAnnualBuyback] = useState<number | null>(null);
  const [horizon, setHorizon] = useState(5);
  const [niGrowth, setNiGrowth] = useState(5);        // %
  const [priceGrowth, setPriceGrowth] = useState(3);  // %

  useEffect(() => {
    if (!symbol) return;
    let active = true;
    setLoading(true); setErr(null);
    // Route through our edge function — Yahoo's public quoteSummary endpoint
    // now requires a crumb/cookie handshake and is not directly CORS-callable.
    supabase.functions
      .invoke("buyback-fundamentals", { body: { symbol } })
      .then(({ data: resp, error }) => {
        if (!active) return;
        if (error) { setErr("Failed to load fundamentals."); setLoading(false); return; }
        const q = (resp as any)?.result;
        if (!q) { setErr("Not covered for this symbol."); setLoading(false); return; }
        setData(q); setLoading(false);
      })
      .catch(() => { if (active) { setErr("Failed to load fundamentals."); setLoading(false); } });
    return () => { active = false; };
  }, [symbol]);

  const parsed = useMemo(() => {
    if (!data) return null;
    const cf = data.cashflowStatementHistory?.cashflowStatements ?? [];
    const inc = data.incomeStatementHistory?.incomeStatementHistory ?? [];
    const ks = data.defaultKeyStatistics ?? {};
    const sd = data.summaryDetail ?? {};
    const price = data.price ?? {};
    const fd = data.financialData ?? {};

    const rows: BuybackYear[] = cf.slice(0, 5).map((c: any, i: number) => {
      const iRow = inc[i] ?? {};
      const spend = num(c.repurchaseOfStock);
      const dividends = num(c.dividendsPaid);
      const ni = num(iRow.netIncome);
      // Yahoo doesn't always give avg diluted; approximate via basicEPS if present.
      const eps = num(iRow.basicEPS) ?? num(iRow.dilutedEPS);
      const diluted = eps && ni ? ni / eps : null;
      return {
        year: c.endDate?.fmt?.slice(0, 4) ?? "-",
        buybackSpend: spend != null ? Math.abs(spend) : null,
        dividendSpend: dividends != null ? Math.abs(dividends) : null,
        netIncome: ni,
        dilutedShares: diluted,
        eps,
      };
    }).reverse();

    const currentShares = num(ks.sharesOutstanding) ?? num(price.sharesOutstanding);
    const marketCap = num(price.marketCap) ?? num(sd.marketCap);
    const pxNow = num(price.regularMarketPrice) ?? num(fd.currentPrice);
    const niLatest = rows.length ? rows[rows.length - 1].netIncome : null;
    const trailingPE = num(sd.trailingPE) ?? (pxNow && niLatest && currentShares ? pxNow / (niLatest / currentShares) : null);

    // 5-yr share count trend from EPS-derived diluted shares
    const sharesFirst = rows.find(r => r.dilutedShares)?.dilutedShares ?? null;
    const sharesLast = [...rows].reverse().find(r => r.dilutedShares)?.dilutedShares ?? null;
    const shareReductionPct = sharesFirst && sharesLast && sharesFirst !== 0
      ? (sharesFirst - sharesLast) / sharesFirst
      : null;
    const totalBuybacks = rows.reduce((s, r) => s + (r.buybackSpend ?? 0), 0);
    const totalDividends = rows.reduce((s, r) => s + (r.dividendSpend ?? 0), 0);
    const avgAnnualBuyback = rows.length ? totalBuybacks / rows.length : 0;

    return {
      rows, currentShares, marketCap, pxNow, niLatest, trailingPE,
      shareReductionPct, totalBuybacks, totalDividends, avgAnnualBuyback,
      companyName: price.longName || price.shortName || symbol,
    };
  }, [data, symbol]);

  // Default scenario buyback = trailing average
  useEffect(() => {
    if (parsed && annualBuyback == null && parsed.avgAnnualBuyback > 0) {
      setAnnualBuyback(Math.round(parsed.avgAnnualBuyback));
    }
  }, [parsed]); // eslint-disable-line react-hooks/exhaustive-deps

  const oneShot = useMemo(() => {
    if (!parsed) return null;
    return computeBuybackImpact({
      netIncome: parsed.niLatest,
      sharesOutstanding: parsed.currentShares,
      price: parsed.pxNow,
      marketCap: parsed.marketCap,
      buybackSpend: annualBuyback,
    });
  }, [parsed, annualBuyback]);

  const projection = useMemo(() => {
    if (!parsed || !parsed.currentShares || !parsed.niLatest || !parsed.pxNow) return [];
    return projectBuybacks({
      years: horizon,
      startShares: parsed.currentShares,
      startNetIncome: parsed.niLatest,
      startPrice: parsed.pxNow,
      annualBuybackSpend: annualBuyback ?? 0,
      niGrowthPct: niGrowth / 100,
      priceGrowthPct: priceGrowth / 100,
    });
  }, [parsed, annualBuyback, horizon, niGrowth, priceGrowth]);

  const noBuybackProjection = useMemo(() => {
    if (!parsed || !parsed.currentShares || !parsed.niLatest || !parsed.pxNow) return [];
    return projectBuybacks({
      years: horizon,
      startShares: parsed.currentShares,
      startNetIncome: parsed.niLatest,
      startPrice: parsed.pxNow,
      annualBuybackSpend: 0,
      niGrowthPct: niGrowth / 100,
      priceGrowthPct: priceGrowth / 100,
    });
  }, [parsed, horizon, niGrowth, priceGrowth]);

  const chartData = useMemo(() => {
    return projection.map((r, i) => ({
      year: `Y${r.year}`,
      "With buybacks EPS": Number(r.eps.toFixed(3)),
      "No buybacks EPS": Number((noBuybackProjection[i]?.eps ?? r.eps).toFixed(3)),
      "With buybacks Price": Number(r.price.toFixed(2)),
      "No buybacks Price": Number((noBuybackProjection[i]?.price ?? r.price).toFixed(2)),
    }));
  }, [projection, noBuybackProjection]);

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO
        title="Share Buyback Analyzer | Vela.ai"
        description="Analyze how share repurchases affect EPS, share count, and forward returns. Compare buyback vs no-buyback scenarios with adjustable growth and horizon assumptions."
        path="/buybacks"
      />
      <PageHeader
        icon={Repeat}
        title="Share Buyback Analyzer"
        description="Model the EPS accretion, share-count trajectory, and forward return impact of corporate buybacks."
      />

      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Ticker</Label>
          <Input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} className="w-40" />
        </div>
        <Button onClick={() => setSymbol(input.trim())} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Load
        </Button>
      </div>

      {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading fundamentals…</div>}
      {err && <div className="text-sm text-destructive">{err}</div>}

      {parsed && !loading && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardDescription>5-yr buybacks</CardDescription><CardTitle className="text-2xl font-mono">{fmtMoney(parsed.totalBuybacks)}</CardTitle></CardHeader>
              <CardContent className="text-xs text-muted-foreground">Avg {fmtMoney(parsed.avgAnnualBuyback)}/yr</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>5-yr dividends</CardDescription><CardTitle className="text-2xl font-mono">{fmtMoney(parsed.totalDividends)}</CardTitle></CardHeader>
              <CardContent className="text-xs text-muted-foreground">Total capital returned {fmtMoney(parsed.totalBuybacks + parsed.totalDividends)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Share count change</CardDescription><CardTitle className="text-2xl font-mono">{fmtPct(parsed.shareReductionPct != null ? -parsed.shareReductionPct : null, 1)}</CardTitle></CardHeader>
              <CardContent className="text-xs text-muted-foreground">Over available 5-yr window</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Buyback yield (TTM)</CardDescription><CardTitle className="text-2xl font-mono">
              {fmtPct(parsed.rows[parsed.rows.length - 1]?.buybackSpend != null && parsed.marketCap ? (parsed.rows[parsed.rows.length - 1].buybackSpend! / parsed.marketCap) : null, 2)}
            </CardTitle></CardHeader>
              <CardContent className="text-xs text-muted-foreground">Latest FY spend / market cap</CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historical buybacks & dividends</CardTitle>
              <CardDescription>USD outflows by fiscal year — {parsed.companyName}.</CardDescription>
            </CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={parsed.rows.map(r => ({ year: r.year, Buybacks: (r.buybackSpend ?? 0) / 1e9, Dividends: (r.dividendSpend ?? 0) / 1e9 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}B`} />
                  <Tooltip formatter={(v: number) => `$${v.toFixed(2)}B`} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Buybacks" fill="hsl(215 65% 55%)" />
                  <Bar dataKey="Dividends" fill="hsl(142 55% 45%)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scenario inputs</CardTitle>
                <CardDescription>Adjust annual spend and growth to test forward impact.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <Label>Annual buyback spend</Label>
                    <span className="font-mono">{fmtMoney(annualBuyback ?? 0)}</span>
                  </div>
                  <Slider
                    value={[annualBuyback ?? 0]}
                    min={0}
                    max={Math.max((parsed.avgAnnualBuyback || 1e9) * 3, 1e10)}
                    step={1e8}
                    onValueChange={(v) => setAnnualBuyback(v[0])}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs"><Label>Horizon</Label><span className="font-mono">{horizon} yrs</span></div>
                  <Slider value={[horizon]} min={1} max={10} step={1} onValueChange={(v) => setHorizon(v[0])} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs"><Label>Net income growth</Label><span className="font-mono">{niGrowth}%</span></div>
                  <Slider value={[niGrowth]} min={-10} max={25} step={1} onValueChange={(v) => setNiGrowth(v[0])} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs"><Label>Organic price growth</Label><span className="font-mono">{priceGrowth}%</span></div>
                  <Slider value={[priceGrowth]} min={-10} max={20} step={1} onValueChange={(v) => setPriceGrowth(v[0])} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">One-year EPS accretion</CardTitle>
                <CardDescription>Impact of a single year of buybacks at current price.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {oneShot ? (
                  <>
                    <Row k="Reference price" v={fmtMoney(oneShot.refPrice)} />
                    <Row k="Shares retired" v={fmtShares(oneShot.sharesRetired)} />
                    <Row k="Shares outstanding after" v={fmtShares(oneShot.newShares)} />
                    <Row k="EPS before" v={oneShot.currentEps != null ? `$${oneShot.currentEps.toFixed(2)}` : "-"} />
                    <Row k="EPS after" v={oneShot.newEps != null ? `$${oneShot.newEps.toFixed(2)}` : "-"} />
                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <span className="text-muted-foreground">EPS accretion</span>
                      <Badge variant={oneShot.epsDeltaPct && oneShot.epsDeltaPct > 0 ? "default" : "outline"} className="text-[11px]">{fmtPct(oneShot.epsDeltaPct)}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Buyback yield</span>
                      <span className="font-mono">{fmtPct(oneShot.buybackYieldPct)}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Set an annual buyback spend to model accretion.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Forward projection — EPS & price</CardTitle>
              <CardDescription>Assumes constant P/E; holds all other capital-return channels flat. Educational scenario, not a forecast.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2 h-auto">
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="With buybacks EPS" stroke="hsl(215 65% 55%)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="No buybacks EPS" stroke="hsl(0 0% 55%)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="With buybacks Price" stroke="hsl(142 55% 45%)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="No buybacks Price" stroke="hsl(0 0% 55%)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Projection table</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left py-2 font-medium">Year</th>
                    <th className="text-right py-2 font-medium">Shares</th>
                    <th className="text-right py-2 font-medium">Net income</th>
                    <th className="text-right py-2 font-medium">EPS</th>
                    <th className="text-right py-2 font-medium">Price</th>
                    <th className="text-right py-2 font-medium">Cum. return</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.map((r) => (
                    <tr key={r.year} className="border-b last:border-0">
                      <td className="py-1.5">Y{r.year}</td>
                      <td className="text-right font-mono">{fmtShares(r.shares)}</td>
                      <td className="text-right font-mono">{fmtMoney(r.netIncome)}</td>
                      <td className="text-right font-mono">${r.eps.toFixed(2)}</td>
                      <td className="text-right font-mono">${r.price.toFixed(2)}</td>
                      <td className="text-right font-mono">{fmtPct(r.totalReturnPct, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-muted-foreground mt-3">
                Source: Yahoo Finance filings. Projections are deterministic scenarios — not investment advice. Actual buyback timing, price, and dilution from equity comp will affect results.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 pb-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}