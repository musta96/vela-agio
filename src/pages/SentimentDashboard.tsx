import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NavLink } from "@/components/NavLink";
import { Activity, MessageSquare, Search, RefreshCw, ExternalLink, TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { STOCK_CATALOG, searchCatalog } from "@/data/stockCatalog";
import { useSearchParams } from "react-router-dom";

interface Article {
  title: string; link: string; source: string; pubDate: string;
  description?: string; sentiment: "positive" | "neutral" | "negative"; score: number;
}
interface SentimentResult {
  symbol: string; score: number; label: string; summary: string;
  drivers: { title: string; impact: "positive" | "negative" | "neutral" }[];
  articles: Article[];
  sources?: { source: string; avgScore: number; count: number }[];
  generatedAt?: string;
}

const sentimentTone = (s: string) => {
  if (s === "positive") return "bg-success/10 text-success border-success/20";
  if (s === "negative") return "bg-destructive/10 text-destructive border-destructive/20";
  return "bg-muted text-muted-foreground border-border";
};

const SentimentDashboard = () => {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const initial = params.get("symbol") || "";
  const [query, setQuery] = useState(initial);
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(
    initial ? STOCK_CATALOG.find(c => c.symbol === initial) ?? { symbol: initial, name: initial } : null
  );
  const [result, setResult] = useState<SentimentResult | null>(null);
  const [loading, setLoading] = useState(false);

  const suggestions = useMemo(() => (query && !selected ? searchCatalog(query, 8) : []), [query, selected]);

  const analyze = async (sym: string, name: string) => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-sentiment", { body: { symbol: sym, name } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as SentimentResult);
    } catch (e: any) {
      toast({ title: "Sentiment analysis failed", description: e?.message || "Try again later", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (s: { symbol: string; name: string }) => {
    setSelected(s);
    setQuery(s.symbol);
    setParams({ symbol: s.symbol });
    analyze(s.symbol, s.name);
  };

  // Auto-run on first load if URL has symbol
  useEffect(() => {
    if (initial) analyze(initial, selected?.name || initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scoreColor = (s: number) =>
    s >= 65 ? "text-success" : s >= 45 ? "text-foreground" : "text-destructive";

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <Activity className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-gradient">FTSE MIB Analytics</span>
          </Link>
          <div className="flex items-center space-x-6">
            <NavLink to="/" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Dashboard</NavLink>
            <NavLink to="/sentiment" className="text-sm font-medium text-foreground" activeClassName="text-primary">Sentiment</NavLink>
            <NavLink to="/backtest" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Backtest</NavLink>
            <NavLink to="/picks" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">AI Picks</NavLink>
            <NavLink to="/portfolio" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Portfolio</NavLink>
            <NavLink to="/watchlist" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Watchlist</NavLink>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">Sentiment Analysis</h1>
          </div>
          <p className="text-muted-foreground">AI-powered analysis of real news headlines for any stock or ETF</p>
        </div>

        {/* Selector */}
        <Card className="mb-8 card-gradient border-border">
          <CardHeader>
            <CardTitle>Choose a stock or ETF</CardTitle>
            <CardDescription>Search the global catalog. We'll fetch live news and run AI sentiment analysis.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                placeholder="Search by symbol or name (e.g. AAPL, ENEL, ASML)…"
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                className="pl-10"
              />
              {suggestions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-md shadow-lg max-h-64 overflow-auto">
                  {suggestions.map(s => (
                    <button
                      key={s.symbol}
                      className="w-full text-left px-4 py-2 hover:bg-accent/30 flex items-center justify-between"
                      onClick={() => handleSelect(s)}
                    >
                      <span><span className="font-semibold">{s.symbol}</span> <span className="text-muted-foreground">— {s.name}</span></span>
                      <Badge variant="outline">{s.market}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selected && (
              <div className="mt-4 flex items-center gap-2">
                <Badge>{selected.symbol}</Badge>
                <span className="text-sm text-muted-foreground">{selected.name}</span>
                <Button size="sm" variant="outline" className="ml-auto gap-2" disabled={loading} onClick={() => analyze(selected.symbol, selected.name)}>
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Empty state */}
        {!selected && !loading && (
          <Card className="p-12 text-center card-gradient border-border">
            <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Pick a stock to analyze</h3>
            <p className="text-muted-foreground">Sentiment analysis runs on live news headlines from Yahoo Finance.</p>
          </Card>
        )}

        {/* Loading */}
        {loading && (
          <Card className="p-12 text-center card-gradient border-border">
            <RefreshCw className="h-10 w-10 text-primary mx-auto mb-4 animate-spin" />
            <p className="text-muted-foreground">Fetching headlines and running AI analysis…</p>
          </Card>
        )}

        {/* Results */}
        {result && !loading && (
          <>
            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <Card className="card-gradient border-border">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Sentiment Score</CardTitle></CardHeader>
                <CardContent>
                  <div className={`text-5xl font-bold ${scoreColor(result.score)}`}>{Math.round(result.score)}</div>
                  <p className="text-sm text-muted-foreground mt-1 capitalize">{result.label}</p>
                </CardContent>
              </Card>
              <Card className="card-gradient border-border md:col-span-2">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">AI Summary</CardTitle></CardHeader>
                <CardContent><p className="text-foreground">{result.summary || "No summary."}</p></CardContent>
              </Card>
            </div>

            {result.drivers?.length > 0 && (
              <Card className="mb-8 card-gradient border-border">
                <CardHeader><CardTitle>Key Drivers</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-3">
                    {result.drivers.map((d, i) => (
                      <div key={i} className={`p-3 rounded-md border ${sentimentTone(d.impact)} flex items-start gap-2`}>
                        {d.impact === "positive" ? <TrendingUp className="h-4 w-4 mt-0.5" /> : d.impact === "negative" ? <TrendingDown className="h-4 w-4 mt-0.5" /> : <Minus className="h-4 w-4 mt-0.5" />}
                        <span className="text-sm">{d.title}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {result.sources && result.sources.length > 0 && (
              <Card className="card-gradient border-border">
                <CardHeader>
                  <CardTitle>Sentiment by source</CardTitle>
                  <CardDescription>
                    Aggregated from financial news, Reddit, Seeking Alpha and X.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {result.sources.map((s) => {
                      const tone =
                        s.avgScore >= 60
                          ? "border-success/30 bg-success/10 text-success"
                          : s.avgScore <= 40
                          ? "border-destructive/30 bg-destructive/10 text-destructive"
                          : "border-border bg-muted/30 text-muted-foreground";
                      return (
                        <div key={s.source} className={`p-3 rounded-md border ${tone}`}>
                          <p className="text-xs uppercase opacity-80">{s.source}</p>
                          <p className="text-2xl font-bold">{s.avgScore}</p>
                          <p className="text-[10px] opacity-70">{s.count} item{s.count > 1 ? "s" : ""}</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="card-gradient border-border">
              <CardHeader>
                <CardTitle>Mentions & headlines ({result.articles.length})</CardTitle>
                <CardDescription>
                  Sources: Yahoo Finance, Seeking Alpha, Reddit, X · Generated{" "}
                  {result.generatedAt ? new Date(result.generatedAt).toLocaleString() : "now"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {result.articles.map((a, i) => (
                    <a key={i} href={a.link} target="_blank" rel="noopener noreferrer"
                       className="block p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/10 transition-all">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge className={sentimentTone(a.sentiment)}>{a.sentiment} · {Math.round(a.score)}</Badge>
                            <span className="text-xs text-muted-foreground">{a.source}</span>
                            {a.pubDate && <span className="text-xs text-muted-foreground">· {new Date(a.pubDate).toLocaleString()}</span>}
                          </div>
                          <h4 className="font-semibold">{a.title}</h4>
                          {a.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.description}</p>}
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default SentimentDashboard;