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

  const baseStocks = [
    { symbol: "ENEL", name: "Enel", price: 6.42, change: 2.4, volume: "15.2M" },
    { symbol: "ENI", name: "Eni", price: 14.28, change: -0.8, volume: "8.7M" },
    { symbol: "ISP", name: "Intesa Sanpaolo", price: 3.45, change: 1.2, volume: "42.1M" },
    { symbol: "UCG", name: "UniCredit", price: 38.92, change: 3.1, volume: "11.4M" },
    { symbol: "TIT", name: "Telecom Italia", price: 0.23, change: -1.5, volume: "95.3M" },
    { symbol: "STM", name: "STMicroelectronics", price: 42.15, change: 3.8, volume: "7.2M" },
    { symbol: "TEN", name: "Tenaris", price: 15.67, change: 1.9, volume: "3.8M" },
    { symbol: "LDO", name: "Leonardo", price: 23.45, change: 2.1, volume: "4.5M" },
  ];

  const symbols = useMemo(() => baseStocks.map((s) => s.symbol), []);
  const { quotes, loading, error, lastUpdated, refresh } = useLiveQuotes(symbols, 30000);

  const allStocks = baseStocks.map((s) => {
    const q = quotes[s.symbol];
    if (!q) return s;
    return {
      ...s,
      price: q.price,
      change: Math.round(q.change * 100) / 100,
    };
  });

  const filteredStocks = searchQuery
    ? allStocks.filter(stock => 
        stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stock.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allStocks.slice(0, 4);

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
            FTSE MIB Stock Analysis
            <span className="block text-gradient mt-2">Powered by AI & Fundamentals</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Comprehensive fundamental analysis combined with real-time sentiment tracking for Italy's top 40 stocks
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
            onClick={() => navigate('/stock/ENEL.MI')}
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
                ? `Live FTSE MIB quotes via Yahoo Finance${updatedLabel ? ` · updated ${updatedLabel}` : ""}`
                : "Real-time data from FTSE MIB components"}
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
