import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Activity, Plus, TrendingUp, TrendingDown, X, Briefcase } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useToast } from "@/hooks/use-toast";
import { PortfolioPerformanceChart } from "@/components/PortfolioPerformanceChart";
import type { HistoryRange } from "@/hooks/useHistoricalPrices";

interface PortfolioStock {
  symbol: string;
  name: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
}

const Portfolio = () => {
  const { toast } = useToast();
  const [portfolio, setPortfolio] = useState<PortfolioStock[]>([
    { symbol: "ENEL", name: "Enel", shares: 100, avgPrice: 6.20, currentPrice: 6.45 },
    { symbol: "UCG", name: "UniCredit", shares: 50, avgPrice: 35.50, currentPrice: 38.92 },
  ]);
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [range, setRange] = useState<HistoryRange>("1M");
  const [newStock, setNewStock] = useState({
    symbol: "",
    name: "",
    shares: "",
    avgPrice: "",
  });

  const availableStocks = [
    { symbol: "ENEL", name: "Enel", price: 6.45 },
    { symbol: "ENI", name: "Eni", price: 14.28 },
    { symbol: "ISP", name: "Intesa Sanpaolo", price: 3.45 },
    { symbol: "UCG", name: "UniCredit", price: 38.92 },
    { symbol: "TIT", name: "Telecom Italia", price: 0.23 },
    { symbol: "STM", name: "STMicroelectronics", price: 42.15 },
  ];

  const handleAddStock = () => {
    if (!newStock.symbol || !newStock.shares || !newStock.avgPrice) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    const stockInfo = availableStocks.find(s => s.symbol === newStock.symbol);
    if (!stockInfo) {
      toast({
        title: "Stock Not Found",
        description: "Please select a valid stock symbol",
        variant: "destructive",
      });
      return;
    }

    setPortfolio([...portfolio, {
      symbol: newStock.symbol,
      name: stockInfo.name,
      shares: parseFloat(newStock.shares),
      avgPrice: parseFloat(newStock.avgPrice),
      currentPrice: stockInfo.price,
    }]);

    setNewStock({ symbol: "", name: "", shares: "", avgPrice: "" });
    setShowAddForm(false);
    
    toast({
      title: "Stock Added",
      description: `${stockInfo.name} added to your portfolio`,
    });
  };

  const handleRemoveStock = (symbol: string) => {
    setPortfolio(portfolio.filter(stock => stock.symbol !== symbol));
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
              <NavLink to="/portfolio" className="text-sm font-medium text-foreground transition-colors hover:text-primary" activeClassName="text-primary">
                Portfolio
              </NavLink>
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
            <p className="text-muted-foreground">Track your FTSE MIB investments</p>
          </div>
          <Button onClick={() => setShowAddForm(!showAddForm)} className="gap-2 hover-scale">
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
                <select
                  value={newStock.symbol}
                  onChange={(e) => setNewStock({ ...newStock, symbol: e.target.value })}
                  className="w-full px-3 py-2 rounded-md bg-background border border-border text-foreground"
                >
                  <option value="">Select...</option>
                  {availableStocks.map(stock => (
                    <option key={stock.symbol} value={stock.symbol}>
                      {stock.symbol} - {stock.name}
                    </option>
                  ))}
                </select>
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
                <label className="text-sm text-muted-foreground mb-2 block">Avg Price (€)</label>
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
                <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
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
              <Button onClick={() => setShowAddForm(true)} className="gap-2">
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
