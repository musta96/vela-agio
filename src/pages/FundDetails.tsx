import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, Lock, TrendingDown, TrendingUp, Star } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useFundProfile } from "@/hooks/useFundProfile";
import { useOHLCHistory, compactAxisTick, type OHLCRange } from "@/hooks/useOHLCHistory";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { useWatchlist } from "@/hooks/useWatchlist";
import { FundRatingsCard } from "@/components/fund/FundRatingsCard";
import { FundAnalysisTab } from "@/components/fund/FundAnalysisTab";
import { FundGeographyCard } from "@/components/fund/FundGeographyCard";
import { AddToPortfolioButton } from "@/components/portfolio/AddToPortfolioButton";
import { PortfolioFitButton } from "@/components/portfolio/PortfolioFitButton";

const FUND_FEATURE = "fund.deep_data";

function pct(v: number | null | undefined, digits = 2) {
  if (v == null || !isFinite(v)) return "—";
  const scaled = Math.abs(v) <= 1.5 ? v * 100 : v;
  return `${scaled.toFixed(digits)}%`;
}
function rawPct(v: number | null | undefined, digits = 2) {
  if (v == null || !isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}
function money(v: number | null | undefined, currency?: string | null) {
  if (v == null || !isFinite(v)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "EUR", maximumFractionDigits: 4 }).format(v);
  } catch {
    return v.toFixed(2);
  }
}
function compact(v: number | null | undefined, currency?: string | null) {
  if (v == null || !isFinite(v)) return "—";
  const s = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(v);
  return currency ? `${s} ${currency}` : s;
}
function num(v: number | null | undefined, digits = 2) {
  return v == null || !isFinite(v) ? "—" : v.toFixed(digits);
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** Blurs a premium block and shows an inline upgrade CTA for Free users. */
function PremiumBlock({
  unlocked, title, onUpgrade, children,
}: { unlocked: boolean; title: string; onUpgrade: () => void; children: React.ReactNode }) {
  if (unlocked) return <>{children}</>;
  return (
    <div className="relative">
      <div className="pointer-events-none select-none" aria-hidden="true" style={{ filter: "blur(6px)", opacity: 0.5 }}>
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <Card className="max-w-md text-center">
          <CardHeader className="pb-2">
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>
              Available from the Plus plan: full holdings, breakdowns, multi-year performance vs category,
              risk statistics, cost comparison and distribution history.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={onUpgrade}>Unlock</Button>
            <Button size="sm" variant="outline" asChild><Link to="/plans-billing">Compare plans</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const FundDetails = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const sym = decodeURIComponent(symbol || "").toUpperCase();
  const { data, loading, error, reload } = useFundProfile(sym);
  const [range, setRange] = useState<OHLCRange>("1Y");
  const { bars } = useOHLCHistory(data?.symbol || sym || null, range);
  const gate = useFeatureGate();
  const { toggle, isWatched } = useWatchlist();

  const unlocked = !gate.entitlements.loading && gate.has(FUND_FEATURE);
  const requestUpgrade = () => gate.promptUpgrade(FUND_FEATURE);

  const currency = data?.currency ?? null;
  const kf = data?.keyFacts ?? {};
  const chartData = useMemo(
    () => bars.map((b) => ({ date: new Date(b.t).toISOString().slice(0, 10), close: b.close })),
    [bars],
  );
  const changePct = kf.changePercent ?? null;
  const up = (changePct ?? 0) >= 0;

  const notAFund = data?.error === "NOT_A_FUND";
  const noSource = data?.error === "NO_FUND_SOURCE";

  const title = data?.profile?.name ? `${data.profile.name} (${data.symbol})` : sym;

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${title} — ETF & fund data sheet`}
        description={`Key facts, holdings, sector and asset breakdown, performance vs category, risk statistics, costs and distributions for ${title}.`}
        path={`/fund/${encodeURIComponent(sym)}`}
      />
      <TopNav />
      <main className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {loading && !data ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error ? (
          <Card><CardContent className="flex items-center justify-between gap-4 py-6">
            <span className="text-sm text-muted-foreground">{error}</span>
            <Button size="sm" variant="outline" onClick={() => void reload()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
          </CardContent></Card>
        ) : notAFund ? (
          <Card><CardContent className="space-y-3 py-6">
            <p className="text-sm text-muted-foreground">{sym} is a listed company, not a fund.</p>
            <Button size="sm" asChild><Link to={`/stock/${encodeURIComponent(sym)}`}>Open the company data sheet</Link></Button>
          </CardContent></Card>
        ) : noSource ? (
          <Card><CardContent className="py-6 text-sm text-muted-foreground">
            {data?.message ?? "No data provider currently covers this fund."}
          </CardContent></Card>
        ) : data ? (
          <>
            {/* Header */}
            <Card>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="text-xl">{data.profile?.name ?? data.symbol}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-sm text-muted-foreground">
                      <Badge variant="secondary">{data.symbol}</Badge>
                      {data.isin ? <Badge variant="outline">ISIN {data.isin}</Badge> : null}
                      <Badge variant="outline">{data.quoteType === "ETF" ? "ETF" : "Fund"}</Badge>
                      {data.profile?.exchange ? <span className="text-xs">{data.profile.exchange}</span> : null}
                      {data.profile?.category ? <span className="text-xs">· {data.profile.category}</span> : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold tabular-nums">{money(kf.price, currency)}</div>
                    <div className={`flex items-center justify-end gap-1 text-sm ${up ? "text-emerald-500" : "text-destructive"}`}>
                      {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {rawPct(changePct)}
                    </div>
                    <div className="mt-2 flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => void reload()}><RefreshCw className="h-4 w-4" /></Button>
                      <Button size="sm" variant={isWatched(data.symbol) ? "default" : "outline"} onClick={() => toggle(data.symbol, data.profile?.name ?? data.symbol)}>
                        <Star className="mr-1 h-4 w-4" />{isWatched(data.symbol) ? "Watched" : "Watch"}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                <Fact label="Ongoing charge (TER)" value={pct(kf.ter)} />
                <Fact label="Fund size" value={compact(kf.totalAssets, currency ?? undefined)} />
                <Fact label="Distribution yield" value={pct(kf.yield)} />
                <Fact label="YTD return" value={pct(kf.ytdReturn)} />
                <Fact label="52-week range" value={`${money(kf.week52Low, currency)} – ${money(kf.week52High, currency)}`} />
                <Fact label="NAV" value={money(kf.nav, currency)} />
                <Fact label="Inception" value={data.profile?.inceptionDate ?? "—"} />
                <Fact label="Legal type" value={data.profile?.legalType ?? "—"} />
                <Fact label="Issuer" value={data.profile?.family ?? "—"} />
                <Fact label="Avg. volume" value={compact(kf.averageVolume)} />
                <Fact label="Beta (3y)" value={num(kf.beta3Year)} />
                <Fact label="Currency" value={currency ?? "—"} />
                <Fact label="ISIN" value={data.isin ?? "—"} />
                <Fact
                  label="Vela score"
                  value={data.velaScore?.finalScore != null ? `${data.velaScore.finalScore}/100` : "—"}
                  hint={data.velaScore?.grade ? `Grade ${data.velaScore.grade}` : undefined}
                />
                <Fact
                  label="Risk score"
                  value={data.velaScore?.riskScore != null ? `${data.velaScore.riskScore}/100` : "—"}
                  hint={data.velaScore?.riskLabel ?? undefined}
                />
              </CardContent>
            </Card>

            {/* Price chart */}
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Price history</CardTitle>
                <div className="flex gap-1">
                  {(["1M", "6M", "1Y", "5Y"] as OHLCRange[]).map((r) => (
                    <Button key={r} size="sm" variant={range === r ? "default" : "ghost"} onClick={() => setRange(r)}>{r}</Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="h-64">
                {chartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No price history available.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
                      <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} width={64} tickFormatter={(v) => compactAxisTick(Number(v))} />
                      <Tooltip formatter={(v: number) => money(v, currency)} />
                      <Area type="monotone" dataKey="close" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Tabs defaultValue="overview">
              <TabsList className="flex w-full flex-wrap justify-start">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="holdings">Holdings</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="risk">Risk</TabsTrigger>
                <TabsTrigger value="costs">Costs</TabsTrigger>
                <TabsTrigger value="distributions">Distributions</TabsTrigger>
              </TabsList>

              {/* OVERVIEW — free */}
              <TabsContent value="overview" className="space-y-4 pt-4">
                <FundRatingsCard data={data} />
                <Card>
                  <CardHeader><CardTitle className="text-base">Objective</CardTitle></CardHeader>
                  <CardContent className="text-sm leading-relaxed text-muted-foreground">
                    {data.profile?.description ?? "No objective description published for this fund."}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Top 5 holdings</CardTitle>
                    <CardDescription>Free preview — the full list is in the Holdings tab.</CardDescription></CardHeader>
                  <CardContent>
                    {(data.holdings?.top ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Holdings are not published for this fund.</p>
                    ) : (
                      <ul className="space-y-2">
                        {(data.holdings?.top ?? []).slice(0, 5).map((h) => (
                          <li key={`${h.symbol}-${h.name}`} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate">{h.name ?? h.symbol}</span>
                            <span className="tabular-nums text-muted-foreground">{pct(h.weight)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* HOLDINGS — premium */}
              <TabsContent value="holdings" className="space-y-4 pt-4">
                <PremiumBlock unlocked={unlocked} title="Full holdings & breakdowns" onUpgrade={requestUpgrade}>
                  <div className="space-y-4">
                    <Card>
                      <CardHeader><CardTitle className="text-base">All disclosed holdings ({data.holdings?.count ?? 0})</CardTitle></CardHeader>
                      <CardContent className="overflow-x-auto">
                        <Table>
                          <TableHeader><TableRow><TableHead>Instrument</TableHead><TableHead>Ticker</TableHead><TableHead className="text-right">Weight</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {(data.holdings?.top ?? []).map((h) => (
                              <TableRow key={`${h.symbol}-${h.name}`}>
                                <TableCell className="max-w-[320px] truncate">{h.name ?? "—"}</TableCell>
                                <TableCell className="text-muted-foreground">{h.symbol ?? "—"}</TableCell>
                                <TableCell className="text-right tabular-nums">{pct(h.weight)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Card>
                        <CardHeader><CardTitle className="text-base">Sector breakdown</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                          {(data.holdings?.sectorWeights ?? []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">Not published.</p>
                          ) : (data.holdings?.sectorWeights ?? []).map((s) => (
                            <div key={s.name} className="space-y-1">
                              <div className="flex justify-between text-xs"><span className="capitalize">{s.name.replace(/_/g, " ")}</span><span className="tabular-nums">{pct(s.weight)}</span></div>
                              <Progress value={Math.min(100, (s.weight ?? 0) * 100)} />
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader><CardTitle className="text-base">Asset allocation</CardTitle></CardHeader>
                        <CardContent className="grid grid-cols-2 gap-3">
                          {Object.entries(data.holdings?.assetAllocation ?? {}).map(([k, v]) => (
                            <Fact key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} value={pct(v)} />
                          ))}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader><CardTitle className="text-base">Portfolio equity statistics</CardTitle></CardHeader>
                        <CardContent className="grid grid-cols-2 gap-3">
                          <Fact label="P/E" value={num(data.holdings?.equityStats?.priceToEarnings)} />
                          <Fact label="P/B" value={num(data.holdings?.equityStats?.priceToBook)} />
                          <Fact label="P/S" value={num(data.holdings?.equityStats?.priceToSales)} />
                          <Fact label="P/CF" value={num(data.holdings?.equityStats?.priceToCashflow)} />
                          <Fact label="Median market cap" value={compact(data.holdings?.equityStats?.medianMarketCap, currency ?? undefined)} />
                          <Fact label="3y earnings growth" value={pct(data.holdings?.equityStats?.threeYearEarningsGrowth)} />
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader><CardTitle className="text-base">Bond statistics & credit quality</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <Fact label="Duration" value={num(data.holdings?.bondStats?.duration)} />
                            <Fact label="Maturity" value={num(data.holdings?.bondStats?.maturity)} />
                          </div>
                          {(data.holdings?.bondRatings ?? []).map((r) => (
                            <div key={r.name} className="flex justify-between text-xs"><span className="uppercase">{r.name}</span><span className="tabular-nums">{pct(r.weight)}</span></div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </PremiumBlock>
              </TabsContent>

              {/* PERFORMANCE — premium (1Y/YTD stay free in the header) */}
              <TabsContent value="performance" className="space-y-4 pt-4">
                <PremiumBlock unlocked={unlocked} title="Performance vs category" onUpgrade={requestUpgrade}>
                  <div className="space-y-4">
                    <Card>
                      <CardHeader><CardTitle className="text-base">Trailing returns</CardTitle>
                        <CardDescription>Fund versus its Morningstar category average.</CardDescription></CardHeader>
                      <CardContent className="overflow-x-auto">
                        <Table>
                          <TableHeader><TableRow><TableHead>Period</TableHead><TableHead className="text-right">Fund</TableHead><TableHead className="text-right">Category</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {[["YTD", "ytd"], ["1 month", "oneMonth"], ["3 months", "threeMonth"], ["1 year", "oneYear"], ["3 years p.a.", "threeYear"], ["5 years p.a.", "fiveYear"], ["10 years p.a.", "tenYear"]].map(([label, key]) => (
                              <TableRow key={key}>
                                <TableCell>{label}</TableCell>
                                <TableCell className="text-right tabular-nums">{pct(data.performance?.trailing?.[key])}</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">{pct(data.performance?.trailingCategory?.[key])}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle className="text-base">Calendar-year returns</CardTitle></CardHeader>
                      <CardContent className="overflow-x-auto">
                        <Table>
                          <TableHeader><TableRow><TableHead>Year</TableHead><TableHead className="text-right">Fund</TableHead><TableHead className="text-right">Category</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {(data.performance?.annual ?? []).map((r) => (
                              <TableRow key={r.year ?? Math.random()}>
                                <TableCell>{r.year ?? "—"}</TableCell>
                                <TableCell className="text-right tabular-nums">{pct(r.fund)}</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">{pct(r.category)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                </PremiumBlock>
              </TabsContent>

              {/* RISK — premium */}
              <TabsContent value="risk" className="pt-4">
                <PremiumBlock unlocked={unlocked} title="Risk statistics" onUpgrade={requestUpgrade}>
                  <Card>
                    <CardHeader><CardTitle className="text-base">Risk vs benchmark</CardTitle>
                      <CardDescription>Alpha, beta, volatility and risk-adjusted returns over 3, 5 and 10 years.</CardDescription></CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Horizon</TableHead><TableHead className="text-right">Alpha</TableHead><TableHead className="text-right">Beta</TableHead>
                          <TableHead className="text-right">R²</TableHead><TableHead className="text-right">Std dev</TableHead>
                          <TableHead className="text-right">Sharpe</TableHead><TableHead className="text-right">Treynor</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {(data.risk ?? []).length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-sm text-muted-foreground">Not published for this fund.</TableCell></TableRow>
                          ) : (data.risk ?? []).map((r) => (
                            <TableRow key={r.period ?? Math.random()}>
                              <TableCell>{r.period ? `${r.period}y` : "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">{num(r.alpha)}</TableCell>
                              <TableCell className="text-right tabular-nums">{num(r.beta)}</TableCell>
                              <TableCell className="text-right tabular-nums">{num(r.rSquared)}</TableCell>
                              <TableCell className="text-right tabular-nums">{num(r.stdDev)}</TableCell>
                              <TableCell className="text-right tabular-nums">{num(r.sharpeRatio)}</TableCell>
                              <TableCell className="text-right tabular-nums">{num(r.treynorRatio)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </PremiumBlock>
              </TabsContent>

              {/* COSTS — premium detail */}
              <TabsContent value="costs" className="pt-4">
                <PremiumBlock unlocked={unlocked} title="Full cost breakdown" onUpgrade={requestUpgrade}>
                  <Card>
                    <CardHeader><CardTitle className="text-base">Costs vs category</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      <Fact label="Ongoing charge (TER)" value={pct(data.fees?.annualReportExpenseRatio as number)} hint={`Category ${pct(data.fees?.category?.annualReportExpenseRatio)}`} />
                      <Fact label="Net expense ratio" value={pct(data.fees?.netExpRatio as number)} />
                      <Fact label="Gross expense ratio" value={pct(data.fees?.grossExpRatio as number)} />
                      <Fact label="Entry load" value={pct(data.fees?.frontEndSalesLoad as number)} hint={`Category ${pct(data.fees?.category?.frontEndSalesLoad)}`} />
                      <Fact label="Exit load" value={pct(data.fees?.deferredSalesLoad as number)} hint={`Category ${pct(data.fees?.category?.deferredSalesLoad)}`} />
                      <Fact label="12b-1 / distribution fee" value={pct(data.fees?.twelveBOne as number)} />
                    </CardContent>
                  </Card>
                </PremiumBlock>
              </TabsContent>

              {/* DISTRIBUTIONS — premium */}
              <TabsContent value="distributions" className="pt-4">
                <PremiumBlock unlocked={unlocked} title="Distribution history" onUpgrade={requestUpgrade}>
                  <Card>
                    <CardHeader><CardTitle className="text-base">Distributions paid</CardTitle></CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(data.distributions ?? []).length === 0 ? (
                            <TableRow><TableCell colSpan={2} className="text-sm text-muted-foreground">This share class accumulates income (no distributions found).</TableCell></TableRow>
                          ) : (data.distributions ?? []).slice().reverse().map((d) => (
                            <TableRow key={d.date}>
                              <TableCell>{d.date}</TableCell>
                              <TableCell className="text-right tabular-nums">{money(d.amount, currency)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </PremiumBlock>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </main>
      <UpgradeDialog state={gate.prompt} onOpenChange={(o) => gate.setPrompt({ ...gate.prompt, open: o })} />
    </div>
  );
};

export default FundDetails;
