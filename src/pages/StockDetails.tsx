import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown, ExternalLink, RefreshCw, Activity, MessageSquare, Sparkles, BarChart3, Star, Globe, Calculator, Target } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { TopNav } from "@/components/TopNav";
import {
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useOHLCHistory, type OHLCRange } from "@/hooks/useOHLCHistory";
import { analyze, sma, type AnalysisSummary, type Signal } from "@/lib/technicalIndicators";
import { findCatalogEntry, currencySign } from "@/data/stockCatalog";
import { useWatchlist } from "@/hooks/useWatchlist";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SentimentArticle {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description?: string;
  sentiment: "positive" | "neutral" | "negative";
  score: number;
}
interface SentimentResult {
  symbol: string;
  score: number;
  label: string;
  summary: string;
  drivers: { title: string; impact: "positive" | "negative" | "neutral" }[];
  articles: SentimentArticle[];
  sources?: { source: string; avgScore: number; count: number }[];
  analystOpinions?: {
    stance: "bull" | "bear" | "neutral";
    thesis: string;
    arguments: string[];
    sourceIndexes?: number[];
  }[];
}

interface DeepAnalysis {
  symbol: string;
  fundamentals: Record<string, any>;
  valuation: {
    dcf: { perShare: number; assumptions: any; upside: number | null } | null;
    ddm: { perShare: number; assumptions: any; upside: number | null } | null;
  };
  analysis: {
    thesis?: string;
    strengths?: string[];
    risks?: string[];
    moat?: string;
    valuation?: string;
    scenarios?: {
      bull?: { price: number; probability: number; rationale: string };
      base?: { price: number; probability: number; rationale: string };
      bear?: { price: number; probability: number; rationale: string };
    };
    recommendation?: string;
    horizon?: string;
  };
}

const RANGES: OHLCRange[] = ["1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y"];

const signalColor = (s: Signal) =>
  s === "bullish"
    ? "text-success border-success/30 bg-success/10"
    : s === "bearish"
    ? "text-destructive border-destructive/30 bg-destructive/10"
    : "text-muted-foreground border-border bg-muted/30";

const sentimentTone = (s: string) =>
  s === "positive"
    ? "bg-success/10 text-success border-success/20"
    : s === "negative"
    ? "bg-destructive/10 text-destructive border-destructive/20"
    : "bg-muted text-muted-foreground border-border";

const StockDetails = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { toggle, isWatched } = useWatchlist();

  const sym = decodeURIComponent(symbol || "").toUpperCase();
  const entry = findCatalogEntry(sym);
  const name = entry?.name || sym;
  const market = entry?.market;
  const currency = entry?.currency || "USD";
  const sign = currencySign(currency);

  const [range, setRange] = useState<OHLCRange>("1Y");
  const { quotes, refresh, lastUpdated } = useLiveQuotes(sym ? [sym] : [], 30000);
  const { bars, loading: chartLoading, error: chartError } = useOHLCHistory(sym || null, range);
  const live = quotes[sym];

  // Technical analysis
  const tech: AnalysisSummary | null = useMemo(() => (bars.length >= 60 ? analyze(bars) : null), [bars]);

  // Chart data with SMA overlays
  const chartData = useMemo(() => {
    if (bars.length === 0) return [];
    const closes = bars.map((b) => b.close);
    const s50 = sma(closes, 50);
    const s200 = sma(closes, 200);
    return bars.map((b, i) => ({
      date: new Date(b.t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }),
      close: b.close,
      sma50: s50[i] ?? null,
      sma200: s200[i] ?? null,
      volume: b.volume ?? 0,
      up: b.close >= b.open,
    }));
  }, [bars]);

  const priceMin = useMemo(() => (bars.length ? Math.min(...bars.map((b) => b.low)) * 0.98 : 0), [bars]);
  const priceMax = useMemo(() => (bars.length ? Math.max(...bars.map((b) => b.high)) * 1.02 : 100), [bars]);

  // Sentiment + sources
  const [sentiment, setSentiment] = useState<SentimentResult | null>(null);
  const [sentLoading, setSentLoading] = useState(false);

  const [deep, setDeep] = useState<DeepAnalysis | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);

  const fetchSentiment = async () => {
    if (!sym) return;
    setSentLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-sentiment", {
        body: { symbol: sym, name },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setSentiment(data as SentimentResult);
    } catch (e: any) {
      toast({ title: "Sentiment unavailable", description: e?.message || "Try again later", variant: "destructive" });
    } finally {
      setSentLoading(false);
    }
  };

  const fetchDeep = async () => {
    if (!sym) return;
    setDeepLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("deep-analysis", {
        body: { symbol: sym, name },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setDeep(data as DeepAnalysis);
    } catch (e: any) {
      toast({ title: "Deep analysis unavailable", description: e?.message || "Try again later", variant: "destructive" });
    } finally {
      setDeepLoading(false);
    }
  };

  // Auto-load sentiment once
  useEffect(() => {
    if (sym) fetchSentiment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym]);

  if (!sym) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Link to="/" className="inline-flex items-center gap-2 text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <p className="mt-8 text-muted-foreground">No symbol specified.</p>
      </div>
    );
  }

  const price = live?.price ?? bars[bars.length - 1]?.close ?? 0;
  const change = live?.change ?? 0;
  const isPositive = change >= 0;

  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-6">
          <Link to="/" className="inline-flex items-center gap-2 text-primary hover:underline mb-4 text-sm">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-3xl font-bold">{sym}</h1>
                {market && <Badge variant="outline">{market}</Badge>}
                {!entry && <Badge variant="secondary">Unverified ticker</Badge>}
                <Button size="icon" variant="ghost" onClick={() => toggle(sym, name)}>
                  <Star className={`h-5 w-5 ${isWatched(sym) ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                </Button>
              </div>
              <p className="text-muted-foreground">{name}</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">{sign}{price ? price.toFixed(2) : "—"}</div>
              {live && (
                <div className={`flex items-center gap-1 justify-end mt-1 ${isPositive ? "text-success" : "text-destructive"}`}>
                  {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  <span className="font-semibold">{isPositive ? "+" : ""}{change.toFixed(2)}%</span>
                </div>
              )}
              {lastUpdated && (
                <p className="text-xs text-muted-foreground mt-1">
                  Updated {new Date(lastUpdated).toLocaleTimeString()}
                  <Button size="sm" variant="ghost" className="h-6 px-2 ml-1" onClick={() => refresh()}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 max-w-3xl">
            <TabsTrigger value="overview" className="gap-1.5"><BarChart3 className="h-4 w-4" />Overview</TabsTrigger>
            <TabsTrigger value="technicals" className="gap-1.5"><Activity className="h-4 w-4" />Technicals</TabsTrigger>
            <TabsTrigger value="deep" className="gap-1.5" onClick={() => { if (!deep && !deepLoading) fetchDeep(); }}><Calculator className="h-4 w-4" />Deep Analysis</TabsTrigger>
            <TabsTrigger value="sentiment" className="gap-1.5"><MessageSquare className="h-4 w-4" />Sentiment</TabsTrigger>
            <TabsTrigger value="sources" className="gap-1.5"><Globe className="h-4 w-4" />Sources</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>Price Chart</CardTitle>
                  <CardDescription>Daily close with SMA 50 / 200 overlays.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-1">
                  {RANGES.map((r) => (
                    <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>
                      {r}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {chartLoading ? (
                  <div className="h-[360px] flex items-center justify-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : chartError || chartData.length === 0 ? (
                  <div className="h-[360px] flex items-center justify-center text-muted-foreground">
                    {chartError || "No price data available."}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={360}>
                    <ComposedChart data={chartData}>
                      <defs>
                        <linearGradient id="closeFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} minTickGap={40} />
                      <YAxis domain={[priceMin, priceMax]} stroke="hsl(var(--muted-foreground))" fontSize={11} width={60} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Area type="monotone" dataKey="close" stroke="hsl(var(--primary))" fill="url(#closeFill)" strokeWidth={2} dot={false} name="Close" />
                      <Line type="monotone" dataKey="sma50" stroke="hsl(var(--chart-2))" strokeWidth={1.5} dot={false} name="SMA 50" />
                      <Line type="monotone" dataKey="sma200" stroke="hsl(var(--chart-3))" strokeWidth={1.5} dot={false} name="SMA 200" />
                      {tech?.levels.slice(0, 4).map((lv, i) => (
                        <ReferenceLine
                          key={i}
                          y={lv.price}
                          stroke={lv.type === "support" ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                          strokeDasharray="4 4"
                          strokeOpacity={0.5}
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Composite Signal</CardTitle></CardHeader>
                <CardContent>
                  {tech ? (
                    <>
                      <Badge className={signalColor(tech.overall)} variant="outline">{tech.overall.toUpperCase()}</Badge>
                      <p className="text-3xl font-bold mt-2">{tech.score > 0 ? "+" : ""}{tech.score}</p>
                      <p className="text-xs text-muted-foreground">Score range -100 → +100</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Need more history for analysis.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">News Sentiment</CardTitle></CardHeader>
                <CardContent>
                  {sentLoading ? (
                    <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                  ) : sentiment ? (
                    <>
                      <Badge variant="outline" className={sentimentTone(sentiment.label)}>{sentiment.label.toUpperCase()}</Badge>
                      <p className="text-3xl font-bold mt-2">{Math.round(sentiment.score)}/100</p>
                      <p className="text-xs text-muted-foreground">{sentiment.articles.length} sources analyzed</p>
                    </>
                  ) : (
                    <Button size="sm" onClick={fetchSentiment}>Load sentiment</Button>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Quick Actions</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => navigate(`/technical?symbol=${encodeURIComponent(sym)}`)}>
                    Full technical analysis →
                  </Button>
                  <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => navigate(`/backtest?symbol=${encodeURIComponent(sym)}`)}>
                    Backtest strategies →
                  </Button>
                  <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => navigate(`/sentiment?symbol=${encodeURIComponent(sym)}`)}>
                    Full sentiment dashboard →
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TECHNICALS */}
          <TabsContent value="technicals" className="space-y-6">
            {!tech ? (
              <Card className="p-12 text-center">
                <Activity className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Not enough price history yet for full technical analysis. Try a longer range above.
                </p>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" /> Composite read: <Badge className={signalColor(tech.overall)} variant="outline">{tech.overall}</Badge>
                    </CardTitle>
                    <CardDescription>Score {tech.score} based on trend, momentum, volatility, and patterns.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Progress value={Math.max(0, Math.min(100, 50 + tech.score / 2))} className="h-2" />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Indicator breakdown</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {tech.signals.map((s, i) => (
                      <div key={i} className="p-3 rounded-lg border border-border/50 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{s.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.reason}</p>
                          <p className="text-xs font-mono text-muted-foreground mt-1">{s.value}</p>
                        </div>
                        <Badge variant="outline" className={signalColor(s.signal)}>{s.signal}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {(tech.patterns.length > 0 || tech.levels.length > 0) && (
                  <div className="grid md:grid-cols-2 gap-4">
                    {tech.patterns.length > 0 && (
                      <Card>
                        <CardHeader><CardTitle className="text-base">Recent candlestick patterns</CardTitle></CardHeader>
                        <CardContent className="flex flex-wrap gap-2">
                          {tech.patterns.map((p, i) => <Badge key={i} variant="secondary">{p}</Badge>)}
                        </CardContent>
                      </Card>
                    )}
                    {tech.levels.length > 0 && (
                      <Card>
                        <CardHeader><CardTitle className="text-base">Key levels</CardTitle></CardHeader>
                        <CardContent className="space-y-1.5 text-sm">
                          {tech.levels.slice(0, 6).map((lv, i) => (
                            <div key={i} className="flex justify-between">
                              <span className={lv.type === "support" ? "text-success" : "text-destructive"}>
                                {lv.type === "support" ? "Support" : "Resistance"}
                              </span>
                              <span className="font-mono">{sign}{lv.price.toFixed(2)} <span className="text-muted-foreground text-xs">×{lv.touches}</span></span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* DEEP ANALYSIS */}
          <TabsContent value="deep" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" /> Fundamental & intrinsic value</CardTitle>
                  <CardDescription>Yahoo Finance fundamentals, DCF and DDM models, plus AI scenarios.</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={fetchDeep} disabled={deepLoading} className="gap-1">
                  <RefreshCw className={`h-3.5 w-3.5 ${deepLoading ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {deepLoading && !deep ? (
                  <div className="py-12 text-center"><RefreshCw className="h-6 w-6 animate-spin text-primary mx-auto" /></div>
                ) : !deep ? (
                  <div className="py-8 text-center">
                    <Button onClick={fetchDeep}>Run deep analysis</Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Recommendation banner */}
                    {deep.analysis?.recommendation && (
                      <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">AI recommendation</p>
                          <p className="text-2xl font-bold">{deep.analysis.recommendation}</p>
                          {deep.analysis.horizon && <p className="text-xs text-muted-foreground">Horizon: {deep.analysis.horizon}</p>}
                        </div>
                        {deep.analysis.valuation && <p className="text-sm max-w-md text-right">{deep.analysis.valuation}</p>}
                      </div>
                    )}

                    {/* Thesis */}
                    {deep.analysis?.thesis && (
                      <div>
                        <p className="text-sm font-semibold mb-1">Investment thesis</p>
                        <p className="text-sm text-muted-foreground">{deep.analysis.thesis}</p>
                      </div>
                    )}

                    {/* Intrinsic value cards */}
                    <div className="grid md:grid-cols-2 gap-4">
                      {deep.valuation.dcf && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" /> DCF fair value</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-3xl font-bold">{sign}{deep.valuation.dcf.perShare.toFixed(2)}</p>
                            {deep.valuation.dcf.upside != null && (
                              <p className={`text-sm font-semibold ${deep.valuation.dcf.upside >= 0 ? "text-success" : "text-destructive"}`}>
                                {deep.valuation.dcf.upside >= 0 ? "+" : ""}{(deep.valuation.dcf.upside * 100).toFixed(1)}% vs spot
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2 font-mono">
                              g={Math.round((deep.valuation.dcf.assumptions.growth ?? 0) * 100)}% · r={Math.round((deep.valuation.dcf.assumptions.discount ?? 0) * 100)}% · {deep.valuation.dcf.assumptions.years}y
                            </p>
                          </CardContent>
                        </Card>
                      )}
                      {deep.valuation.ddm && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" /> DDM fair value</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-3xl font-bold">{sign}{deep.valuation.ddm.perShare.toFixed(2)}</p>
                            {deep.valuation.ddm.upside != null && (
                              <p className={`text-sm font-semibold ${deep.valuation.ddm.upside >= 0 ? "text-success" : "text-destructive"}`}>
                                {deep.valuation.ddm.upside >= 0 ? "+" : ""}{(deep.valuation.ddm.upside * 100).toFixed(1)}% vs spot
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2 font-mono">
                              div={sign}{deep.valuation.ddm.assumptions.dividend?.toFixed(2)} · g={Math.round((deep.valuation.ddm.assumptions.growth ?? 0) * 100)}% · r={Math.round((deep.valuation.ddm.assumptions.discount ?? 0) * 100)}%
                            </p>
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    {/* Scenarios */}
                    {deep.analysis?.scenarios && (
                      <div>
                        <p className="text-sm font-semibold mb-2">Price scenarios</p>
                        <div className="grid md:grid-cols-3 gap-3">
                          {(["bull", "base", "bear"] as const).map((k) => {
                            const s = deep.analysis.scenarios?.[k];
                            if (!s) return null;
                            const tone = k === "bull" ? "border-success/30 bg-success/5" : k === "bear" ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/30";
                            const labelTone = k === "bull" ? "text-success" : k === "bear" ? "text-destructive" : "text-muted-foreground";
                            return (
                              <div key={k} className={`p-3 rounded-lg border ${tone}`}>
                                <div className="flex items-center justify-between">
                                  <span className={`text-xs uppercase font-semibold ${labelTone}`}>{k}</span>
                                  <span className="text-xs text-muted-foreground">{Math.round((s.probability ?? 0) * 100)}%</span>
                                </div>
                                <p className="text-2xl font-bold mt-1">{sign}{s.price?.toFixed(2)}</p>
                                <p className="text-xs text-muted-foreground mt-1">{s.rationale}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Strengths / Risks */}
                    <div className="grid md:grid-cols-2 gap-4">
                      {deep.analysis?.strengths && deep.analysis.strengths.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-base text-success">Strengths</CardTitle></CardHeader>
                          <CardContent>
                            <ul className="space-y-1.5 text-sm">
                              {deep.analysis.strengths.map((s, i) => <li key={i} className="flex gap-2"><span className="text-success">+</span>{s}</li>)}
                            </ul>
                          </CardContent>
                        </Card>
                      )}
                      {deep.analysis?.risks && deep.analysis.risks.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-base text-destructive">Risks</CardTitle></CardHeader>
                          <CardContent>
                            <ul className="space-y-1.5 text-sm">
                              {deep.analysis.risks.map((s, i) => <li key={i} className="flex gap-2"><span className="text-destructive">−</span>{s}</li>)}
                            </ul>
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    {deep.analysis?.moat && (
                      <div>
                        <p className="text-sm font-semibold mb-1">Competitive moat</p>
                        <p className="text-sm text-muted-foreground">{deep.analysis.moat}</p>
                      </div>
                    )}

                    {/* Fundamentals grid */}
                    <div>
                      <p className="text-sm font-semibold mb-2">Key fundamentals</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        {([
                          ["Market cap", deep.fundamentals.marketCap, "currency-short"],
                          ["P/E (TTM)", deep.fundamentals.peTrailing, "x"],
                          ["Fwd P/E", deep.fundamentals.peForward, "x"],
                          ["PEG", deep.fundamentals.pegRatio, "x"],
                          ["P/B", deep.fundamentals.priceToBook, "x"],
                          ["P/S", deep.fundamentals.priceToSales, "x"],
                          ["EV/EBITDA", deep.fundamentals.evToEbitda, "x"],
                          ["Div yield", deep.fundamentals.dividendYield, "pct"],
                          ["Payout", deep.fundamentals.payoutRatio, "pct"],
                          ["Profit margin", deep.fundamentals.profitMargin, "pct"],
                          ["ROE", deep.fundamentals.returnOnEquity, "pct"],
                          ["ROA", deep.fundamentals.returnOnAssets, "pct"],
                          ["Rev growth", deep.fundamentals.revenueGrowth, "pct"],
                          ["EPS growth", deep.fundamentals.earningsGrowth, "pct"],
                          ["Debt/Equity", deep.fundamentals.debtToEquity, "num"],
                          ["Beta", deep.fundamentals.beta, "num"],
                        ] as const).map(([label, v, fmt], i) => {
                          if (v == null) return null;
                          let txt = "";
                          if (fmt === "pct") txt = `${(v * 100).toFixed(2)}%`;
                          else if (fmt === "x") txt = `${v.toFixed(2)}×`;
                          else if (fmt === "currency-short") {
                            if (v >= 1e12) txt = `${sign}${(v / 1e12).toFixed(2)}T`;
                            else if (v >= 1e9) txt = `${sign}${(v / 1e9).toFixed(2)}B`;
                            else if (v >= 1e6) txt = `${sign}${(v / 1e6).toFixed(2)}M`;
                            else txt = `${sign}${v.toFixed(0)}`;
                          } else txt = v.toFixed(2);
                          return (
                            <div key={i} className="p-2 rounded border border-border/50">
                              <p className="text-xs text-muted-foreground">{label}</p>
                              <p className="font-mono font-semibold">{txt}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Analyst targets */}
                    {(deep.fundamentals.targetMeanPrice || deep.fundamentals.numberOfAnalystOpinions) && (
                      <div className="p-3 rounded-lg border border-border/50">
                        <p className="text-sm font-semibold mb-2">Wall Street consensus</p>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div><p className="text-xs text-muted-foreground">Low</p><p className="font-mono">{sign}{deep.fundamentals.targetLowPrice?.toFixed(2) ?? "—"}</p></div>
                          <div><p className="text-xs text-muted-foreground">Mean</p><p className="font-mono font-bold">{sign}{deep.fundamentals.targetMeanPrice?.toFixed(2) ?? "—"}</p></div>
                          <div><p className="text-xs text-muted-foreground">High</p><p className="font-mono">{sign}{deep.fundamentals.targetHighPrice?.toFixed(2) ?? "—"}</p></div>
                        </div>
                        {deep.fundamentals.recommendationKey && (
                          <p className="text-xs text-muted-foreground mt-2">Rating: <span className="font-semibold capitalize">{deep.fundamentals.recommendationKey.replace(/_/g, " ")}</span> · {deep.fundamentals.numberOfAnalystOpinions ?? 0} analysts</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SENTIMENT */}
          <TabsContent value="sentiment" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>AI Sentiment Summary</CardTitle>
                  <CardDescription>Aggregated across Yahoo, Seeking Alpha, Reddit, X and more.</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={fetchSentiment} disabled={sentLoading} className="gap-1">
                  <RefreshCw className={`h-3.5 w-3.5 ${sentLoading ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {sentLoading && !sentiment ? (
                  <div className="py-8 text-center"><RefreshCw className="h-6 w-6 animate-spin text-primary mx-auto" /></div>
                ) : !sentiment ? (
                  <p className="text-muted-foreground text-sm">Click refresh to fetch sentiment.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge variant="outline" className={sentimentTone(sentiment.label)}>{sentiment.label.toUpperCase()}</Badge>
                      <span className="text-2xl font-bold">{Math.round(sentiment.score)}/100</span>
                    </div>
                    <p className="text-sm">{sentiment.summary}</p>
                    {sentiment.drivers?.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold mb-2">Key drivers</p>
                        <ul className="space-y-1">
                          {sentiment.drivers.map((d, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <Badge variant="outline" className={sentimentTone(d.impact)}>{d.impact}</Badge>
                              <span>{d.title}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {sentiment.sources && sentiment.sources.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold mb-2">Sentiment by source</p>
                        <div className="grid sm:grid-cols-2 gap-2">
                          {sentiment.sources.map((s, i) => (
                            <div key={i} className="p-2 rounded border border-border/50 flex items-center justify-between text-sm">
                              <span className="font-medium">{s.source}</span>
                              <span className="text-xs text-muted-foreground">
                                {s.count} item{s.count === 1 ? "" : "s"} · avg {s.avgScore.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {sentiment.analystOpinions && sentiment.analystOpinions.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold mb-2">Analyst camps</p>
                        <div className="grid md:grid-cols-2 gap-3">
                          {sentiment.analystOpinions.map((o, i) => {
                            const tone = o.stance === "bull"
                              ? "border-success/30 bg-success/5"
                              : o.stance === "bear"
                              ? "border-destructive/30 bg-destructive/5"
                              : "border-border bg-muted/30";
                            const labelTone = o.stance === "bull" ? "text-success" : o.stance === "bear" ? "text-destructive" : "text-muted-foreground";
                            return (
                              <div key={i} className={`p-3 rounded-lg border ${tone}`}>
                                <span className={`text-xs uppercase font-semibold ${labelTone}`}>{o.stance}</span>
                                <p className="text-sm font-medium mt-1">{o.thesis}</p>
                                {o.arguments?.length > 0 && (
                                  <ul className="mt-2 space-y-1">
                                    {o.arguments.map((a, j) => (
                                      <li key={j} className="text-xs text-muted-foreground flex gap-1.5"><span>•</span>{a}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SOURCES */}
          <TabsContent value="sources" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Sources</CardTitle>
                <CardDescription>
                  Every article, post and feed item the AI ingested for this ticker. Click any title to verify.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sentLoading && !sentiment ? (
                  <div className="py-8 text-center"><RefreshCw className="h-6 w-6 animate-spin text-primary mx-auto" /></div>
                ) : !sentiment || sentiment.articles.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No sources yet — load sentiment first.</p>
                ) : (
                  <div className="space-y-2">
                    {sentiment.articles.map((a, i) => (
                      <a
                        key={i}
                        href={a.link}
                        target="_blank"
                        rel="noreferrer"
                        className="block p-3 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-accent/5 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug">{a.title}</p>
                            {a.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>
                            )}
                            <div className="flex items-center gap-2 flex-wrap mt-2 text-xs text-muted-foreground">
                              <Badge variant="outline">{a.source}</Badge>
                              {a.pubDate && <span>{new Date(a.pubDate).toLocaleString()}</span>}
                              <Badge variant="outline" className={sentimentTone(a.sentiment)}>
                                {a.sentiment} · {a.score.toFixed(2)}
                              </Badge>
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default StockDetails;