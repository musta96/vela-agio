import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TrendingUp, TrendingDown, BarChart3, LineChart, Activity, Brain, Target, Shield, Search, Briefcase, RefreshCw, Radio } from "lucide-react";
import { StockCard } from "@/components/StockCard";
import { MetricCard } from "@/components/MetricCard";
import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { STOCK_CATALOG, searchCatalog, type Market } from "@/data/stockCatalog";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const scrollToStocks = () => {
    const stocksSection = document.getElementById('stocks');
    stocksSection?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSignIn = () => {
    toast({
      title: "Sign In Coming Soon",
      description: "Authentication feature will be available soon!",
    });
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [activeMarket, setActiveMarket] = useState<Market | "All">("All");

  const MARKETS: (Market | "All")[] = ["All", "FTSE MIB", "Europe", "NASDAQ", "S&P 500", "ETF"];

  // Featured tickers per market (kept small so we don't request 200+ live quotes at once)
  const featuredPerMarket: Record<Market | "All", string[]> = {
    All: ["ENEL.MI", "RACE.MI", "ASML.AS", "MC.PA", "AAPL", "MSFT", "NVDA", "SPY"],
    "FTSE MIB": ["ENEL.MI", "ENI.MI", "ISP.MI", "UCG.MI", "RACE.MI", "STLAM.MI", "STM.MI", "G.MI"],
    Europe: ["ASML.AS", "MC.PA", "SAP.DE", "NESN.SW", "NOVO-B.CO", "AZN.L", "SHEL.L", "SAN.MC"],
    NASDAQ: ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "AVGO"],
    "S&P 500": ["BRK-B", "JPM", "V", "JNJ", "XOM", "WMT", "LLY", "HD"],
    ETF: ["SPY", "QQQ", "VOO", "VTI", "VWCE.DE", "EUNL.DE", "GLD", "TLT"],
  };

  // Determine which catalog entries to show: search overrides everything;
  // otherwise show featured tickers for the active market.
  const displayedEntries = useMemo(() => {
    if (searchQuery.trim()) return searchCatalog(searchQuery, 24);
    const symbols = featuredPerMarket[activeMarket];
    return symbols
      .map((s) => STOCK_CATALOG.find((c) => c.symbol === s))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, activeMarket]);

  const quotedSymbols = useMemo(() => displayedEntries.map((e) => e.symbol), [displayedEntries]);
  const { quotes, loading, error, lastUpdated, refresh } = useLiveQuotes(quotedSymbols, 30000);

  const filteredStocks = displayedEntries.map((entry) => {
    const q = quotes[entry.symbol];
    return {
      symbol: entry.symbol,
      name: entry.name,
      market: entry.market,
      currency: q?.currency || entry.currency,
      price: q?.price ?? 0,
      change: q ? Math.round(q.change * 100) / 100 : 0,
    };
  });

  const isLive = Object.keys(quotes).length > 0;
  const updatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString()
    : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold text-gradient">FTSE MIB Analytics</span>
            </div>
            <div className="flex items-center space-x-6">
              <NavLink to="/" className="text-sm font-medium text-foreground transition-colors hover:text-primary" activeClassName="text-primary">
                Dashboard
              </NavLink>
              <NavLink to="/sentiment" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover:text-primary">
                Sentiment
              </NavLink>
              <NavLink to="/backtest" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover:text-primary">
                Backtest
              </NavLink>
              <NavLink to="/portfolio" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover:text-primary">
                Portfolio
              </NavLink>
              <NavLink to="/watchlist" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover:text-primary">
                Watchlist
              </NavLink>
              <NavLink to="/picks" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover:text-primary">
                AI Picks
              </NavLink>
              <Button variant="default" size="sm" className="gap-2 hover-scale" onClick={handleSignIn}>
                <Briefcase className="h-4 w-4" />
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-20">
        <div className="max-w-4xl mx-auto text-center animate-fade-in">
          <Badge className="mb-4 bg-primary/10 text-primary hover:bg-primary/20">
            Advanced Trading Analytics
          </Badge>
          <h1 className="text-5xl font-bold mb-6 leading-tight">
            Global Stock Analysis
            <span className="block text-gradient mt-2">Powered by AI & Fundamentals</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Real-time quotes and fundamental analysis across FTSE MIB, European blue chips, NASDAQ, S&P 500 and major ETFs
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" className="gap-2 hover-scale" onClick={() => navigate('/backtest')}>
              <Target className="h-5 w-5" />
              Start Analysis
            </Button>
            <Button size="lg" variant="outline" className="gap-2 hover-scale" onClick={scrollToStocks}>
              <BarChart3 className="h-5 w-5" />
              View Dashboard
            </Button>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="container mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-6 animate-slide-up">
          <Card 
            className="p-6 card-gradient border-border hover:shadow-lg hover:scale-105 transition-all duration-300 cursor-pointer"
            onClick={() => navigate('/stock/' + encodeURIComponent('AAPL'))}
          >
            <div className="rounded-lg bg-primary/10 w-12 h-12 flex items-center justify-center mb-4">
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Fundamental Analysis</h3>
            <p className="text-muted-foreground text-sm">
              Deep dive into 40+ financial metrics including P/E, ROE, FCF, and DCF valuations
            </p>
          </Card>

          <Card 
            className="p-6 card-gradient border-border hover:shadow-lg hover:scale-105 transition-all duration-300 cursor-pointer"
            onClick={() => navigate('/sentiment')}
          >
            <div className="rounded-lg bg-secondary/10 w-12 h-12 flex items-center justify-center mb-4">
              <LineChart className="h-6 w-6 text-secondary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Sentiment Tracking</h3>
            <p className="text-muted-foreground text-sm">
              Real-time sentiment analysis from financial news, social media, and market reports
            </p>
          </Card>

          <Card 
            className="p-6 card-gradient border-border hover:shadow-lg hover:scale-105 transition-all duration-300 cursor-pointer"
            onClick={() => navigate('/backtest')}
          >
            <div className="rounded-lg bg-accent/10 w-12 h-12 flex items-center justify-center mb-4">
              <Shield className="h-6 w-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Risk Management</h3>
            <p className="text-muted-foreground text-sm">
              Advanced backtesting with comprehensive risk metrics and portfolio optimization
            </p>
          </Card>
        </div>
      </section>

      {/* Market Overview */}
      <section id="stocks" className="container mx-auto px-6 py-16">
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-3xl font-bold">Market Overview</h2>
              {isLive ? (
                <Badge className="bg-success/10 text-success hover:bg-success/20 gap-1">
                  <Radio className="h-3 w-3 animate-pulse" />
                  LIVE
                </Badge>
              ) : loading ? (
                <Badge variant="secondary" className="gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Loading
                </Badge>
              ) : error ? (
                <Badge variant="destructive">Offline</Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground">
              {isLive
                ? `Live quotes via Yahoo Finance${updatedLabel ? ` · updated ${updatedLabel}` : ""}`
                : "Real-time quotes across global markets"}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-96">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search stocks by symbol or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                refresh();
                toast({ title: "Refreshing prices", description: "Fetching latest quotes…" });
              }}
              disabled={loading}
              title="Refresh prices"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Market filter */}
        {!searchQuery.trim() && (
          <div className="flex flex-wrap gap-2 mb-6">
            {MARKETS.map((m) => (
              <Button
                key={m}
                size="sm"
                variant={activeMarket === m ? "default" : "outline"}
                onClick={() => setActiveMarket(m)}
                className="hover-scale"
              >
                {m}
              </Button>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <MetricCard
            title="Market Cap"
            value="€582.4B"
            change={1.8}
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <MetricCard
            title="Trading Volume"
            value="€2.1B"
            change={-3.2}
            icon={<Activity className="h-5 w-5" />}
          />
          <MetricCard
            title="Avg P/E Ratio"
            value="12.4"
            change={0.5}
            icon={<BarChart3 className="h-5 w-5" />}
          />
          <MetricCard
            title="Index Level"
            value="33,428"
            change={2.1}
            icon={<LineChart className="h-5 w-5" />}
          />
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredStocks.length > 0 ? (
            filteredStocks.map((stock) => (
              <StockCard key={stock.symbol} stock={stock} />
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-muted-foreground">No stocks found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-6 py-20">
        <Card className="p-12 text-center card-gradient border-border">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Trading Smarter?</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Get instant access to comprehensive analysis tools, real-time data, and AI-powered insights
          </p>
          <Button size="lg" className="gap-2 hover-scale" onClick={() => navigate('/backtest')}>
            Get Started Free
            <TrendingUp className="h-5 w-5" />
          </Button>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-primary" />
              <span className="font-semibold">FTSE MIB Analytics</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 Trading Analytics Platform. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
