import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Activity, Plus, TrendingUp, TrendingDown, X, Briefcase, Cloud, Check, ChevronsUpDown, FileDown } from "lucide-react";
import { Pencil, Settings as SettingsIcon, FlaskConical, FolderPlus, Trash2, Copy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generatePortfolioReport } from "@/lib/pdfReports";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { useToast } from "@/hooks/use-toast";
import { PortfolioPerformanceChart } from "@/components/PortfolioPerformanceChart";
import { PortfolioInsights } from "@/components/PortfolioInsights";
import type { HistoryRange } from "@/hooks/useHistoricalPrices";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { STOCK_CATALOG, currencySign, findCatalogEntry } from "@/data/stockCatalog";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { usePortfolios } from "@/hooks/usePortfolios";
import { PortfolioSimulator } from "@/components/PortfolioSimulator";

interface PortfolioStock {
  symbol: string;
  name: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  currency: string;
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
  const { portfolios, active, activeId, setActiveId, create: createPortfolio, update: updatePortfolio, remove: removePortfolio } = usePortfolios();
  const migratedRef = useRef(false);
  const [portfolio, setPortfolio] = useState<PortfolioStock[]>(() => {
    const local = readLocal();
    return local.length
      ? local.map((s) => ({ ...s, currency: s.currency || findCatalogEntry(s.symbol)?.currency || "EUR" }))
      : [
          { symbol: "ENEL", name: "Enel", shares: 100, avgPrice: 6.20, currentPrice: 6.45, currency: "EUR" },
          { symbol: "UCG", name: "UniCredit", shares: 50, avgPrice: 35.50, currentPrice: 38.92, currency: "EUR" },
        ];
  });

  // Mirror to localStorage so Backtest "portfolio" mode keeps working
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
  }, [portfolio]);

  // Cloud sync (load + migrate on first login)
  useEffect(() => {
    if (authLoading) return;
    if (!user || !activeId) {
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
              user_id: user.id, portfolio_id: activeId, symbol: s.symbol, name: s.name,
              shares: s.shares, avg_price: s.avgPrice,
              currency: (s as any).currency || findCatalogEntry(s.symbol)?.currency || "EUR",
            })) as any,
            { onConflict: "portfolio_id,symbol", ignoreDuplicates: true }
          );
        }
      }
      const { data } = await supabase
        .from("portfolio_holdings")
        .select("symbol,name,shares,avg_price,currency")
        .eq("portfolio_id", activeId)
        .order("created_at", { ascending: true });
      if (cancelled || !data) return;
      const next: PortfolioStock[] = data.map((r: any) => ({
        symbol: r.symbol, name: r.name,
        shares: Number(r.shares), avgPrice: Number(r.avg_price),
        currentPrice: Number(r.avg_price),
        currency: r.currency || findCatalogEntry(r.symbol)?.currency || "EUR",
      }));
      setPortfolio(next);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, activeId]);

  // Realtime updates from other devices
  useEffect(() => {
    if (!user || !activeId) return;
    const ch = supabase.channel(`pf-${activeId}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "portfolio_holdings", filter: `portfolio_id=eq.${activeId}` },
      async () => {
        const { data } = await supabase
          .from("portfolio_holdings")
          .select("symbol,name,shares,avg_price,currency")
          .eq("portfolio_id", activeId)
          .order("created_at", { ascending: true });
        if (!data) return;
        setPortfolio(data.map((r: any) => ({
          symbol: r.symbol, name: r.name,
          shares: Number(r.shares), avgPrice: Number(r.avg_price),
          currentPrice: Number(r.avg_price),
          currency: r.currency || findCatalogEntry(r.symbol)?.currency || "EUR",
        })));
      }
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, activeId]);

  // === Live quotes: merge real market prices into currentPrice ===
  const symbols = useMemo(() => portfolio.map((p) => p.symbol), [portfolio]);
  const { quotes } = useLiveQuotes(symbols);
  const liveSig = symbols.map((s) => quotes[s]?.price).join(",");
  useEffect(() => {
    if (!Object.keys(quotes).length) return;
    setPortfolio((prev) => prev.map((p) => {
      const q = quotes[p.symbol];
      return q?.price ? { ...p, currentPrice: q.price, currency: q.currency || p.currency } : p;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSig]);

  // === FX rates so totals can be expressed in EUR ===
  const currencies = useMemo(
    () => Array.from(new Set(portfolio.map((p) => p.currency).filter((c) => c && c !== "EUR"))).sort(),
    [portfolio]
  );
  const fxKey = currencies.join(",");
  const [fxRates, setFxRates] = useState<Record<string, number>>({ EUR: 1 });
  useEffect(() => {
    if (!currencies.length) { setFxRates({ EUR: 1 }); return; }
    let cancelled = false;
    (async () => {
      const next: Record<string, number> = { EUR: 1 };
      await Promise.all(currencies.map(async (cur) => {
        try {
          const { data } = await supabase.functions.invoke("market-data", {
            body: { action: "fx", pair: `${cur}EUR` },
          });
          const rate = data?.rate?.rate;
          if (rate) next[cur] = rate;
        } catch { /* ignore */ }
      }));
      if (!cancelled) setFxRates(next);
    })();
    return () => { cancelled = true; };
  }, [fxKey]);

  const toEur = (amount: number, currency: string) =>
    amount * (fxRates[currency] ?? (currency === "EUR" ? 1 : 1));
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [range, setRange] = useState<HistoryRange>("1M");
  const [newStock, setNewStock] = useState({
    symbol: "",
    name: "",
    shares: "",
    avgPrice: "",
  });
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState("");
  const selectedCatalog = STOCK_CATALOG.find((s) => s.symbol === newStock.symbol);

  const filteredCatalog = useMemo(() => {
    const query = symbolSearch.trim().toLowerCase();
    if (!query) return STOCK_CATALOG;
    return STOCK_CATALOG.filter((stock) =>
      `${stock.symbol} ${stock.name} ${stock.market}`.toLowerCase().includes(query)
    );
  }, [symbolSearch]);

  const toggleAddForm = () => {
    const shouldOpen = !showAddForm;
    console.log("[Portfolio] toggleAddForm clicked", { from: showAddForm, to: shouldOpen });
    setShowAddForm(shouldOpen);
    setSymbolPickerOpen(shouldOpen);
  };

  const closeAddForm = () => {
    console.log("[Portfolio] closeAddForm");
    setShowAddForm(false);
    setSymbolPickerOpen(false);
  };

  const handleAddStock = async () => {
    console.log("[Portfolio] handleAddStock invoked", { newStock, hasUser: !!user });
    const missing: string[] = [];
    if (!newStock.symbol) missing.push("symbol");
    if (!newStock.shares) missing.push("shares");
    if (!newStock.avgPrice) missing.push("average price");
    if (missing.length > 0) {
      console.warn("[Portfolio] handleAddStock missing fields", missing);
      toast({
        title: "Missing required fields",
        description: `Please fill in: ${missing.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }

    const stockInfo = STOCK_CATALOG.find(s => s.symbol === newStock.symbol);
    if (!stockInfo) {
      console.warn("[Portfolio] handleAddStock invalid symbol", newStock.symbol);
      toast({
        title: "Invalid symbol",
        description: `"${newStock.symbol}" was not found in the catalog. Pick one from the list.`,
        variant: "destructive",
      });
      return;
    }

    const sharesNum = parseFloat(newStock.shares);
    const avg = parseFloat(newStock.avgPrice);
    if (!Number.isFinite(sharesNum) || sharesNum <= 0) {
      console.warn("[Portfolio] handleAddStock invalid shares", newStock.shares);
      toast({
        title: "Invalid shares",
        description: "Shares must be a number greater than 0.",
        variant: "destructive",
      });
      return;
    }
    if (!Number.isFinite(avg) || avg <= 0) {
      console.warn("[Portfolio] handleAddStock invalid avgPrice", newStock.avgPrice);
      toast({
        title: "Invalid average price",
        description: "Average price must be a number greater than 0.",
        variant: "destructive",
      });
      return;
    }

    const added: PortfolioStock = {
      symbol: newStock.symbol,
      name: stockInfo.name,
      shares: sharesNum,
      avgPrice: avg,
      currentPrice: avg,
      currency: stockInfo.currency || "EUR",
    };

    if (user && activeId) {
      console.log("[Portfolio] handleAddStock syncing to backend", added);
      const { error } = await supabase.from("portfolio_holdings").upsert({
        user_id: user.id, portfolio_id: activeId, symbol: added.symbol, name: added.name,
        shares: added.shares, avg_price: added.avgPrice, currency: added.currency,
      } as any, { onConflict: "portfolio_id,symbol" });
      if (error) {
        console.error("[Portfolio] handleAddStock backend upsert failed", error);
        toast({
          title: "Couldn't save stock",
          description: error.message || "Failed to sync to your account. Please try again.",
          variant: "destructive",
        });
        return;
      }
      console.log("[Portfolio] handleAddStock backend upsert ok");
    }

    console.log("[Portfolio] handleAddStock success — appending to portfolio", added);
    setPortfolio([...portfolio, added]);
    setNewStock({ symbol: "", name: "", shares: "", avgPrice: "" });
    setSymbolSearch("");
    closeAddForm();

    toast({
      title: "Stock Added",
      description: `${stockInfo.name} added to your portfolio`,
    });
  };

  const handleRemoveStock = (symbol: string) => {
    setPortfolio(portfolio.filter(stock => stock.symbol !== symbol));
    if (user && activeId) {
      supabase.from("portfolio_holdings").delete().eq("portfolio_id", activeId).eq("symbol", symbol).then();
    }
    toast({
      title: "Stock Removed",
      description: "Stock removed from your portfolio",
    });
  };

  // === Edit holding ===
  const [editing, setEditing] = useState<PortfolioStock | null>(null);
  const [editShares, setEditShares] = useState("");
  const [editAvg, setEditAvg] = useState("");
  const [txnSide, setTxnSide] = useState<"buy" | "sell">("buy");
  const [txnShares, setTxnShares] = useState("");
  const [txnPrice, setTxnPrice] = useState("");

  const openEdit = (stock: PortfolioStock) => {
    setEditing(stock);
    setEditShares(String(stock.shares));
    setEditAvg(String(stock.avgPrice));
    setTxnSide("buy");
    setTxnShares("");
    setTxnPrice(String(stock.currentPrice || stock.avgPrice));
  };

  const persistEdit = async (symbol: string, shares: number, avgPrice: number) => {
    if (user && activeId) {
      const { error } = await supabase.from("portfolio_holdings").upsert({
        user_id: user.id, portfolio_id: activeId, symbol, name: editing?.name || symbol,
        shares, avg_price: avgPrice, currency: editing?.currency || "EUR",
      } as any, { onConflict: "portfolio_id,symbol" });
      if (error) {
        toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
        return false;
      }
    }
    setPortfolio((prev) => prev.map((p) => p.symbol === symbol ? { ...p, shares, avgPrice } : p));
    return true;
  };

  const handleSaveDirect = async () => {
    if (!editing) return;
    const sh = parseFloat(editShares);
    const av = parseFloat(editAvg);
    if (!Number.isFinite(sh) || sh <= 0 || !Number.isFinite(av) || av <= 0) {
      toast({ title: "Invalid values", variant: "destructive" });
      return;
    }
    if (await persistEdit(editing.symbol, sh, av)) {
      toast({ title: "Holding updated" });
      setEditing(null);
    }
  };

  const handleApplyTxn = async () => {
    if (!editing) return;
    const ts = parseFloat(txnShares);
    const tp = parseFloat(txnPrice);
    if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(tp) || tp <= 0) {
      toast({ title: "Invalid transaction", variant: "destructive" });
      return;
    }
    let newShares: number, newAvg: number;
    if (txnSide === "buy") {
      newShares = editing.shares + ts;
      newAvg = (editing.shares * editing.avgPrice + ts * tp) / newShares;
    } else {
      if (ts > editing.shares) {
        toast({ title: "Cannot sell more than you hold", variant: "destructive" });
        return;
      }
      newShares = editing.shares - ts;
      newAvg = editing.avgPrice; // average cost unchanged on partial sell
      if (newShares === 0) {
        if (user && activeId) await supabase.from("portfolio_holdings").delete().eq("portfolio_id", activeId).eq("symbol", editing.symbol);
        setPortfolio((prev) => prev.filter((p) => p.symbol !== editing.symbol));
        toast({ title: "Position closed" });
        setEditing(null);
        return;
      }
    }
    if (await persistEdit(editing.symbol, newShares, newAvg)) {
      toast({ title: txnSide === "buy" ? "Bought more" : "Sold", description: `New avg: ${editing.currency} ${newAvg.toFixed(4)}` });
      setEditing(null);
    }
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
    return sum + toEur(totalValue, stock.currency);
  }, 0);

  const portfolioGain = portfolio.reduce((sum, stock) => {
    const { gain } = calculateGainLoss(stock);
    return sum + toEur(gain, stock.currency);
  }, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <SEO title="Portfolio Tracker — Live P/L, Allocation & Risk Insights" description="Track your stock portfolio with live prices, P/L, allocation breakdown, sector exposure, and AI-driven risk insights." path="/portfolio" />
      <TopNav />
      <main>

      {/* Portfolio Header */}
      <section className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2 flex items-center gap-3">
              <Briefcase className="h-8 w-8 text-primary" />
              My Portfolio
            </h1>
            <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm sm:text-base">
              Track your FTSE MIB investments
              {user ? (
                <Badge variant="outline" className="gap-1 text-success border-success/30"><Cloud className="h-3 w-3" /> Synced</Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-muted-foreground">Local only · <Link to="/auth" className="text-primary hover:underline">Sign in</Link> to sync</Badge>
              )}
            </p>
          </div>
          <Button
            onClick={(e) => {
              console.log("[Portfolio] Add Stock button click event", { target: e.target });
              toggleAddForm();
            }}
            size="lg"
            className="gap-2 hover-scale w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Add Stock
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="gap-2 w-full sm:w-auto"
            disabled={portfolio.length === 0}
            onClick={() => {
              generatePortfolioReport({
                holdings: portfolio.map((p) => ({
                  symbol: p.symbol,
                  name: p.name,
                  shares: p.shares,
                  avgPrice: p.avgPrice,
                  currentPrice: p.currentPrice,
                })),
              });
              toast({ title: "PDF report generated" });
            }}
          >
            <FileDown className="h-4 w-4" /> Export PDF
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

        <PortfolioInsights holdings={portfolio} />

        {/* Add Stock Form */}
        {showAddForm && (
          <Card className="p-4 sm:p-6 mb-8 card-gradient border-border animate-fade-in">
            <h3 className="text-lg font-semibold mb-4">Add New Stock</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <label className="text-sm text-muted-foreground mb-2 block">Symbol</label>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={symbolPickerOpen}
                  className="w-full justify-between font-normal pointer-events-auto h-11"
                  onClick={() => {
                    console.log("[Portfolio] symbol picker toggle", { wasOpen: symbolPickerOpen });
                    setSymbolPickerOpen((open) => !open);
                  }}
                >
                  <span className="truncate">
                    {selectedCatalog
                      ? `${selectedCatalog.symbol} — ${selectedCatalog.name}`
                      : "Search stock or ETF…"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
                {symbolPickerOpen && (
                  <div className="absolute left-0 top-full z-[60] mt-2 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-lg pointer-events-auto">
                    <Input
                      autoFocus
                      value={symbolSearch}
                      onChange={(e) => setSymbolSearch(e.target.value)}
                      placeholder="Search by symbol, name, or market…"
                      className="rounded-b-none border-0 border-b border-border focus-visible:ring-0 focus-visible:ring-offset-0 h-11 text-base"
                    />
                    <div className="max-h-[60vh] sm:max-h-72 overflow-y-auto overscroll-contain p-1">
                      {filteredCatalog.length === 0 ? (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">No instrument found.</p>
                      ) : (
                        filteredCatalog.map((stock) => (
                          <button
                            key={stock.symbol}
                            type="button"
                            className="flex w-full items-center rounded-sm px-3 py-3 min-h-[44px] text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground active:bg-accent pointer-events-auto"
                            onClick={() => {
                              console.log("[Portfolio] symbol option clicked", stock.symbol);
                              setNewStock({ ...newStock, symbol: stock.symbol, name: stock.name });
                              setSymbolSearch("");
                              setSymbolPickerOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${newStock.symbol === stock.symbol ? "opacity-100" : "opacity-0"}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{stock.symbol}</span>
                                <Badge variant="outline" className="text-[10px]">{stock.market}</Badge>
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{stock.name}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="portfolio-shares" className="text-sm text-muted-foreground mb-2 block">Shares</label>
                <Input
                  id="portfolio-shares"
                  type="number"
                  inputMode="decimal"
                  className="h-11 text-base"
                  placeholder="100"
                  value={newStock.shares}
                  onChange={(e) => setNewStock({ ...newStock, shares: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="portfolio-avg-price" className="text-sm text-muted-foreground mb-2 block">
                  Avg Price {selectedCatalog ? `(${currencySign(selectedCatalog.currency).trim() || selectedCatalog.currency})` : ""}
                </label>
                <Input
                  id="portfolio-avg-price"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className="h-11 text-base"
                  placeholder="6.20"
                  value={newStock.avgPrice}
                  onChange={(e) => setNewStock({ ...newStock, avgPrice: e.target.value })}
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-end gap-2">
                <Button variant="outline" size="lg" onClick={closeAddForm} className="sm:w-auto">Cancel</Button>
                <Button
                  onClick={() => {
                    console.log("[Portfolio] Add (submit) button clicked");
                    handleAddStock();
                  }}
                  size="lg"
                  className="flex-1"
                >
                  Add
                </Button>
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
              const sym = currencySign(stock.currency);
              const totalValueEur = toEur(totalValue, stock.currency);
              const isForeign = stock.currency && stock.currency !== "EUR";

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
                        {isForeign && <Badge variant="outline" className="text-xs">{stock.currency}</Badge>}
                      </div>

                      <div className="grid md:grid-cols-5 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground mb-1">Shares</p>
                          <p className="font-semibold text-foreground">{stock.shares}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Avg Price</p>
                          <p className="font-semibold text-foreground">{sym}{stock.avgPrice.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Current Price</p>
                          <p className="font-semibold text-foreground">{sym}{stock.currentPrice.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Total Value</p>
                          <p className="font-semibold text-foreground">{sym}{totalValue.toFixed(2)}</p>
                          {isForeign && <p className="text-xs text-muted-foreground">≈ €{totalValueEur.toFixed(2)}</p>}
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Gain/Loss</p>
                          <p className={`font-semibold ${isPositive ? 'text-success' : 'text-destructive'}`}>
                            {sym}{gain.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </Link>
                    
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(stock)}
                        className="text-muted-foreground hover:text-primary"
                        title="Edit / Buy / Sell"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveStock(stock.symbol)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Remove"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </section>

      {/* Edit holding dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editing?.symbol} — {editing?.name}</DialogTitle>
            <DialogDescription>
              Update values directly, or record a buy/sell transaction to auto-recompute your average price.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <Tabs defaultValue="txn" className="w-full">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="txn">Buy / Sell</TabsTrigger>
                <TabsTrigger value="direct">Edit values</TabsTrigger>
              </TabsList>
              <TabsContent value="txn" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={txnSide === "buy" ? "default" : "outline"} onClick={() => setTxnSide("buy")}>Buy more</Button>
                  <Button variant={txnSide === "sell" ? "default" : "outline"} onClick={() => setTxnSide("sell")}>Sell</Button>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Shares</label>
                  <Input type="number" inputMode="decimal" value={txnShares} onChange={(e) => setTxnShares(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">
                    Price per share ({currencySign(editing.currency).trim() || editing.currency})
                  </label>
                  <Input type="number" inputMode="decimal" step="0.0001" value={txnPrice} onChange={(e) => setTxnPrice(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Current: {editing.shares} shares @ avg {currencySign(editing.currency)}{editing.avgPrice.toFixed(4)}
                </p>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button onClick={handleApplyTxn}>Apply {txnSide === "buy" ? "buy" : "sell"}</Button>
                </DialogFooter>
              </TabsContent>
              <TabsContent value="direct" className="space-y-4 pt-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Shares</label>
                  <Input type="number" inputMode="decimal" value={editShares} onChange={(e) => setEditShares(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">
                    Avg price ({currencySign(editing.currency).trim() || editing.currency})
                  </label>
                  <Input type="number" inputMode="decimal" step="0.0001" value={editAvg} onChange={(e) => setEditAvg(e.target.value)} />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button onClick={handleSaveDirect}>Save</Button>
                </DialogFooter>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </main>
    </div>
  );
};

export default Portfolio;
