import { useEffect, useMemo, useState } from "react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, LineChart as LineIcon, RefreshCw, Users } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { HEDGE_FUND_FILERS } from "@/data/hedgeFundFilers";
import { useHistoricalPrices, type HistoryRange } from "@/hooks/useHistoricalPrices";

interface Holding {
  name: string; cusip: string; ticker?: string | null;
  value: number; shares: number; putCall?: string | null; pct?: number;
}
interface FilingResult {
  cik: string; filerName: string; accession: string; filingDate: string;
  totalValue: number; holdingsCount: number; holdings: Holding[];
}

function fmtB(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "-";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtPct(v: number | null | undefined, d = 1) {
  if (v == null || !Number.isFinite(v)) return "-";
  return `${(v * 100).toFixed(d)}%`;
}

export default function HedgeFundReplicator() {
  const [cik, setCik] = useState(HEDGE_FUND_FILERS[0].cik);
  const [customCik, setCustomCik] = useState("");
  const [filing, setFiling] = useState<FilingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resolvingCusips, setResolvingCusips] = useState(false);
  const [tickerMap, setTickerMap] = useState<Record<string, string | null>>({});
  const [benchmark, setBenchmark] = useState("SPY");
  const [range, setRange] = useState<HistoryRange>("1Y");

  const load = async (targetCik: string) => {
    if (!targetCik) return;
    setLoading(true); setErr(null); setFiling(null); setTickerMap({});
    try {
      const { data, error } = await supabase.functions.invoke("thirteen-f", { body: { action: "holdings", cik: targetCik } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setFiling(data as FilingResult);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load 13F");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(cik); /* eslint-disable-next-line */ }, [cik]);

  // Resolve CUSIPs for top-25 holdings so we can chart and factor-analyze them.
  useEffect(() => {
    if (!filing) return;
    const cusips = filing.holdings.slice(0, 25).map(h => h.cusip).filter(Boolean);
    if (!cusips.length) return;
    let active = true;
    setResolvingCusips(true);
    supabase.functions.invoke("thirteen-f", { body: { action: "resolve_cusips", cusips } })
      .then(({ data }) => { if (active && data?.map) setTickerMap(data.map); })
      .finally(() => { if (active) setResolvingCusips(false); });
    return () => { active = false; };
  }, [filing]);

  const enrichedTop = useMemo(() => {
    if (!filing) return [] as Array<Holding & { ticker: string | null }>;
    return filing.holdings.slice(0, 25).map(h => ({ ...h, ticker: tickerMap[h.cusip] ?? h.ticker ?? null }));
  }, [filing, tickerMap]);

  const resolvedSymbols = useMemo(() =>
    enrichedTop.map(h => h.ticker).filter((s): s is string => !!s).slice(0, 12),
  [enrichedTop]);

  const resolvedWeights = useMemo(() => {
    const rows = enrichedTop.filter(h => h.ticker).slice(0, 12);
    const total = rows.reduce((s, h) => s + h.value, 0) || 1;
    return Object.fromEntries(rows.map(h => [h.ticker!, h.value / total])) as Record<string, number>;
  }, [enrichedTop]);

  const priceSymbols = useMemo(() => Array.from(new Set([...resolvedSymbols, benchmark])), [resolvedSymbols, benchmark]);
  const { data: prices, loading: pricesLoading } = useHistoricalPrices(priceSymbols, range);

  const replicaSeries = useMemo(() => {
    if (!prices || Object.keys(prices).length === 0) return [];
    const bench = prices[benchmark] ?? [];
    if (!bench.length) return [];
    // Align on benchmark timeline
    const rows = bench.map((b, idx) => {
      let repVal = 0; let hasAny = false;
      for (const s of resolvedSymbols) {
        const bars = prices[s]; if (!bars?.length) continue;
        const p = bars[Math.min(idx, bars.length - 1)]; const p0 = bars[0];
        if (!p || !p0 || p0.close <= 0) continue;
        repVal += (resolvedWeights[s] ?? 0) * (p.close / p0.close);
        hasAny = true;
      }
      const benchVal = b.close / bench[0].close;
      return {
        t: new Date(b.t).toISOString().slice(0, 10),
        Replica: hasAny ? Number((repVal * 100 - 100).toFixed(2)) : null,
        [benchmark]: Number((benchVal * 100 - 100).toFixed(2)),
      };
    });
    return rows;
  }, [prices, benchmark, resolvedSymbols, resolvedWeights]);

  const trailingReturns = useMemo(() => {
    if (!replicaSeries.length) return null;
    const last = replicaSeries[replicaSeries.length - 1];
    return {
      replica: (last as any).Replica as number | null,
      bench: (last as any)[benchmark] as number | null,
    };
  }, [replicaSeries, benchmark]);

  // Simple concentration / factor proxies from the raw 13F table
  const stats = useMemo(() => {
    if (!filing) return null;
    const top10 = filing.holdings.slice(0, 10).reduce((s, h) => s + (h.pct ?? 0), 0);
    const putCalls = filing.holdings.filter(h => h.putCall).length;
    return { top10, positions: filing.holdingsCount, putCalls };
  }, [filing]);

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO
        title="13F Hedge Fund Replicator | Vela.ai"
        description="Recreate institutional portfolios from the latest SEC 13F filings. Inspect holdings, concentration, and benchmark-adjusted returns for top hedge funds."
        path="/replicate"
      />
      <PageHeader
        icon={Users}
        title="13F Hedge Fund Replicator"
        description="Ingest the latest 13F-HR filing from SEC EDGAR, size an equal-value replica, and benchmark it against an index."
      />

      <div className="flex flex-wrap gap-3 items-end">
        <div className="min-w-[240px]">
          <label className="text-xs text-muted-foreground">Filer</label>
          <Select value={cik} onValueChange={setCik}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-[400px]">
              {HEDGE_FUND_FILERS.map(f => (
                <SelectItem key={f.cik} value={f.cik}>
                  <span className="font-medium">{f.name}</span>
                  <span className="text-muted-foreground text-xs"> · {f.manager}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Custom CIK</label>
          <div className="flex gap-2">
            <Input value={customCik} onChange={(e) => setCustomCik(e.target.value.replace(/\D/g, ""))} className="w-32" placeholder="e.g. 1067983" />
            <Button variant="outline" size="sm" onClick={() => customCik && setCik(customCik)}>Load</Button>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Benchmark</label>
          <Input value={benchmark} onChange={(e) => setBenchmark(e.target.value.toUpperCase())} className="w-28" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Range</label>
          <Select value={range} onValueChange={(v) => setRange(v as HistoryRange)}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["1M", "3M", "6M", "1Y", "YTD"] as HistoryRange[]).map(r => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(cik)} disabled={loading} className="gap-2 mt-4">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Reload
        </Button>
      </div>

      {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Fetching latest 13F from SEC EDGAR…</div>}
      {err && <div className="text-sm text-destructive">{err}</div>}

      {filing && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardDescription>Filer</CardDescription><CardTitle className="text-base">{filing.filerName || "-"}</CardTitle></CardHeader>
              <CardContent className="text-xs text-muted-foreground">Filed {filing.filingDate} · Acc {filing.accession.slice(-8)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Portfolio value</CardDescription><CardTitle className="text-2xl font-mono">{fmtB(filing.totalValue)}</CardTitle></CardHeader>
              <CardContent className="text-xs text-muted-foreground">{filing.holdingsCount} positions</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Top-10 concentration</CardDescription><CardTitle className="text-2xl font-mono">{fmtPct(stats?.top10)}</CardTitle></CardHeader>
              <CardContent className="text-xs text-muted-foreground">Higher = more concentrated bets</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Options overlay</CardDescription><CardTitle className="text-2xl font-mono">{stats?.putCalls ?? 0}</CardTitle></CardHeader>
              <CardContent className="text-xs text-muted-foreground">Put/Call positions in filing</CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><LineIcon className="h-4 w-4" /> Replica vs {benchmark}</CardTitle>
              <CardDescription>
                Equal-value replica of the top-{resolvedSymbols.length} resolved US equity positions, held statically over the selected range.
                {resolvingCusips && <span className="ml-2 inline-flex items-center gap-1 text-xs"><Loader2 className="h-3 w-3 animate-spin" /> resolving CUSIPs…</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[320px]">
              {pricesLoading && !replicaSeries.length ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading price history…</div>
              ) : replicaSeries.length === 0 ? (
                <div className="text-sm text-muted-foreground">Waiting on resolved tickers to build the replica series.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={replicaSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={40} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v: number) => `${v?.toFixed?.(1) ?? v}%`} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="Replica" stroke="hsl(215 65% 55%)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey={benchmark} stroke="hsl(142 55% 45%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
            {trailingReturns && trailingReturns.replica != null && trailingReturns.bench != null && (
              <CardContent className="pt-0 flex gap-3 text-xs">
                <Badge variant="outline">Replica {trailingReturns.replica >= 0 ? "+" : ""}{trailingReturns.replica.toFixed(1)}%</Badge>
                <Badge variant="outline">{benchmark} {trailingReturns.bench >= 0 ? "+" : ""}{trailingReturns.bench.toFixed(1)}%</Badge>
                <Badge variant={trailingReturns.replica >= trailingReturns.bench ? "default" : "destructive"}>
                  Alpha {(trailingReturns.replica - trailingReturns.bench).toFixed(1)}pp
                </Badge>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top-25 holdings</CardTitle>
              <CardDescription>Source: SEC EDGAR 13F-HR information table. Values as reported.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left py-2 font-medium">#</th>
                    <th className="text-left py-2 font-medium">Issuer</th>
                    <th className="text-left py-2 font-medium">Ticker</th>
                    <th className="text-left py-2 font-medium">CUSIP</th>
                    <th className="text-right py-2 font-medium">Value</th>
                    <th className="text-right py-2 font-medium">Weight</th>
                    <th className="text-right py-2 font-medium">Shares</th>
                  </tr>
                </thead>
                <tbody>
                  {enrichedTop.map((h, i) => (
                    <tr key={h.cusip + i} className="border-b last:border-0">
                      <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5">{h.name}{h.putCall ? <Badge variant="outline" className="ml-2 text-[9px]">{h.putCall}</Badge> : null}</td>
                      <td className="py-1.5 font-mono">{h.ticker ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-1.5 font-mono text-xs text-muted-foreground">{h.cusip}</td>
                      <td className="py-1.5 text-right font-mono">{fmtB(h.value)}</td>
                      <td className="py-1.5 text-right font-mono">{fmtPct(h.pct)}</td>
                      <td className="py-1.5 text-right font-mono">{h.shares.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-muted-foreground mt-3">
                13F filings are lagged up to 45 days after quarter-end and cover long US equity positions only — short books, non-US listings, and derivatives outside puts/calls are not disclosed. Replica performance is illustrative, not a forecast.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}