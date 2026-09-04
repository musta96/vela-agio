import { useEffect, useMemo, useState } from "react";
import { generateStockReport, generateDeepAnalysisReport } from "@/lib/pdfReports";
import { FileDown } from "lucide-react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown, ExternalLink, RefreshCw, Activity, MessageSquare, Sparkles, BarChart3, Star, Globe, Calculator, Target, ShieldAlert, Lightbulb, Briefcase } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Helmet } from "react-helmet-async";
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
import { useBenchmarkBars, benchmarkFor } from "@/hooks/useBenchmark";
import { RiskPanel } from "@/components/RiskPanel";
import { LockedPreview } from "@/components/gating/LockedPreview";
import { Card as GateCard, CardContent as GateCardContent } from "@/components/ui/card";
import { analyze, sma, type AnalysisSummary, type Signal } from "@/lib/technicalIndicators";
import { findCatalogEntry, currencySign } from "@/data/stockCatalog";
import { useWatchlist } from "@/hooks/useWatchlist";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRecommendationVerdicts } from "@/hooks/useRecommendationVerdicts";
import { FinancialStatementsPanel } from "@/components/stock/FinancialStatementsPanel";
import { KeyIndicatorsCard } from "@/components/stock/KeyIndicatorsCard";
import { EventsDividendsCard } from "@/components/stock/EventsDividendsCard";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { RoicWaccPanel } from "@/components/stock/RoicWaccPanel";
import { PeerComparisonPanel } from "@/components/stock/PeerComparisonPanel";

function BackLink() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasHistory = (location.key && location.key !== "default") || (typeof window !== "undefined" && window.history.length > 1);
  // Infer label from referrer pathname
  let label = "Back";
  if (typeof document !== "undefined" && document.referrer) {
    try {
      const ref = new URL(document.referrer);
      if (ref.origin === window.location.origin) {
        const p = ref.pathname;
        if (p.startsWith("/related")) label = "Back to Related";
        else if (p.startsWith("/explore")) label = "Back to Explore";
        else if (p.startsWith("/watchlist")) label = "Back to Watchlist";
        else if (p.startsWith("/portfolio")) label = "Back to Portfolio";
        else if (p.startsWith("/screener")) label = "Back to Screener";
        else if (p.startsWith("/movers")) label = "Back to Movers";
        else if (p.startsWith("/peers")) label = "Back to Peers";
        else if (p.startsWith("/compare")) label = "Back to Compare";
        else if (p.startsWith("/dashboard")) label = "Back to Dashboard";
        else if (p.startsWith("/stock/")) label = "Back";
        else if (p !== "/" && p.length > 1) {
          const name = p.slice(1).split("/")[0];
          label = "Back to " + name.charAt(0).toUpperCase() + name.slice(1);
        }
      }
    } catch { /* ignore */ }
  }
  return (
    <button
      type="button"
      onClick={() => (hasHistory ? navigate(-1) : navigate("/dashboard"))}
      className="inline-flex items-center gap-2 text-primary hover:underline text-sm"
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  );
}

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
  liquidity?: { avgVolume: number; avgDollarVolume: number; tier: string } | null;
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
  const { user } = useAuth();
  const { enabled: showVerdicts } = useRecommendationVerdicts();
  const [addOpen, setAddOpen] = useState(false);
  const [addShares, setAddShares] = useState("");
  const [addAvg, setAddAvg] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const sym = decodeURIComponent(symbol || "").toUpperCase();
  const { data: companyData, loading: companyLoading } = useCompanyProfile(sym);
  const entry = findCatalogEntry(sym);
  const name = entry?.name || sym;
  const market = entry?.market;
  const currency = entry?.currency || "USD";
  const sign = currencySign(currency);

  const [range, setRange] = useState<OHLCRange>("1Y");
  const { quotes, refresh, lastUpdated } = useLiveQuotes(sym ? [sym] : [], 30000);
  const { bars, loading: chartLoading, error: chartError } = useOHLCHistory(sym || null, range);
  // For risk tab: 2Y daily + 2Y weekly + benchmark
  const { bars: weeklyBars } = useOHLCHistory(sym || null, "5Y");
  const bench = benchmarkFor(market);
  const { bars: benchBars } = useBenchmarkBars(sym ? bench.symbol : null, "2y", "1d");
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
        <BackLink />
        <p className="mt-8 text-muted-foreground">No symbol specified.</p>
      </div>
    );
  }

  const price = live?.price ?? bars[bars.length - 1]?.close ?? 0;
  const change = live?.change ?? 0;
  const isPositive = change >= 0;

  const openAddToPortfolio = () => {
    setAddShares("");
    setAddAvg(price ? String(price.toFixed(4)) : "");
    setAddOpen(true);
  };

  const saveToPortfolio = async () => {
    const sh = parseFloat(addShares);
    const av = parseFloat(addAvg);
    if (!Number.isFinite(sh) || sh <= 0 || !Number.isFinite(av) || av <= 0) {
      toast({ title: "Invalid values", description: "Enter positive numbers for shares and avg price.", variant: "destructive" });
      return;
    }
    setAddSaving(true);
    try {
      if (user) {
        // Merge with any existing position (weighted-avg buy)
        const { data: existing } = await supabase
          .from("portfolio_holdings")
          .select("shares,avg_price")
          .eq("user_id", user.id).eq("symbol", sym).maybeSingle();
        let newShares = sh, newAvg = av;
        if (existing) {
          const exS = Number(existing.shares), exA = Number(existing.avg_price);
          newShares = exS + sh;
          newAvg = (exS * exA + sh * av) / newShares;
        }
        const { error } = await supabase.from("portfolio_holdings").upsert({
          user_id: user.id, symbol: sym, name, shares: newShares, avg_price: newAvg,
        }, { onConflict: "user_id,symbol" });
        if (error) throw error;
      } else {
        // Local fallback
        const raw = localStorage.getItem("portfolio_holdings");
        const arr = raw ? JSON.parse(raw) : [];
        const idx = arr.findIndex((p: any) => p.symbol === sym);
        if (idx >= 0) {
          const exS = Number(arr[idx].shares), exA = Number(arr[idx].avgPrice);
          const newShares = exS + sh;
          arr[idx] = { ...arr[idx], shares: newShares, avgPrice: (exS * exA + sh * av) / newShares };
        } else {
          arr.push({ symbol: sym, name, shares: sh, avgPrice: av, currentPrice: price || av, currency });
        }
        localStorage.setItem("portfolio_holdings", JSON.stringify(arr));
      }
      toast({ title: "Added to portfolio", description: `${sh} ${sym} @ ${sign}${av.toFixed(4)}` });
      setAddOpen(false);
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setAddSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${symbol} - ${entry?.name ?? "Stock"} Analysis & Live Price`}
        description={`Live price, fundamentals, technical signals, sentiment, and AI verdict for ${entry?.name ?? sym} (${symbol}). Risk and valuation insights in one view.`}
        path={`/stock/${symbol}`}
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FinancialProduct",
          name: entry?.name ?? sym,
          tickerSymbol: sym,
          description: `Live price, fundamentals, technical analysis, sentiment, and AI-driven insights for ${entry?.name ?? sym} (${sym}).`,
          url: `https://intel-market-pulse.lovable.app/stock/${sym}`,
          category: "Equity",
        })}</script>
      </Helmet>
      <TopNav />
      <main>

      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-6">
          <div className="mb-4"><BackLink /></div>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-3xl font-bold">{sym}{name ? ` - ${name}` : ""}</h1>
                {market && <Badge variant="outline">{market}</Badge>}
                {!entry && <Badge variant="secondary">Unverified ticker</Badge>}
                <Button size="icon" variant="ghost" aria-label={isWatched(sym) ? "Remove from watchlist" : "Add to watchlist"} onClick={() => toggle(sym, name)}>
                  <Star className={`h-5 w-5 ${isWatched(sym) ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                </Button>
                <Button size="sm" variant="default" className="gap-1.5" onClick={openAddToPortfolio}>
                  <Briefcase className="h-4 w-4" /> Add to portfolio
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() =>
                    generateStockReport({
                      symbol: sym,
                      name: name ?? entry?.name ?? "",
                      price: price || undefined,
                      change: live?.change,
                      fundamentals: deep?.fundamentals
                        ? {
                            "Market cap": deep.fundamentals.marketCap,
                            "P/E (TTM)": deep.fundamentals.peTrailing,
                            "Fwd P/E": deep.fundamentals.peForward,
                            "PEG": deep.fundamentals.pegRatio,
                            "P/B": deep.fundamentals.priceToBook,
                            "EV/EBITDA": deep.fundamentals.evToEbitda,
                            "Div yield": deep.fundamentals.dividendYield,
                            "ROE": deep.fundamentals.returnOnEquity,
                            "Beta": deep.fundamentals.beta,
                            "Analyst target (mean)": deep.fundamentals.targetMeanPrice,
                          }
                        : undefined,
                      aiVerdict: sentiment
                        ? { verdict: sentiment.label ?? "-", confidence: sentiment.score, rationale: (sentiment as any).summary }
                        : undefined,
                    })
                  }
                >
                  <FileDown className="h-4 w-4" /> PDF
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="gap-1.5"
                  disabled={deepLoading}
                  onClick={async () => {
                    let d = deep;
                    if (!d) {
                      await fetchDeep();
                      // re-read after fetch (state may not be updated yet); attempt direct invoke
                      try {
                        const { data } = await supabase.functions.invoke("deep-analysis", {
                          body: { symbol: sym, name },
                        });
                        if (data && !(data as any)?.error) d = data as any;
                      } catch {}
                    }
                    if (!d) {
                      toast({ title: "Deep analysis unavailable", description: "Try again in a moment", variant: "destructive" });
                      return;
                    }
                    generateDeepAnalysisReport({
                      symbol: sym,
                      name: name ?? entry?.name ?? undefined,
                      fundamentals: d.fundamentals,
                      liquidity: d.liquidity ?? null,
                      valuation: d.valuation,
                      analysis: d.analysis,
                      sentiment: sentiment
                        ? { label: sentiment.label, score: sentiment.score, summary: sentiment.summary }
                        : null,
                    });
                  }}
                >
                  <FileDown className="h-4 w-4" /> {deepLoading ? "Preparing…" : "Full analysis PDF"}
                </Button>
              </div>
              <p className="text-muted-foreground">{name}</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">{sign}{price ? price.toFixed(2) : "-"}</div>
              {live && (
                <div className={`flex items-center gap-1 justify-end mt-1 ${isPositive ? "text-success" : "text-destructive"}`}>
                  {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  <span className="font-semibold">{isPositive ? "+" : ""}{change.toFixed(2)}%</span>
                </div>
              )}
              {lastUpdated && (
                <p className="text-xs text-muted-foreground mt-1">
                  Updated {new Date(lastUpdated).toLocaleTimeString()}
                  <Button size="sm" variant="ghost" aria-label="Refresh price" className="h-6 px-2 ml-1" onClick={() => refresh()}>
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
          <div className="-mx-6 md:mx-0 overflow-x-auto scrollbar-none">
            <TabsList className="inline-flex w-max md:grid md:w-full md:grid-cols-8 md:max-w-5xl px-6 md:px-0">
              <TabsTrigger value="overview" className="gap-1.5 shrink-0"><BarChart3 className="h-4 w-4" />Overview</TabsTrigger>
              <TabsTrigger value="technicals" className="gap-1.5 shrink-0"><Activity className="h-4 w-4" />Technicals</TabsTrigger>
              <TabsTrigger value="risk" className="gap-1.5 shrink-0"><ShieldAlert className="h-4 w-4" />Risk</TabsTrigger>
              <TabsTrigger value="deep" className="gap-1.5 shrink-0" onClick={() => { if (!deep && !deepLoading) fetchDeep(); }}><Calculator className="h-4 w-4" />Deep Analysis</TabsTrigger>
              <TabsTrigger value="statements" className="gap-1.5 shrink-0"><Briefcase className="h-4 w-4" />Statements</TabsTrigger>
              <TabsTrigger value="peers" className="gap-1.5 shrink-0"><Star className="h-4 w-4" />Peers</TabsTrigger>
              <TabsTrigger value="sentiment" className="gap-1.5 shrink-0"><MessageSquare className="h-4 w-4" />Sentiment</TabsTrigger>
              <TabsTrigger value="sources" className="gap-1.5 shrink-0"><Globe className="h-4 w-4" />Sources</TabsTrigger>
            </TabsList>
          </div>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6">
            {(() => {
              const techScore = tech?.score ?? 0;
              const sentScore = sentiment ? sentiment.score - 50 : 0; // -50..+50
              const combined = (techScore * 0.7) + (sentScore * 0.6); // ~ -100..+100
              let verdict: "BUY" | "ACCUMULATE" | "HOLD" | "TRIM" | "AVOID";
              let tone = "";
              if (combined >= 45) { verdict = "BUY"; tone = "text-success border-success/30 bg-success/10"; }
              else if (combined >= 15) { verdict = "ACCUMULATE"; tone = "text-success border-success/30 bg-success/10"; }
              else if (combined > -15) { verdict = "HOLD"; tone = "text-muted-foreground border-border bg-muted/30"; }
              else if (combined > -45) { verdict = "TRIM"; tone = "text-destructive border-destructive/30 bg-destructive/10"; }
              else { verdict = "AVOID"; tone = "text-destructive border-destructive/30 bg-destructive/10"; }

              const pros: string[] = [];
              const cons: string[] = [];
              tech?.signals.forEach((s) => {
                if (s.signal === "bullish") pros.push(`${s.name}: ${s.reason}`);
                else if (s.signal === "bearish") cons.push(`${s.name}: ${s.reason}`);
              });
              if (sentiment) {
                if (sentiment.score >= 60) pros.push(`News sentiment positive (${Math.round(sentiment.score)}/100) - ${sentiment.summary}`);
                else if (sentiment.score <= 40) cons.push(`News sentiment negative (${Math.round(sentiment.score)}/100) - ${sentiment.summary}`);
              }
              if (tech?.volume?.spike) pros.push("Volume spike confirms current move.");
              if (tech?.volume?.weak) cons.push("Thin volume - move lacks conviction.");

              const nearestSupport = tech?.levels.filter((l) => l.type === "support" && l.price < tech.lastClose).sort((a, b) => b.price - a.price)[0];
              const nearestResistance = tech?.levels.filter((l) => l.type === "resistance" && l.price > tech.lastClose).sort((a, b) => a.price - b.price)[0];

              const action =
                verdict === "BUY" ? "Strong setup. Consider opening or adding to a position, sized to your risk." :
                verdict === "ACCUMULATE" ? "Constructive backdrop. Build the position gradually on pullbacks." :
                verdict === "HOLD" ? "Mixed signals. Keep existing exposure but wait for a clearer trigger." :
                verdict === "TRIM" ? "Risk skewed to the downside. Reduce exposure or tighten stops." :
                "Multiple negatives align. Avoid new buys; exit or hedge if already long.";

              // Descriptive composite read-out used when recommendation
              // verdicts are disabled (default). Neutral language, no
              // buy/hold/sell label, no horizon, no sizing instruction.
              const compositeLabel =
                combined >= 45 ? "Strongly bullish composite"
                : combined >= 15 ? "Bullish composite"
                : combined > -15 ? "Neutral composite"
                : combined > -45 ? "Bearish composite"
                : "Strongly bearish composite";
              const descriptive =
                `Technical/sentiment composite ${combined >= 0 ? "+" : ""}${combined.toFixed(0)} (${compositeLabel.toLowerCase()}). ` +
                `Educational read-out only; no recommendation issued.`;

              return (
                <Card className="border-primary/30">
                  <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle>{showVerdicts ? "What to do" : "Composite read-out"}</CardTitle>
                        <CardDescription>
                          {showVerdicts
                            ? "AI-blended verdict from technicals, volume and news sentiment."
                            : "Descriptive composite of technicals, volume and news sentiment. Educational only."}
                        </CardDescription>
                      </div>
                    </div>
                    {showVerdicts ? (
                      <Badge variant="outline" className={`${tone} text-base px-3 py-1`}>{verdict}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-base px-3 py-1">{compositeLabel}</Badge>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm">{showVerdicts ? action : descriptive}</p>
                    {(nearestSupport || nearestResistance) && (
                      <div className="flex flex-wrap gap-2 text-xs">
                        {nearestSupport && (
                          <Badge variant="outline" className="text-success border-success/30 bg-success/5">
                            Support {currencySign(entry?.currency)}{nearestSupport.price.toFixed(2)}
                          </Badge>
                        )}
                        {nearestResistance && (
                          <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/5">
                            Resistance {currencySign(entry?.currency)}{nearestResistance.price.toFixed(2)}
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-medium text-success mb-2 uppercase tracking-wide">Why it could work</p>
                        {pros.length ? (
                          <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-4">
                            {pros.slice(0, 4).map((p, i) => <li key={i}>{p}</li>)}
                          </ul>
                        ) : <p className="text-sm text-muted-foreground">No strong positive drivers right now.</p>}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-destructive mb-2 uppercase tracking-wide">What to watch out for</p>
                        {cons.length ? (
                          <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-4">
                            {cons.slice(0, 4).map((c, i) => <li key={i}>{c}</li>)}
                          </ul>
                        ) : <p className="text-sm text-muted-foreground">No major red flags detected.</p>}
                      </div>
                    </div>
                    {!sentiment && !sentLoading && (
                      <p className="text-xs text-muted-foreground">
                        Tip: <button className="underline" onClick={fetchSentiment}>load news sentiment</button> for a more complete verdict.
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground italic">
                      Educational signal - not investment advice. Always confirm with your own research and risk rules.
                    </p>
                  </CardContent>
                </Card>
              );
            })()}

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
                {!chartLoading && !chartError && chartData.length > 0 && (
                  <ResponsiveContainer width="100%" height={90}>
                    <ComposedChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                      <XAxis dataKey="date" hide />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                        formatter={(v: any) => [(v as number).toLocaleString(), "Volume"]}
                      />
                      <Bar dataKey="volume" fill="hsl(var(--muted-foreground))" opacity={0.45} name="Volume" />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-4 gap-4">
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
                <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Volume vs 20d avg</CardTitle></CardHeader>
                <CardContent>
                  {tech?.volume ? (
                    <>
                      <Badge
                        variant="outline"
                        className={tech.volume.spike ? "text-primary border-primary/30 bg-primary/10" : tech.volume.weak ? "text-muted-foreground border-border bg-muted/30" : "text-foreground border-border"}
                      >
                        {tech.volume.spike ? "SPIKE" : tech.volume.weak ? "THIN" : "NORMAL"}
                      </Badge>
                      <p className="text-3xl font-bold mt-2">{tech.volume.ratio.toFixed(2)}×</p>
                      <p className="text-xs text-muted-foreground">
                        OBV {tech.volume.obvSlopePct >= 0 ? "+" : ""}{tech.volume.obvSlopePct.toFixed(1)}% / 20 bars
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No volume data.</p>
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
            <KeyIndicatorsCard data={companyData} loading={companyLoading} />
            <EventsDividendsCard data={companyData} loading={companyLoading} />
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

          {/* RISK */}
          <TabsContent value="risk" className="space-y-6">
            <RiskPanel
              bars={bars}
              weeklyBars={weeklyBars}
              benchBars={benchBars}
              benchLabel={bench.label}
              currencySign={sign}
            />
          </TabsContent>

          {/* DEEP ANALYSIS */}
          <TabsContent value="deep" className="space-y-6">
            <LockedPreview
              feature="research.full_memo"
              title="Unlock the full research memo"
              description="Full valuation ranges (DCF & DDM), scenario analysis, fundamentals table, correlation and analyst targets."
              source="stock_deep_memo"
              previewSlot={
                <GateCard>
                  <GateCardContent className="p-5 space-y-2">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Snapshot</p>
                    <p className="text-lg font-semibold">
                      {entry?.name ?? symbol} · {sign}{price != null ? price.toFixed(2) : "—"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Basic AI take and rating are included on Free. The full multi-page memo — valuation ranges, scenario analysis, fundamentals table and correlation matrix — unlocks on Pro.
                    </p>
                  </GateCardContent>
                </GateCard>
              }
            >
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
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">
                            {showVerdicts ? "AI recommendation" : "Valuation read"}
                          </p>
                          {showVerdicts ? (
                            <>
                              <p className="text-2xl font-bold">{deep.analysis.recommendation}</p>
                              {deep.analysis.horizon && (
                                <p className="text-xs text-muted-foreground">Horizon: {deep.analysis.horizon}</p>
                              )}
                            </>
                          ) : (
                            <p className="text-sm max-w-md">
                              {deep.analysis.valuation
                                ? deep.analysis.valuation
                                : "Descriptive valuation summary unavailable. Underlying DCF, DDM, fundamentals and technicals are shown below."}
                              <span className="block text-[10px] text-muted-foreground italic mt-1">
                                No recommendation issued. Educational read-out only.
                              </span>
                            </p>
                          )}
                        </div>
                        {showVerdicts && deep.analysis.valuation && (
                          <p className="text-sm max-w-md text-right">{deep.analysis.valuation}</p>
                        )}
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

                    {/* Liquidity */}
                    {deep.liquidity && (
                      <div className="p-3 rounded-lg border border-border/50 flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <p className="text-sm font-semibold">Liquidity</p>
                          <p className="text-xs text-muted-foreground">
                            Avg daily volume {(deep.liquidity.avgVolume / 1e6).toFixed(2)}M shares · ${(deep.liquidity.avgDollarVolume / 1e6).toFixed(1)}M traded/day
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            deep.liquidity.tier === "very-liquid" || deep.liquidity.tier === "liquid"
                              ? "text-success border-success/30 bg-success/10"
                              : deep.liquidity.tier === "moderate"
                              ? "text-foreground border-border"
                              : "text-destructive border-destructive/30 bg-destructive/10"
                          }
                        >
                          {deep.liquidity.tier.toUpperCase()}
                        </Badge>
                      </div>
                    )}

                    {/* Analyst targets */}
                    {(deep.fundamentals.targetMeanPrice || deep.fundamentals.numberOfAnalystOpinions) && (
                      <div className="p-3 rounded-lg border border-border/50">
                        <p className="text-sm font-semibold mb-2">Wall Street consensus</p>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div><p className="text-xs text-muted-foreground">Low</p><p className="font-mono">{sign}{deep.fundamentals.targetLowPrice?.toFixed(2) ?? "-"}</p></div>
                          <div><p className="text-xs text-muted-foreground">Mean</p><p className="font-mono font-bold">{sign}{deep.fundamentals.targetMeanPrice?.toFixed(2) ?? "-"}</p></div>
                          <div><p className="text-xs text-muted-foreground">High</p><p className="font-mono">{sign}{deep.fundamentals.targetHighPrice?.toFixed(2) ?? "-"}</p></div>
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
            </LockedPreview>
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

          {/* STATEMENTS */}
          <TabsContent value="statements" className="space-y-6">
            <RoicWaccPanel symbol={sym} />
            <FinancialStatementsPanel symbol={sym} />
          </TabsContent>
          {/* PEERS */}
          <TabsContent value="peers" className="space-y-6">
            <PeerComparisonPanel symbol={sym} />
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
                  <p className="text-muted-foreground text-sm">No sources yet - load sentiment first.</p>
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
    </main>

    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add {sym} to portfolio</DialogTitle>
          <DialogDescription>
            If you already hold {sym}, your average price will be recalculated automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Shares</label>
            <Input type="number" inputMode="decimal" value={addShares} onChange={(e) => setAddShares(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">
              Avg buy price ({currency})
            </label>
            <Input type="number" inputMode="decimal" step="0.0001" value={addAvg} onChange={(e) => setAddAvg(e.target.value)} />
            {price > 0 && (
              <button type="button" className="text-xs text-primary hover:underline mt-1" onClick={() => setAddAvg(String(price.toFixed(4)))}>
                Use current price ({sign}{price.toFixed(2)})
              </button>
            )}
          </div>
          {!user && (
            <p className="text-xs text-muted-foreground">
              Not signed in - this will be saved locally on this device only.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button onClick={saveToPortfolio} disabled={addSaving}>
            {addSaving ? "Saving…" : "Add to portfolio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </div>
  );
};

export default StockDetails;