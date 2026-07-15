import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { AiDisclaimerStrip } from "@/components/AiDisclaimerStrip";
import { Activity, Target, Play, Search, X, TrendingUp, TrendingDown, Shield, BarChart3, Download, FileText, FileSpreadsheet } from "lucide-react";
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { STOCK_CATALOG, searchCatalog } from "@/data/stockCatalog";
import { exportBacktestCsv, exportBacktestPdf } from "@/lib/backtestExport";
import { BacktestQuantPanel } from "@/components/BacktestQuantPanel";
import { decodeQuantParam } from "@/lib/quantShareLink";

interface Holding { symbol: string; weight: number; name?: string; }
interface BacktestResult {
  strategy: string; range: string; holdings: string[];
  benchmark?: string | null; benchmarkLabel?: string;
  equity: { t: number; value: number; benchmark: number }[];
  trades: { date: string; type: "BUY" | "SELL"; price: number; shares: number }[];
  metrics: {
    finalValue: number; totalReturn: number; benchReturn: number;
    maxDrawdown: number; sharpe: number; winRate: number;
    totalTrades: number; winningTrades: number;
  };
}

const BENCHMARKS: { value: string; label: string }[] = [
  { value: "self", label: "Buy & Hold (selected basket)" },
  { value: "FTSEMIB.MI", label: "FTSE MIB (Italy)" },
  { value: "^GSPC", label: "S&P 500" },
  { value: "^NDX", label: "NASDAQ 100" },
  { value: "^IXIC", label: "NASDAQ Composite" },
  { value: "^DJI", label: "Dow Jones" },
  { value: "^STOXX50E", label: "Euro Stoxx 50" },
  { value: "^FTSE", label: "FTSE 100 (UK)" },
  { value: "^GDAXI", label: "DAX (Germany)" },
  { value: "^FCHI", label: "CAC 40 (France)" },
  { value: "^N225", label: "Nikkei 225 (Japan)" },
];

const BacktestingModule = () => {
  const { toast } = useToast();
  const [params] = useSearchParams();
  const initialSym = params.get("symbol");
  const initialQuant = decodeQuantParam(params.get("quant"));
  const initialStrategyId = params.get("strategy_id");

  const [mode, setMode] = useState<"single" | "portfolio">(
    initialQuant?.h && initialQuant.h.length > 1 ? "portfolio" : "single",
  );
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    if (initialQuant?.h && initialQuant.h.length) {
      const total = initialQuant.h.reduce((s, h) => s + (h.weight || 0), 0) || 1;
      return initialQuant.h.map((h) => ({
        symbol: h.symbol,
        name: h.name ?? STOCK_CATALOG.find((c) => c.symbol === h.symbol)?.name,
        weight: (h.weight || 0) / total,
      }));
    }
    if (initialSym) {
      const meta = STOCK_CATALOG.find(c => c.symbol === initialSym);
      return [{ symbol: initialSym, weight: 1, name: meta?.name }];
    }
    return [];
  });
  const [query, setQuery] = useState("");
  const [strategy, setStrategy] = useState(initialQuant?.strategy ?? "buy_hold");
  const [range, setRange] = useState(initialQuant?.range ?? "1Y");
  const [initialCapital, setInitialCapital] = useState("100000");
  const [benchmark, setBenchmark] = useState<string>("self");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [customRules, setCustomRules] = useState<any | null>(null);
  const [customStrategyName, setCustomStrategyName] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => (query ? searchCatalog(query, 6) : []), [query]);

  // Load a saved custom strategy when ?strategy_id=… is present.
  useEffect(() => {
    if (!initialStrategyId) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("trading_strategies")
        .select("*")
        .eq("id", initialStrategyId)
        .maybeSingle();
      if (error || !data) return;
      setCustomStrategyName(data.name);
      setCustomRules({
        entry: data.entry_rules ?? [],
        exit: data.exit_rules ?? [],
        risk: data.risk_config ?? {},
      });
      setStrategy("custom");
      if (data.symbol && !holdings.find((h: any) => h.symbol === data.symbol)) {
        const meta = STOCK_CATALOG.find((c) => c.symbol === data.symbol);
        setHoldings([{ symbol: data.symbol, weight: 1, name: meta?.name ?? data.symbol }]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStrategyId]);

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
        body: {
          holdings: holdings.map(h => ({ symbol: h.symbol, weight: h.weight })),
          strategy, range, initialCapital: Number(initialCapital),
          benchmark: benchmark === "self" ? null : benchmark,
          rules: strategy === "custom" ? customRules : undefined,
        },
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
  const benchLabel = result?.benchmarkLabel
    ? (BENCHMARKS.find(b => b.value === result.benchmarkLabel)?.label || result.benchmarkLabel)
    : (BENCHMARKS.find(b => b.value === benchmark)?.label || "Benchmark");
  const benchShort = result?.benchmark
    ? (BENCHMARKS.find(b => b.value === result.benchmark)?.label.split(" (")[0] || result.benchmark)
    : "Buy & Hold";
  const chartData = result?.equity.map(e => ({ date: new Date(e.t).toLocaleDateString(), Portfolio: Math.round(e.value), [benchShort]: Math.round(e.benchmark) })) || [];

  const captureChartPng = async (): Promise<string | undefined> => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return undefined;
    try {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      const rect = svg.getBoundingClientRect();
      const w = Math.max(rect.width || svg.clientWidth || 800, 400);
      const h = Math.max(rect.height || svg.clientHeight || 320, 200);
      clone.setAttribute("width", String(w));
      clone.setAttribute("height", String(h));
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      // Inline a white background for PDF legibility
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("width", "100%");
      bg.setAttribute("height", "100%");
      bg.setAttribute("fill", "#ffffff");
      clone.insertBefore(bg, clone.firstChild);
      const xml = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.crossOrigin = "anonymous";
      const dataUrl = await new Promise<string>((resolve, reject) => {
        img.onload = () => {
          const scale = 2;
          const canvas = document.createElement("canvas");
          canvas.width = w * scale;
          canvas.height = h * scale;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("no ctx"));
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
      });
      return dataUrl;
    } catch {
      return undefined;
    }
  };

  const handleExportCsv = () => {
    if (!result) return;
    exportBacktestCsv(result);
    toast({ title: "CSV downloaded", description: "Backtest report saved to your device." });
  };

  const handleExportPdf = async () => {
    if (!result) return;
    const chartImg = await captureChartPng();
    exportBacktestPdf(result, chartImg);
    toast({ title: "PDF downloaded", description: "Backtest report saved to your device." });
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO title="Strategy Backtesting - Test Trading Strategies on Historical Data" description="Backtest custom trading strategies on FTSE MIB, EU, and US stocks. Measure returns, drawdown, Sharpe ratio, and benchmark performance." path="/backtest" />
      <PageHeader
          icon={Target}
          title="Strategy Backtesting"
          description="Test trading strategies on a single stock or your portfolio with real historical data."
        />
        <AiDisclaimerStrip variant="data" />

      <div className="grid lg:grid-cols-3 gap-6">
          {/* Config */}
          <Card>
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
                            <span className="font-semibold">{s.symbol}</span> - {s.name}
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
                        <button onClick={() => removeHolding(h.symbol)} aria-label={`Remove ${h.symbol}`} className="text-muted-foreground hover:text-destructive">
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
                <Label>Benchmark</Label>
                <Select value={benchmark} onValueChange={setBenchmark}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BENCHMARKS.map(b => (
                      <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Index used as comparison in the equity chart and KPI cards.</p>
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
              <Card className="p-12 text-center h-full flex flex-col items-center justify-center">
                <Target className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No backtest yet</h3>
                <p className="text-muted-foreground">Select a stock or your portfolio, pick a strategy, then click Run Backtest.</p>
              </Card>
            )}
            {running && (
              <Card className="p-12 text-center h-full flex flex-col items-center justify-center">
                <BarChart3 className="h-12 w-12 text-primary mb-4 animate-pulse" />
                <p className="text-muted-foreground">Fetching historical bars and simulating strategy…</p>
              </Card>
            )}
            {result && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Download className="h-4 w-4" />
                        Export report
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleExportPdf} className="gap-2">
                        <FileText className="h-4 w-4" /> Download PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportCsv} className="gap-2">
                        <FileSpreadsheet className="h-4 w-4" /> Download CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Strategy Return</p>
                      <p className={`text-2xl font-bold ${result.metrics.totalReturn >= 0 ? "text-success" : "text-destructive"}`}>
                        {result.metrics.totalReturn >= 0 ? "+" : ""}{result.metrics.totalReturn.toFixed(2)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground truncate" title={benchLabel}>{benchShort}</p>
                      <p className={`text-2xl font-bold ${result.metrics.benchReturn >= 0 ? "text-success" : "text-destructive"}`}>
                        {result.metrics.benchReturn >= 0 ? "+" : ""}{result.metrics.benchReturn.toFixed(2)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Sharpe</p>
                      <p className="text-2xl font-bold">{result.metrics.sharpe.toFixed(2)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Max Drawdown</p>
                      <p className="text-2xl font-bold text-destructive">{result.metrics.maxDrawdown.toFixed(2)}%</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Equity Curve</CardTitle>
                    <CardDescription>Strategy vs {benchLabel}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div ref={chartRef}>
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
                        <Area type="monotone" dataKey={benchShort} stroke="hsl(var(--primary))" fill="url(#cB)" strokeWidth={2} strokeDasharray="5 5" />
                      </AreaChart>
                    </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
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

                <BacktestQuantPanel
                  equity={result.equity}
                  holdings={holdings}
                  strategy={strategy}
                  range={range}
                />
              </div>
            )}
          </div>
        </div>
    </div>
  );
};

export default BacktestingModule;