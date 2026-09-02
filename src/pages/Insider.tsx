import { useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TickerSearch } from "@/components/TickerSearch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, ExternalLink, Loader2, TrendingUp, TrendingDown, ShoppingCart,
  Banknote, Activity, Gauge,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, CartesianGrid,
  LineChart, Line, ReferenceDot, Legend,
} from "recharts";

interface Tx {
  filedAt: string;
  date: string;
  code: string;
  shares: number;
  price: number;
  value: number;
  acquired: boolean;
  insider: string;
  role: string;
  isDirector?: boolean;
  isOfficer?: boolean;
  isTenPct?: boolean;
  url: string;
  accession: string;
}

const fmtMoney = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${n < 0 ? "-" : ""}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${n < 0 ? "-" : ""}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${n < 0 ? "-" : ""}$${(abs / 1e3).toFixed(1)}K`;
  return `${n < 0 ? "-" : ""}$${abs.toFixed(0)}`;
};
const fmtNum = (n: number) => new Intl.NumberFormat().format(Math.round(n));
const daysBetween = (a: string, b: string) => Math.round((+new Date(b) - +new Date(a)) / 86400000);

export default function Insider() {
  const [symbol, setSymbol] = useState("AAPL");
  const [loading, setLoading] = useState(false);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [bars, setBars] = useState<Array<{ t: number; close: number }>>([]);
  const [name, setName] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [tx, ohlc] = await Promise.all([
        supabase.functions.invoke("sec-edgar", { body: { symbol, kind: "insider_tx" } }),
        supabase.functions.invoke("market-data", { body: { action: "ohlc", symbol, range: "1y", interval: "1d" } }),
      ]);
      if (tx.error) throw tx.error;
      setTxs((tx.data?.transactions ?? []) as Tx[]);
      setName(tx.data?.name ?? "");
      setBars((ohlc.data?.bars ?? []) as Array<{ t: number; close: number }>);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load insider data");
      setTxs([]);
      setBars([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // ---- Analytics ----
  const stats = useMemo(() => {
    const today = new Date();
    const cutoff = (d: number) => new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10);
    const c90 = cutoff(90);
    const c30 = cutoff(30);
    const in90 = txs.filter((t) => t.date >= c90);
    const in30 = txs.filter((t) => t.date >= c30);
    const buys90 = in90.filter((t) => t.acquired && t.code === "P");
    const sells90 = in90.filter((t) => !t.acquired && t.code === "S");
    const buyVal90 = buys90.reduce((s, t) => s + t.value, 0);
    const sellVal90 = sells90.reduce((s, t) => s + t.value, 0);
    const netVal90 = buyVal90 - sellVal90;
    const uniqueBuyers90 = new Set(buys90.map((t) => t.insider)).size;
    const uniqueSellers90 = new Set(sells90.map((t) => t.insider)).size;
    const cluster = uniqueBuyers90 >= 3;
    // Signal score: -100..+100. Buy $ vs sell $ ratio, boosted by unique buyers.
    const denom = buyVal90 + sellVal90;
    const bias = denom > 0 ? ((buyVal90 - sellVal90) / denom) * 100 : 0;
    const clusterBoost = Math.min(20, uniqueBuyers90 * 4) - Math.min(10, uniqueSellers90 * 2);
    const score = Math.max(-100, Math.min(100, bias + clusterBoost));
    return {
      buys90: buys90.length, sells90: sells90.length,
      buyVal90, sellVal90, netVal90,
      uniqueBuyers90, uniqueSellers90, cluster,
      score, in30, in90,
    };
  }, [txs]);

  // Monthly net $ chart
  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; buys: number; sells: number; net: number }>();
    for (const t of txs) {
      const m = t.date.slice(0, 7);
      const row = map.get(m) ?? { month: m, buys: 0, sells: 0, net: 0 };
      if (t.acquired && t.code === "P") row.buys += t.value;
      else if (!t.acquired && t.code === "S") row.sells += t.value;
      row.net = row.buys - row.sells;
      map.set(m, row);
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [txs]);

  // Price series with buy markers
  const priceSeries = useMemo(() => bars.map((b) => ({ t: b.t, date: new Date(b.t).toISOString().slice(0, 10), close: b.close })), [bars]);
  const priceByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of priceSeries) m.set(p.date, p.close);
    return m;
  }, [priceSeries]);

  // Performance-after-buy attribution
  const perf = useMemo(() => {
    if (priceSeries.length === 0) return [];
    const buys = txs.filter((t) => t.acquired && t.code === "P");
    const nearestPrice = (dateISO: string): number | null => {
      // find first bar >= date
      const t0 = +new Date(dateISO);
      const b = bars.find((x) => x.t >= t0);
      return b ? b.close : null;
    };
    const nAfter = (dateISO: string, days: number): number | null => {
      const target = +new Date(dateISO) + days * 86400000;
      const b = bars.find((x) => x.t >= target);
      return b ? b.close : null;
    };
    return buys.map((t) => {
      const p0 = nearestPrice(t.date) ?? t.price;
      const p30 = nAfter(t.date, 30);
      const p60 = nAfter(t.date, 60);
      const p90 = nAfter(t.date, 90);
      const ret = (p: number | null) => p && p0 ? ((p - p0) / p0) * 100 : null;
      return { ...t, p0, r30: ret(p30), r60: ret(p60), r90: ret(p90) };
    });
  }, [txs, bars, priceSeries.length]);

  const buyMarkers = useMemo(() => {
    const out: Array<{ date: string; t: number; close: number }> = [];
    for (const p of perf) {
      const px = priceByDate.get(p.date);
      if (px) out.push({ date: p.date, t: +new Date(p.date), close: px });
    }
    return out;
  }, [perf, priceByDate]);

  const avgR30 = useMemo(() => {
    const xs = perf.map((p) => p.r30).filter((x): x is number => x != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  }, [perf]);
  const avgR90 = useMemo(() => {
    const xs = perf.map((p) => p.r90).filter((x): x is number => x != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  }, [perf]);

  const scoreLabel = stats.score > 25 ? "Bullish" : stats.score < -25 ? "Bearish" : "Neutral";
  const scoreColor = stats.score > 25 ? "text-success" : stats.score < -25 ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Insider Trading Signal Dashboard | Vela.ai" description="Analyze insider buying trends, executive transactions, cluster buys, and post-purchase stock performance from SEC Form 4 filings." path="/insider" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center ring-1 ring-primary/20">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Insider Trading Signal Dashboard</h1>
              <p className="text-sm text-muted-foreground">SEC Form 4 buys & sells, cluster detection, and post-purchase performance.</p>
            </div>
          </div>
          <div className="flex gap-2 max-w-sm items-end">
            <div className="flex-1"><TickerSearch value={symbol} onValueChange={setSymbol} onSelect={(hit) => setSymbol(hit.symbol.toUpperCase())} placeholder="Search instrument" /></div>
            <Button onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load"}
            </Button>
          </div>
        </div>

        {name && <div className="text-sm text-muted-foreground">{name} • {txs.length} transactions in the last ~12 months</div>}
        {err && <Card><CardContent className="p-4 text-sm text-destructive">{err}</CardContent></Card>}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Net Insider $ (90d)</span>
              <Banknote className="h-4 w-4 text-primary" />
            </div>
            <div className={`text-2xl font-bold ${stats.netVal90 > 0 ? "text-success" : stats.netVal90 < 0 ? "text-destructive" : ""}`}>{fmtMoney(stats.netVal90)}</div>
            <div className="text-xs text-muted-foreground mt-1">Buys {fmtMoney(stats.buyVal90)} · Sells {fmtMoney(stats.sellVal90)}</div>
          </CardContent></Card>

          <Card><CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Transactions (90d)</span>
              <ShoppingCart className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold">{stats.buys90 + stats.sells90}</div>
            <div className="text-xs text-muted-foreground mt-1">
              <span className="text-success">{stats.buys90} buys</span> · <span className="text-destructive">{stats.sells90} sells</span>
            </div>
          </CardContent></Card>

          <Card><CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Cluster Buy</span>
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold">{stats.uniqueBuyers90} <span className="text-sm font-normal text-muted-foreground">insiders</span></div>
            <div className="text-xs mt-1">
              {stats.cluster
                ? <Badge className="bg-success/15 text-success hover:bg-success/20">Cluster detected</Badge>
                : <span className="text-muted-foreground">No cluster (≥3 required)</span>}
            </div>
          </CardContent></Card>

          <Card><CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Signal</span>
              <Gauge className="h-4 w-4 text-primary" />
            </div>
            <div className={`text-2xl font-bold ${scoreColor}`}>{scoreLabel}</div>
            <div className="text-xs text-muted-foreground mt-1">Score {stats.score.toFixed(0)} / 100</div>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Monthly Net Insider Flow</CardTitle></CardHeader>
              <CardContent className="h-72">
                {monthly.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No Form 4 transactions parsed.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => fmtMoney(v as number)} />
                      <ReTooltip formatter={(v: any) => fmtMoney(Number(v))} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                      <Legend />
                      <Bar dataKey="buys" name="Buys $" fill="hsl(var(--success))" />
                      <Bar dataKey="sells" name="Sells $" fill="hsl(var(--destructive))" />
                      <Bar dataKey="net" name="Net $" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions">
            <Card>
              <CardHeader><CardTitle className="text-base">Insider Transactions</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {txs.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No transactions.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Insider</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Shares</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {txs.slice(0, 200).map((t, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{t.date}</TableCell>
                          <TableCell className="max-w-[220px] truncate">{t.insider}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{t.role}</TableCell>
                          <TableCell>
                            {t.acquired && t.code === "P" ? (
                              <Badge className="bg-success/15 text-success hover:bg-success/20"><TrendingUp className="h-3 w-3 mr-1" />Buy</Badge>
                            ) : !t.acquired && t.code === "S" ? (
                              <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/20"><TrendingDown className="h-3 w-3 mr-1" />Sell</Badge>
                            ) : (
                              <Badge variant="outline">{t.code || "—"}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">{fmtNum(t.shares)}</TableCell>
                          <TableCell className="text-right font-mono">{t.price ? `$${t.price.toFixed(2)}` : "—"}</TableCell>
                          <TableCell className="text-right font-mono">{t.value ? fmtMoney(t.value) : "—"}</TableCell>
                          <TableCell>
                            <a href={t.url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs inline-flex items-center gap-1">
                              Form 4 <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card><CardContent className="p-5">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Avg 30d return after insider buy</div>
                <div className={`text-2xl font-bold ${avgR30 == null ? "" : avgR30 > 0 ? "text-success" : "text-destructive"}`}>
                  {avgR30 == null ? "—" : `${avgR30 > 0 ? "+" : ""}${avgR30.toFixed(2)}%`}
                </div>
              </CardContent></Card>
              <Card><CardContent className="p-5">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Avg 90d return after insider buy</div>
                <div className={`text-2xl font-bold ${avgR90 == null ? "" : avgR90 > 0 ? "text-success" : "text-destructive"}`}>
                  {avgR90 == null ? "—" : `${avgR90 > 0 ? "+" : ""}${avgR90.toFixed(2)}%`}
                </div>
              </CardContent></Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Price with Insider Buy Markers</CardTitle></CardHeader>
              <CardContent className="h-80">
                {priceSeries.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No price data.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={priceSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} minTickGap={40} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} domain={["auto", "auto"]} />
                      <ReTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                      <Line type="monotone" dataKey="close" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                      {buyMarkers.map((m, i) => (
                        <ReferenceDot key={i} x={m.date} y={m.close} r={4} fill="hsl(var(--success))" stroke="hsl(var(--background))" strokeWidth={1} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Return After Insider Buys</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {perf.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No insider buys to attribute.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Insider</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">+30d</TableHead>
                        <TableHead className="text-right">+60d</TableHead>
                        <TableHead className="text-right">+90d</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {perf.slice(0, 50).map((p, i) => {
                        const cell = (v: number | null) => v == null ? <span className="text-muted-foreground">—</span> : (
                          <span className={v > 0 ? "text-success" : v < 0 ? "text-destructive" : ""}>{v > 0 ? "+" : ""}{v.toFixed(2)}%</span>
                        );
                        return (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{p.date}</TableCell>
                            <TableCell className="max-w-[240px] truncate">{p.insider}</TableCell>
                            <TableCell className="text-right font-mono">{fmtMoney(p.value)}</TableCell>
                            <TableCell className="text-right font-mono">{cell(p.r30)}</TableCell>
                            <TableCell className="text-right font-mono">{cell(p.r60)}</TableCell>
                            <TableCell className="text-right font-mono">{cell(p.r90)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}