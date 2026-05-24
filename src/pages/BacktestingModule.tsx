import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NavLink } from "@/components/NavLink";
import { Activity, Target, Play, Search, X, TrendingUp, TrendingDown, Shield, BarChart3 } from "lucide-react";
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { STOCK_CATALOG, searchCatalog } from "@/data/stockCatalog";

interface Holding { symbol: string; weight: number; name?: string; }
interface BacktestResult {
  strategy: string; range: string; holdings: string[];
  equity: { t: number; value: number; benchmark: number }[];
  trades: { date: string; type: "BUY" | "SELL"; price: number; shares: number }[];
  metrics: {
    finalValue: number; totalReturn: number; benchReturn: number;
    maxDrawdown: number; sharpe: number; winRate: number;
    totalTrades: number; winningTrades: number;
  };
}

const BacktestingModule = () => {
  const { toast } = useToast();
  const [params] = useSearchParams();
  const initialSym = params.get("symbol");

  const [mode, setMode] = useState<"single" | "portfolio">("single");
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    if (initialSym) {
      const meta = STOCK_CATALOG.find(c => c.symbol === initialSym);
      return [{ symbol: initialSym, weight: 1, name: meta?.name }];
    }
    return [];
  });
  const [query, setQuery] = useState("");
  const [strategy, setStrategy] = useState("buy_hold");
  const [range, setRange] = useState("1Y");
  const [initialCapital, setInitialCapital] = useState("100000");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const suggestions = useMemo(() => (query ? searchCatalog(query, 6) : []), [query]);

  // Load portfolio from localStorage if user picks "portfolio" mode
  useEffect(() => {
    if (mode === "portfolio") {
      const stored = localStorage.getItem("portfolio_holdings");
      if (stored) {
        try {
          const arr = JSON.parse(stored);
          if (Array.isArray(arr) && arr.length) {
            const total = arr.reduce((s, h) => s + (h.shares * h.avgPrice), 0) || 1;
            setHoldings(arr.map((h: any) => ({
              symbol: h.symbol, name: h.name,
              weight: (h.shares * h.avgPrice) / total,
            })));
          }
        } catch {}
      }
    }
  }, [mode]);

  const addHolding = (sym: string, name: string) => {
    if (holdings.find(h => h.symbol === sym)) return;
    const next = [...holdings, { symbol: sym, name, weight: 1 }];
    // Equal weight rebalance for single-add convenience
    const equal = 1 / next.length;
    setHoldings(next.map(h => ({ ...h, weight: equal })));
    setQuery("");
  };

  const removeHolding = (sym: string) => {
    const next = holdings.filter(h => h.symbol !== sym);
    const equal = next.length ? 1 / next.length : 0;
    setHoldings(next.map(h => ({ ...h, weight: equal })));
  };

  const runBacktest = async () => {
    if (!holdings.length) {
      toast({ title: "Select at least one symbol", variant: "destructive" });
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("backtest-strategy", {
        body: { holdings: holdings.map(h => ({ symbol: h.symbol, weight: h.weight })), strategy, range, initialCapital: Number(initialCapital) },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as BacktestResult);
    } catch (e: any) {
      toast({ title: "Backtest failed", description: e?.message || "Try again later", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const chartData = result?.equity.map(e => ({ date: new Date(e.t).toLocaleDateString(), Portfolio: Math.round(e.value), Benchmark: Math.round(e.benchmark) })) || [];

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
            <NavLink to="/sentiment" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Sentiment</NavLink>
            <NavLink to="/backtest" className="text-sm font-medium text-foreground" activeClassName="text-primary">Backtest</NavLink>
            <NavLink to="/picks" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">AI Picks</NavLink>
            <NavLink to="/portfolio" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Portfolio</NavLink>
            <NavLink to="/watchlist" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Watchlist</NavLink>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">Strategy Backtesting</h1>
          </div>
          <p className="text-muted-foreground">Test trading strategies on a single stock or your portfolio with real historical data.</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Config */}
          <Card className="card-gradient border-border">
            <CardHeader>
              <CardTitle>Setup</CardTitle>
              <CardDescription>Pick what to backtest, then choose a strategy.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Scope</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant={mode === "single" ? "default" : "outline"} onClick={() => { setMode("single"); setHoldings([]); }}>Single stock</Button>
                  <Button size="sm" variant={mode === "portfolio" ? "default" : "outline"} onClick={() => setMode("portfolio")}>My portfolio</Button>
                </div>
              </div>

              {mode === "single" && (
                <div className="space-y-2">
                  <Label>Add symbol</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="AAPL, ENEL…" className="pl-10" />
                    {suggestions.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-md shadow-lg">
                        {suggestions.map(s => (
                          <button key={s.symbol} className="w-full text-left px-3 py-2 hover:bg-accent/30 text-sm"
                                  onClick={() => addHolding(s.symbol, s.name)}>
                            <span className="font-semibold">{s.symbol}</span> — {s.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {holdings.length > 0 && (
                <div className="space-y-2">
                  <Label>Selected ({holdings.length})</Label>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {holdings.map(h => (
                      <div key={h.symbol} className="flex items-center justify-between p-2 rounded bg-accent/10 text-sm">
                        <span><span className="font-semibold">{h.symbol}</span> <span className="text-muted-foreground">{(h.weight * 100).toFixed(0)}%</span></span>
                        <button onClick={() => removeHolding(h.symbol)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Strategy</Label>
                <Select value={strategy} onValueChange={setStrategy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy_hold">Buy &amp; Hold</SelectItem>
                    <SelectItem value="sma_cross">SMA 20/50 Crossover</SelectItem>
                    <SelectItem value="rsi">RSI Mean Reversion (30/70)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Time Period</Label>
                <Select value={range} onValueChange={setRange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3M">3 Months</SelectItem>
                    <SelectItem value="6M">6 Months</SelectItem>
                    <SelectItem value="1Y">1 Year</SelectItem>
                    <SelectItem value="3Y">3 Years</SelectItem>
                    <SelectItem value="5Y">5 Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Initial Capital</Label>
                <Input type="number" value={initialCapital} onChange={(e) => setInitialCapital(e.target.value)} />
              </div>

              <Button onClick={runBacktest} disabled={running || holdings.length === 0} className="w-full gap-2">
                <Play className="h-4 w-4" /> {running ? "Running…" : "Run Backtest"}
              </Button>
            </CardContent>
          </Card>

          {/* Results */}
          <div className="lg:col-span-2">
            {!result && !running && (
              <Card className="p-12 text-center card-gradient border-border h-full flex flex-col items-center justify-center">
                <Target className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No backtest yet</h3>
                <p className="text-muted-foreground">Select a stock or your portfolio, pick a strategy, then click Run Backtest.</p>
              </Card>
            )}
            {running && (
              <Card className="p-12 text-center card-gradient border-border h-full flex flex-col items-center justify-center">
                <BarChart3 className="h-12 w-12 text-primary mb-4 animate-pulse" />
                <p className="text-muted-foreground">Fetching historical bars and simulating strategy…</p>
              </Card>
            )}
            {result && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="card-gradient border-border">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Strategy Return</p>
                      <p className={`text-2xl font-bold ${result.metrics.totalReturn >= 0 ? "text-success" : "text-destructive"}`}>
                        {result.metrics.totalReturn >= 0 ? "+" : ""}{result.metrics.totalReturn.toFixed(2)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="card-gradient border-border">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Buy &amp; Hold</p>
                      <p className={`text-2xl font-bold ${result.metrics.benchReturn >= 0 ? "text-success" : "text-destructive"}`}>
                        {result.metrics.benchReturn >= 0 ? "+" : ""}{result.metrics.benchReturn.toFixed(2)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="card-gradient border-border">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Sharpe</p>
                      <p className="text-2xl font-bold">{result.metrics.sharpe.toFixed(2)}</p>
                    </CardContent>
                  </Card>
                  <Card className="card-gradient border-border">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Max Drawdown</p>
                      <p className="text-2xl font-bold text-destructive">{result.metrics.maxDrawdown.toFixed(2)}%</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="card-gradient border-border">
                  <CardHeader>
                    <CardTitle>Equity Curve</CardTitle>
                    <CardDescription>Strategy vs Buy &amp; Hold benchmark</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="cP" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="cB" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} minTickGap={40} />
                        <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${fmt(v)}`} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} formatter={(v: number) => fmt(v)} />
                        <Legend />
                        <Area type="monotone" dataKey="Portfolio" stroke="hsl(var(--success))" fill="url(#cP)" strokeWidth={2} />
                        <Area type="monotone" dataKey="Benchmark" stroke="hsl(var(--primary))" fill="url(#cB)" strokeWidth={2} strokeDasharray="5 5" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="card-gradient border-border">
                  <CardHeader>
                    <CardTitle>Trade Log ({result.trades.length})</CardTitle>
                    <CardDescription>Win rate: {result.metrics.winRate.toFixed(0)}% · {result.metrics.winningTrades}/{Math.floor(result.metrics.totalTrades/2)} winning pairs</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {result.trades.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No trades executed by this strategy.</p>
                    ) : (
                      <div className="max-h-72 overflow-auto space-y-1">
                        {result.trades.map((t, i) => (
                          <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50">
                            <div className="flex items-center gap-3">
                              <Badge variant={t.type === "BUY" ? "default" : "secondary"}>{t.type}</Badge>
                              <span className="text-muted-foreground">{t.date}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span>@ {t.price.toFixed(2)}</span>
                              <span className="text-muted-foreground">{t.shares.toFixed(2)} sh</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BacktestingModule;