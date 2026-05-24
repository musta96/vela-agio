import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Star, X, TrendingUp, TrendingDown, Radio, RefreshCw, Briefcase } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useToast } from "@/hooks/use-toast";
import { useMemo } from "react";

const Watchlist = () => {
  const { items, remove } = useWatchlist();
  const { toast } = useToast();
  const symbols = useMemo(() => items.map((i) => i.symbol), [items]);
  const { quotes, loading, lastUpdated, refresh } = useLiveQuotes(symbols, 30000);

  const handleRemove = (symbol: string, name: string) => {
    remove(symbol);
    toast({ title: "Removed from watchlist", description: `${symbol} — ${name}` });
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-2">
              <Activity className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold text-gradient">FTSE MIB Analytics</span>
            </Link>
            <div className="flex items-center space-x-6">
              <NavLink to="/" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Dashboard</NavLink>
              <NavLink to="/sentiment" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Sentiment</NavLink>
              <NavLink to="/backtest" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Backtest</NavLink>
              <NavLink to="/picks" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">AI Picks</NavLink>
              <NavLink to="/portfolio" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Portfolio</NavLink>
              <NavLink to="/watchlist" className="text-sm font-medium text-foreground hover:text-primary transition-colors" activeClassName="text-primary">Watchlist</NavLink>
              <Button variant="default" size="sm" className="gap-2 hover-scale">
                <Briefcase className="h-4 w-4" />
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <section className="container mx-auto px-6 py-12">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">My Watchlist</h1>
              {items.length > 0 && symbols.some((s) => quotes[s]) && (
                <Badge className="bg-success/10 text-success gap-1">
                  <Radio className="h-3 w-3 animate-pulse" />
                  LIVE
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {items.length} stock{items.length === 1 ? "" : "s"} tracked
              {lastUpdated ? ` · updated ${new Date(lastUpdated).toLocaleTimeString()}` : ""}
            </p>
          </div>
          {items.length > 0 && (
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <Card className="p-12 text-center card-gradient border-border">
            <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No stocks on your watchlist yet</h2>
            <p className="text-muted-foreground mb-6">
              Browse the dashboard and tap the star icon on any stock to track it here.
            </p>
            <Button asChild>
              <Link to="/">Browse stocks</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => {
              const q = quotes[item.symbol];
              const change = q?.change ?? 0;
              const isPositive = change >= 0;
              return (
                <Card key={item.symbol} className="p-4 card-gradient border-border hover:border-primary/50 transition-all">
                  <div className="flex items-center justify-between gap-4">
                    <Link to={`/stock/${item.symbol}`} className="flex-1 flex items-center gap-4 group">
                      <Star className="h-5 w-5 fill-primary text-primary" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold group-hover:text-primary transition-colors">{item.symbol}</div>
                        <div className="text-sm text-muted-foreground truncate">{item.name}</div>
                      </div>
                      <div className="text-right">
                        {q ? (
                          <>
                            <div className="text-lg font-bold">€{q.price.toFixed(2)}</div>
                            <Badge
                              variant={isPositive ? "default" : "destructive"}
                              className={`gap-1 ${isPositive ? "bg-success/10 text-success hover:bg-success/20" : ""}`}
                            >
                              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {isPositive ? "+" : ""}
                              {change.toFixed(2)}%
                            </Badge>
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">{loading ? "Loading…" : "—"}</div>
                        )}
                      </div>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(item.symbol, item.name)}
                      aria-label="Remove from watchlist"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default Watchlist;