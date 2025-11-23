import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, BarChart3, LineChart, Activity, Brain, Target, Shield } from "lucide-react";
import { StockCard } from "@/components/StockCard";
import { MetricCard } from "@/components/MetricCard";
import { NavLink } from "@/components/NavLink";

const Index = () => {
  const featuredStocks = [
    { symbol: "ENEL.MI", name: "Enel", price: 6.42, change: 2.4, volume: "15.2M" },
    { symbol: "ENI.MI", name: "Eni", price: 14.28, change: -0.8, volume: "8.7M" },
    { symbol: "ISP.MI", name: "Intesa Sanpaolo", price: 3.45, change: 1.2, volume: "42.1M" },
    { symbol: "UCG.MI", name: "UniCredit", price: 38.92, change: 3.1, volume: "11.4M" },
  ];

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
              <NavLink to="/" className="text-sm font-medium text-foreground transition-colors" activeClassName="text-primary">
                Dashboard
              </NavLink>
              <NavLink to="/sentiment" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Sentiment
              </NavLink>
              <NavLink to="/backtest" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Backtest
              </NavLink>
              <Button variant="default" size="sm">
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
            <Button size="lg" className="gap-2">
              <Target className="h-5 w-5" />
              Start Analysis
            </Button>
            <Button size="lg" variant="outline" className="gap-2">
              <BarChart3 className="h-5 w-5" />
              View Dashboard
            </Button>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="container mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-6 animate-slide-up">
          <Card className="p-6 card-gradient border-border hover:shadow-lg transition-all duration-300">
            <div className="rounded-lg bg-primary/10 w-12 h-12 flex items-center justify-center mb-4">
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Fundamental Analysis</h3>
            <p className="text-muted-foreground text-sm">
              Deep dive into 40+ financial metrics including P/E, ROE, FCF, and DCF valuations
            </p>
          </Card>

          <Card className="p-6 card-gradient border-border hover:shadow-lg transition-all duration-300">
            <div className="rounded-lg bg-secondary/10 w-12 h-12 flex items-center justify-center mb-4">
              <LineChart className="h-6 w-6 text-secondary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Sentiment Tracking</h3>
            <p className="text-muted-foreground text-sm">
              Real-time sentiment analysis from financial news, social media, and market reports
            </p>
          </Card>

          <Card className="p-6 card-gradient border-border hover:shadow-lg transition-all duration-300">
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
      <section className="container mx-auto px-6 py-16">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Market Overview</h2>
          <p className="text-muted-foreground">Real-time data from FTSE MIB components</p>
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
          {featuredStocks.map((stock) => (
            <StockCard key={stock.symbol} stock={stock} />
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-6 py-20">
        <Card className="p-12 text-center card-gradient border-border">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Trading Smarter?</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Get instant access to comprehensive analysis tools, real-time data, and AI-powered insights
          </p>
          <Button size="lg" className="gap-2">
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
