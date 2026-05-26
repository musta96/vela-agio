import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Activity, Sparkles, TrendingUp, AlertTriangle, RefreshCw, ExternalLink, Star, SlidersHorizontal, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { AiDisclaimerStrip } from "@/components/AiDisclaimerStrip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { STOCK_CATALOG, type Market } from "@/data/stockCatalog";
import { useWatchlist } from "@/hooks/useWatchlist";

interface Pick {
  symbol: string; name?: string; market?: string; confidence: number;
  rationale: string; bullThesis: string[]; risks: string[];
  price?: number; ret1M?: number; ret3M?: number; ret6M?: number; ret1Y?: number;
  rsi?: number; volatility?: number; trendUp?: boolean;
  sector?: string; dividendYield?: number; maxDrawdown?: number;
}

const SECTORS = [
  "All", "Technology", "Financial Services", "Healthcare", "Consumer Cyclical",
  "Consumer Defensive", "Industrials", "Energy", "Utilities",
  "Communication Services", "Real Estate", "Basic Materials",
];

const SmartPicks = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { toggle, isWatched } = useWatchlist();

  const [market, setMarket] = useState<Market | "All">("All");
  const [risk, setRisk] = useState("balanced");
  const [horizon, setHorizon] = useState("medium");
  const [sector, setSector] = useState<string>("All");
  const [minDividendYield, setMinDividendYield] = useState<string>("");
  const [maxVolatility, setMaxVolatility] = useState<string>("");
  const [maxDrawdown, setMaxDrawdown] = useState<string>("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [commentary, setCommentary] = useState("");
  const [analyzed, setAnalyzed] = useState(0);
  const [filtersApplied, setFiltersApplied] = useState<string[]>([]);

  const generate = async () => {
    setLoading(true);
    setPicks([]);
    setCommentary("");
    setFiltersApplied([]);
    // Build candidate list: a representative subset per market (≤25)
    const pool = market === "All"
      ? STOCK_CATALOG.filter(c => ["AAPL","MSFT","NVDA","GOOGL","META","AMZN","TSLA","AVGO","BRK-B","JPM","V","LLY","XOM","ASML.AS","MC.PA","SAP.DE","NESN.SW","NOVO-B.CO","ENEL.MI","RACE.MI","STM.MI","SPY","QQQ","VWCE.DE","EUNL.DE"].includes(c.symbol))
      : STOCK_CATALOG.filter(c => c.market === market);
    const candidates = pool.slice(0, 25).map(c => ({ symbol: c.symbol, name: c.name, market: c.market }));
    const filters: Record<string, unknown> = {};
    if (sector && sector !== "All") filters.sector = sector;
    const mdy = parseFloat(minDividendYield); if (!isNaN(mdy)) filters.minDividendYield = mdy;
    const mv = parseFloat(maxVolatility); if (!isNaN(mv)) filters.maxVolatility = mv;
    const mdd = parseFloat(maxDrawdown); if (!isNaN(mdd)) filters.maxDrawdown = mdd;
    try {
      const { data, error } = await supabase.functions.invoke("smart-picks", {
        body: { candidates, riskProfile: risk, horizon, topN: 6, filters },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setPicks((data as any).picks || []);
      setCommentary((data as any).marketCommentary || "");
      setAnalyzed((data as any).analyzed || 0);
      setFiltersApplied(((data as any).filtersApplied as string[]) || []);
    } catch (e: any) {
      toast({ title: "Could not generate picks", description: e?.message || "Try again later", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setSector("All"); setMinDividendYield(""); setMaxVolatility(""); setMaxDrawdown("");
  };

  const activeFilterCount =
    (sector !== "All" ? 1 : 0) +
    (minDividendYield ? 1 : 0) +
    (maxVolatility ? 1 : 0) +
    (maxDrawdown ? 1 : 0);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="AI Smart Picks — Algorithmic Stock Recommendations" description="Discover AI-curated stock picks across markets with conviction scores, risk flags, and supporting fundamental and technical signals." path="/picks" />
      <TopNav />
      <main>

      <div className="container mx-auto px-6 py-8">
        <PageHeader
          icon={Sparkles}
          title="AI-Powered Picks"
          description="Ranked opportunities combining momentum, trend, RSI, volatility and AI judgement."
        />
        <AiDisclaimerStrip variant="ai" />

        <Card className="mb-8 card-gradient border-border">
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Pick a market, your risk profile, and time horizon.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Market</Label>
                <Select value={market} onValueChange={(v) => setMarket(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="FTSE MIB">FTSE MIB</SelectItem>
                    <SelectItem value="Europe">Europe</SelectItem>
                    <SelectItem value="NASDAQ">NASDAQ</SelectItem>
                    <SelectItem value="S&P 500">S&amp;P 500</SelectItem>
                    <SelectItem value="ETF">ETF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Risk Profile</Label>
                <Select value={risk} onValueChange={setRisk}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conservative">Conservative</SelectItem>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="aggressive">Aggressive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Horizon</Label>
                <Select value={horizon} onValueChange={setHorizon}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short (1-3 months)</SelectItem>
                    <SelectItem value="medium">Medium (3-12 months)</SelectItem>
                    <SelectItem value="long">Long (1-3 years)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={generate} disabled={loading} className="w-full gap-2">
                  {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {loading ? "Analyzing…" : "Generate Picks"}
                </Button>
              </div>
            </div>

            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="mt-6">
              <div className="flex items-center justify-between">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <SlidersHorizontal className="h-4 w-4" />
                    Advanced filters
                    {activeFilterCount > 0 && <Badge variant="secondary">{activeFilterCount}</Badge>}
                    <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={resetFilters}>Reset</Button>
                )}
              </div>
              <CollapsibleContent className="mt-4">
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Sector</Label>
                    <Select value={sector} onValueChange={setSector}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sp-min-yield">Min dividend yield (%)</Label>
                    <Input id="sp-min-yield" type="number" inputMode="decimal" placeholder="e.g. 2" value={minDividendYield} onChange={e => setMinDividendYield(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sp-max-vol">Max volatility (% ann.)</Label>
                    <Input id="sp-max-vol" type="number" inputMode="decimal" placeholder="e.g. 35" value={maxVolatility} onChange={e => setMaxVolatility(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sp-max-dd">Max drawdown (%)</Label>
                    <Input id="sp-max-dd" type="number" inputMode="decimal" placeholder="e.g. 25" value={maxDrawdown} onChange={e => setMaxDrawdown(e.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Filters narrow the candidate pool before ranking. Dividend yield and sector are sourced from fundamentals; volatility and drawdown are computed from the last 12 months of price data.
                </p>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        {loading && (
          <Card className="p-12 text-center card-gradient border-border">
            <RefreshCw className="h-10 w-10 text-primary mx-auto mb-4 animate-spin" />
            <p className="text-muted-foreground">Fetching market data and running AI analysis across candidates…</p>
          </Card>
        )}

        {!loading && picks.length === 0 && (
          <Card className="p-12 text-center card-gradient border-border">
            <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No picks yet</h3>
            <p className="text-muted-foreground">Choose your preferences above and tap Generate Picks.</p>
          </Card>
        )}

        {commentary && (
          <Card className="mb-6 card-gradient border-border">
            <CardHeader><CardTitle className="text-lg">Market Commentary</CardTitle></CardHeader>
            <CardContent>
              <p className="text-foreground">{commentary}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Analyzed {analyzed} candidates
                {filtersApplied.length > 0 && <> · Filters: {filtersApplied.join(", ")}</>}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {picks.map((p, idx) => (
            <Card key={p.symbol} className="card-gradient border-border hover:shadow-lg transition-all">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">#{idx + 1}</Badge>
                      <CardTitle>{p.symbol}</CardTitle>
                      {p.market && <Badge>{p.market}</Badge>}
                    </div>
                    <CardDescription>{p.name}</CardDescription>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => toggle(p.symbol, p.name || p.symbol)}>
                    <Star className={`h-5 w-5 ${isWatched(p.symbol) ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-muted-foreground">AI Confidence</span>
                    <span className="font-semibold">{Math.round(p.confidence)}/100</span>
                  </div>
                  <Progress value={p.confidence} className="h-2" />
                </div>

                <p className="text-sm text-foreground">{p.rationale}</p>

                {(p.price !== undefined) && (
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div><p className="text-muted-foreground">Price</p><p className="font-semibold">{p.price}</p></div>
                    <div><p className="text-muted-foreground">1M</p><p className={`font-semibold ${(p.ret1M||0) >= 0 ? "text-success" : "text-destructive"}`}>{(p.ret1M||0).toFixed(1)}%</p></div>
                    <div><p className="text-muted-foreground">6M</p><p className={`font-semibold ${(p.ret6M||0) >= 0 ? "text-success" : "text-destructive"}`}>{(p.ret6M||0).toFixed(1)}%</p></div>
                    <div><p className="text-muted-foreground">RSI</p><p className="font-semibold">{p.rsi}</p></div>
                  </div>
                )}

                <div>
                  <p className="text-sm font-semibold flex items-center gap-1 mb-1"><TrendingUp className="h-3 w-3 text-success" /> Bull Thesis</p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
                    {p.bullThesis.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-semibold flex items-center gap-1 mb-1"><AlertTriangle className="h-3 w-3 text-destructive" /> Risks</p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
                    {p.risks.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => navigate(`/stock/${encodeURIComponent(p.symbol)}`)}>
                    Details <ExternalLink className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/sentiment?symbol=${encodeURIComponent(p.symbol)}`)}>
                    Sentiment
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/backtest?symbol=${encodeURIComponent(p.symbol)}`)}>
                    Backtest
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {picks.length > 0 && (
          <p className="text-xs text-muted-foreground text-center mt-8 max-w-2xl mx-auto">
            These picks are generated by AI from technical signals and recent price action. They are for educational purposes only and do not constitute financial advice.
          </p>
        )}
      </div>
    </main>
    </div>
  );
};

export default SmartPicks;