import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Activity, Plus, TrendingUp, TrendingDown, X, Briefcase, Cloud, Check, ChevronsUpDown } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useToast } from "@/hooks/use-toast";
import { PortfolioPerformanceChart } from "@/components/PortfolioPerformanceChart";
import type { HistoryRange } from "@/hooks/useHistoricalPrices";
import { AuthButton } from "@/components/AuthButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { STOCK_CATALOG, currencySign } from "@/data/stockCatalog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface PortfolioStock {
  symbol: string;
  name: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
}

const STORAGE_KEY = "portfolio_holdings";

const readLocal = (): PortfolioStock[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const Portfolio = () => {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const migratedRef = useRef(false);
  const [portfolio, setPortfolio] = useState<PortfolioStock[]>(() => {
    const local = readLocal();
    return local.length
      ? local
      : [
          { symbol: "ENEL", name: "Enel", shares: 100, avgPrice: 6.20, currentPrice: 6.45 },
          { symbol: "UCG", name: "UniCredit", shares: 50, avgPrice: 35.50, currentPrice: 38.92 },
        ];
  });

  // Mirror to localStorage so Backtest "portfolio" mode keeps working
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
  }, [portfolio]);

  // Cloud sync (load + migrate on first login)
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      migratedRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      if (!migratedRef.current) {
        migratedRef.current = true;
        const local = readLocal();
        if (local.length) {
          await supabase.from("portfolio_holdings").upsert(
            local.map((s) => ({
              user_id: user.id, symbol: s.symbol, name: s.name,
              shares: s.shares, avg_price: s.avgPrice,
            })),
            { onConflict: "user_id,symbol", ignoreDuplicates: true }
          );
        }
      }
      const { data } = await supabase
        .from("portfolio_holdings")
        .select("symbol,name,shares,avg_price")
        .order("created_at", { ascending: true });
      if (cancelled || !data) return;
      const next: PortfolioStock[] = data.map((r) => ({
        symbol: r.symbol, name: r.name,
        shares: Number(r.shares), avgPrice: Number(r.avg_price),
        currentPrice: Number(r.avg_price),
      }));
      setPortfolio(next);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  // Realtime updates from other devices
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`pf-${user.id}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "portfolio_holdings", filter: `user_id=eq.${user.id}` },
      async () => {
        const { data } = await supabase
          .from("portfolio_holdings")
          .select("symbol,name,shares,avg_price")
          .order("created_at", { ascending: true });
        if (!data) return;
        setPortfolio(data.map((r) => ({
          symbol: r.symbol, name: r.name,
          shares: Number(r.shares), avgPrice: Number(r.avg_price),
          currentPrice: Number(r.avg_price),
        })));
      }
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [range, setRange] = useState<HistoryRange>("1M");
  const [newStock, setNewStock] = useState({
    symbol: "",
    name: "",
    shares: "",
    avgPrice: "",
  });
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const selectedCatalog = STOCK_CATALOG.find((s) => s.symbol === newStock.symbol);

  const toggleAddForm = () => {
    const shouldOpen = !showAddForm;
    setShowAddForm(shouldOpen);
    setSymbolPickerOpen(shouldOpen);
  };

  const closeAddForm = () => {
    setShowAddForm(false);
    setSymbolPickerOpen(false);
  };

  const handleAddStock = () => {
    if (!newStock.symbol || !newStock.shares || !newStock.avgPrice) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    const stockInfo = STOCK_CATALOG.find(s => s.symbol === newStock.symbol);
    if (!stockInfo) {
      toast({
        title: "Stock Not Found",
        description: "Please select a valid stock symbol",
        variant: "destructive",
      });
      return;
    }

    const avg = parseFloat(newStock.avgPrice);
    const added: PortfolioStock = {
      symbol: newStock.symbol,
      name: stockInfo.name,
      shares: parseFloat(newStock.shares),
      avgPrice: avg,
      currentPrice: avg,
    };
    setPortfolio([...portfolio, added]);
    if (user) {
      supabase.from("portfolio_holdings").upsert({
        user_id: user.id, symbol: added.symbol, name: added.name,
        shares: added.shares, avg_price: added.avgPrice,
      }, { onConflict: "user_id,symbol" }).then();
    }

    setNewStock({ symbol: "", name: "", shares: "", avgPrice: "" });
    closeAddForm();
    
    toast({
      title: "Stock Added",
      description: `${stockInfo.name} added to your portfolio`,
    });
  };

  const handleRemoveStock = (symbol: string) => {
    setPortfolio(portfolio.filter(stock => stock.symbol !== symbol));
    if (user) {
      supabase.from("portfolio_holdings").delete().eq("user_id", user.id).eq("symbol", symbol).then();
    }
    toast({
      title: "Stock Removed",
      description: "Stock removed from your portfolio",
    });
  };

  const calculateGainLoss = (stock: PortfolioStock) => {
    const totalValue = stock.shares * stock.currentPrice;
    const totalCost = stock.shares * stock.avgPrice;
    const gain = totalValue - totalCost;
    const gainPercent = ((gain / totalCost) * 100);
    return { gain, gainPercent, totalValue, totalCost };
  };

  const portfolioTotal = portfolio.reduce((sum, stock) => {
    const { totalValue } = calculateGainLoss(stock);
    return sum + totalValue;
  }, 0);

  const portfolioGain = portfolio.reduce((sum, stock) => {
    const { gain } = calculateGainLoss(stock);
    return sum + gain;
  }, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-2">
              <Activity className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold text-gradient">FTSE MIB Analytics</span>
            </Link>
            <div className="flex items-center space-x-6">
              <NavLink to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Dashboard
              </NavLink>
              <NavLink to="/sentiment" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Sentiment
              </NavLink>
              <NavLink to="/backtest" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Backtest
              </NavLink>
              <NavLink to="/picks" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                AI Picks
              </NavLink>
              <NavLink to="/portfolio" className="text-sm font-medium text-foreground transition-colors hover:text-primary" activeClassName="text-primary">
                Portfolio
              </NavLink>
              <NavLink to="/watchlist" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Watchlist
              </NavLink>
              <AuthButton />
            </div>
          </div>
        </div>
      </nav>

      {/* Portfolio Header */}
      <section className="container mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <Briefcase className="h-8 w-8 text-primary" />
              My Portfolio
            </h1>
            <p className="text-muted-foreground flex items-center gap-2">
              Track your FTSE MIB investments
              {user ? (
                <Badge variant="outline" className="gap-1 text-success border-success/30"><Cloud className="h-3 w-3" /> Synced</Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-muted-foreground">Local only · <Link to="/auth" className="text-primary hover:underline">Sign in</Link> to sync</Badge>
              )}
            </p>
          </div>
          <Button onClick={toggleAddForm} className="gap-2 hover-scale">
            <Plus className="h-4 w-4" />
            Add Stock
          </Button>
        </div>

        {/* Portfolio Summary */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card className="p-6 card-gradient border-border">
            <p className="text-sm text-muted-foreground mb-1">Total Value</p>
            <p className="text-3xl font-bold text-foreground">€{portfolioTotal.toFixed(2)}</p>
          </Card>
          <Card className="p-6 card-gradient border-border">
            <p className="text-sm text-muted-foreground mb-1">Total Gain/Loss</p>
            <div className="flex items-center gap-2">
              <p className={`text-3xl font-bold ${portfolioGain >= 0 ? 'text-success' : 'text-destructive'}`}>
                €{portfolioGain.toFixed(2)}
              </p>
              {portfolioGain >= 0 ? (
                <TrendingUp className="h-6 w-6 text-success" />
              ) : (
                <TrendingDown className="h-6 w-6 text-destructive" />
              )}
            </div>
          </Card>
          <Card className="p-6 card-gradient border-border">
            <p className="text-sm text-muted-foreground mb-1">Holdings</p>
            <p className="text-3xl font-bold text-foreground">{portfolio.length}</p>
          </Card>
        </div>

        {/* Performance Chart */}
        <PortfolioPerformanceChart
          holdings={portfolio.map((p) => ({ symbol: p.symbol, shares: p.shares, avgPrice: p.avgPrice }))}
          range={range}
          onRangeChange={setRange}
        />

        {/* Add Stock Form */}
        {showAddForm && (
          <Card className="p-6 mb-8 card-gradient border-border animate-fade-in">
            <h3 className="text-lg font-semibold mb-4">Add New Stock</h3>
            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Symbol</label>
                <Popover open={symbolPickerOpen} onOpenChange={setSymbolPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={symbolPickerOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {selectedCatalog
                          ? `${selectedCatalog.symbol} — ${selectedCatalog.name}`
                          : "Search stock or ETF…"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command
                      filter={(value, search) =>
                        value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                      }
                    >
                      <CommandInput placeholder="Search by symbol, name, or market…" />
                      <CommandList>
                        <CommandEmpty>No instrument found.</CommandEmpty>
                        <CommandGroup>
                          {STOCK_CATALOG.map((stock) => (
                            <CommandItem
                              key={stock.symbol}
                              value={`${stock.symbol} ${stock.name} ${stock.market}`}
                              onSelect={() => {
                                setNewStock({ ...newStock, symbol: stock.symbol, name: stock.name });
                                setSymbolPickerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  newStock.symbol === stock.symbol ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">{stock.symbol}</span>
                                  <Badge variant="outline" className="text-[10px]">{stock.market}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">{stock.name}</p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Shares</label>
                <Input
                  type="number"
                  placeholder="100"
                  value={newStock.shares}
                  onChange={(e) => setNewStock({ ...newStock, shares: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Avg Price {selectedCatalog ? `(${currencySign(selectedCatalog.currency).trim() || selectedCatalog.currency})` : ""}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="6.20"
                  value={newStock.avgPrice}
                  onChange={(e) => setNewStock({ ...newStock, avgPrice: e.target.value })}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={handleAddStock} className="flex-1">Add</Button>
                <Button variant="outline" onClick={closeAddForm}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        {/* Portfolio Holdings */}
        <div className="space-y-4">
          {portfolio.length === 0 ? (
            <Card className="p-12 text-center card-gradient border-border">
              <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No stocks in portfolio</h3>
              <p className="text-muted-foreground mb-4">Start building your portfolio by adding stocks</p>
              <Button onClick={() => { setShowAddForm(true); setSymbolPickerOpen(true); }} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Your First Stock
              </Button>
            </Card>
          ) : (
            portfolio.map((stock) => {
              const { gain, gainPercent, totalValue, totalCost } = calculateGainLoss(stock);
              const isPositive = gain >= 0;

              return (
                <Card key={stock.symbol} className="p-6 card-gradient border-border hover:shadow-lg transition-all duration-300">
                  <div className="flex items-start justify-between">
                    <Link to={`/stock/${stock.symbol}`} className="flex-1 hover:opacity-80 transition-opacity">
                      <div className="flex items-center gap-4 mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-foreground">{stock.symbol}</h3>
                          <p className="text-sm text-muted-foreground">{stock.name}</p>
                        </div>
                        <Badge variant={isPositive ? "default" : "destructive"} className={isPositive ? "bg-success/10 text-success" : ""}>
                          {isPositive ? "+" : ""}{gainPercent.toFixed(2)}%
                        </Badge>
                      </div>

                      <div className="grid md:grid-cols-5 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground mb-1">Shares</p>
                          <p className="font-semibold text-foreground">{stock.shares}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Avg Price</p>
                          <p className="font-semibold text-foreground">€{stock.avgPrice.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Current Price</p>
                          <p className="font-semibold text-foreground">€{stock.currentPrice.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Total Value</p>
                          <p className="font-semibold text-foreground">€{totalValue.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Gain/Loss</p>
                          <p className={`font-semibold ${isPositive ? 'text-success' : 'text-destructive'}`}>
                            €{gain.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </Link>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveStock(stock.symbol)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};

export default Portfolio;
