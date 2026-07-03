import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Activity, Plus, TrendingUp, TrendingDown, X, Briefcase, Cloud, Check, ChevronsUpDown, FileDown, FileText, Star } from "lucide-react";
import { Pencil, Settings as SettingsIcon, FlaskConical, FolderPlus, Trash2, Copy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generatePortfolioReport } from "@/lib/pdfReports";
import { generatePortfolioInvestmentMemo, DEFAULT_MEMO_SECTIONS, type MemoSections } from "@/lib/portfolioInvestmentMemoPdf";
import { PortfolioMemoBuilder } from "@/components/PortfolioMemoBuilder";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Settings2 } from "lucide-react";
import { BrokerSyncCard } from "@/components/BrokerSyncCard";
import { SEO } from "@/components/SEO";
import { useToast } from "@/hooks/use-toast";
import { PortfolioPerformanceChart } from "@/components/PortfolioPerformanceChart";
import { PortfolioInsights, type PortfolioAnalytics } from "@/components/PortfolioInsights";
import type { HistoryRange } from "@/hooks/useHistoricalPrices";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { STOCK_CATALOG, currencySign, findCatalogEntry } from "@/data/stockCatalog";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { usePortfolios } from "@/hooks/usePortfolios";
import { PortfolioSimulator } from "@/components/PortfolioSimulator";
import { PortfolioSuggestions } from "@/components/PortfolioSuggestions";
import { ProgressiveHint } from "@/components/onboarding/ProgressiveHint";

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
    if (!Array.isArray(arr)) return [];
    // Drop the legacy ENEL/UCG demo seed if it ever made it into localStorage.
    // Older builds seeded these two rows on first load; new accounts should
    // start empty until the user adds their own holdings.
    const isDemoSeed =
      arr.length === 2 &&
      arr.some((s: any) => s?.symbol === "ENEL" && Number(s?.shares) === 100 && Number(s?.avgPrice) === 6.2) &&
      arr.some((s: any) => s?.symbol === "UCG" && Number(s?.shares) === 50 && Number(s?.avgPrice) === 35.5);
    return isDemoSeed ? [] : arr;
  } catch {
    return [];
  }
};

const Portfolio = () => {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const { portfolios, active, activeId, setActiveId, primaryId, setPrimary, create: createPortfolio, update: updatePortfolio, remove: removePortfolio } = usePortfolios();
  const migratedRef = useRef(false);
  const [memoLoading, setMemoLoading] = useState(false);
  const [strategyMemoOpen, setStrategyMemoOpen] = useState(false);
  // Investment memo configuration (range, sections, MC params).
  const HORIZON_PRESETS = { "3M": 63, "6M": 126, "1Y": 252 } as const;
  type MemoRangeKey = "3M" | "6M" | "1Y" | "Custom";
  const RANGE_TO_MARKET: Record<MemoRangeKey, string> = { "3M": "3mo", "6M": "6mo", "1Y": "1y", "Custom": "1y" };
  const [memoRange, setMemoRange] = useState<MemoRangeKey>("1Y");
  const [memoCustomDays, setMemoCustomDays] = useState<number>(252);
  const [memoPaths, setMemoPaths] = useState<number>(1500);
  const [memoSections, setMemoSections] = useState<MemoSections>(DEFAULT_MEMO_SECTIONS);
  // Multi-select confidence levels for VaR/CVaR.
  const CONF_OPTIONS = [0.90, 0.95, 0.99] as const;
  const [memoConfidences, setMemoConfidences] = useState<number[]>([0.95, 0.99]);
  const [portfolio, setPortfolio] = useState<PortfolioStock[]>(() => {
    const local = readLocal();
    return local.map((s) => ({
      ...s,
      currency: s.currency || findCatalogEntry(s.symbol)?.currency || "EUR",
    }));
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
        // Only migrate real, user-added local rows into the cloud. The legacy
        // demo seed (ENEL + UCG) is already filtered out by readLocal().
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
        // Also purge any previously-migrated demo rows from the cloud so they
        // stop reappearing on every login. Match the exact demo values only
        // so real user holdings in ENEL or UCG are never touched.
        await supabase
          .from("portfolio_holdings")
          .delete()
          .eq("portfolio_id", activeId)
          .eq("symbol", "ENEL")
          .eq("shares", 100)
          .eq("avg_price", 6.2);
        await supabase
          .from("portfolio_holdings")
          .delete()
          .eq("portfolio_id", activeId)
          .eq("symbol", "UCG")
          .eq("shares", 50)
          .eq("avg_price", 35.5);
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
  // Per-holding currency. Defaults from catalog match but can be overridden
  // (e.g. for off-catalog symbols or dual listings).
  const [newCurrency, setNewCurrency] = useState<string>("EUR");
  const [newDisplayName, setNewDisplayName] = useState<string>("");
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState("");
  const selectedCatalog = STOCK_CATALOG.find((s) => s.symbol === newStock.symbol);
  const isCustomSymbol = !!newStock.symbol && !selectedCatalog;

  const filteredCatalog = useMemo(() => {
    const query = symbolSearch.trim().toLowerCase();
    if (!query) return STOCK_CATALOG;
    return STOCK_CATALOG.filter((stock) =>
      `${stock.symbol} ${stock.name} ${stock.market}`.toLowerCase().includes(query)
    );
  }, [symbolSearch]);

  // Live universal symbol search via Yahoo (covers stocks, ETFs, bonds, funds, futures,
  // indices, crypto worldwide). Kicks in after 350ms debounce when ≥2 chars.
  type RemoteResult = { symbol: string; name: string; exchange: string; type: string; currency: string };
  const [remoteResults, setRemoteResults] = useState<RemoteResult[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  useEffect(() => {
    const q = symbolSearch.trim();
    if (q.length < 2) { setRemoteResults([]); return; }
    setRemoteLoading(true);
    const t = setTimeout(async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/symbol-search?q=${encodeURIComponent(q)}`;
        const r = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } });
        const j = await r.json();
        setRemoteResults((j?.results ?? []) as RemoteResult[]);
      } catch { setRemoteResults([]); }
      finally { setRemoteLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [symbolSearch]);

  // Show remote results that aren't already in the local catalog.
  const extraRemote = useMemo(() => {
    const local = new Set(STOCK_CATALOG.map(s => s.symbol.toUpperCase()));
    return remoteResults.filter(r => !local.has(r.symbol.toUpperCase())).slice(0, 15);
  }, [remoteResults]);

  // AI fuzzy resolver: turns "the Invesco blockchain ETF on Milan" into a real Yahoo ticker.
  type AiCandidate = { symbol: string; name: string; exchange?: string; currency?: string; confidence?: number; reason?: string; verified?: boolean };
  const [aiCandidates, setAiCandidates] = useState<AiCandidate[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const askAiToFind = async () => {
    const q = symbolSearch.trim();
    if (!q) return;
    setAiLoading(true); setAiError(null); setAiCandidates([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-symbol-finder`;
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` }),
        },
        body: JSON.stringify({ query: q }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `AI ${r.status}`);
      setAiCandidates((j?.candidates ?? []) as AiCandidate[]);
      if (!j?.candidates?.length) setAiError("No candidates found. Try adding the exchange (e.g. 'on Milan').");
    } catch (e: any) {
      setAiError(e?.message || 'AI lookup failed');
    } finally { setAiLoading(false); }
  };
  // Clear AI candidates when query changes
  useEffect(() => { setAiCandidates([]); setAiError(null); }, [symbolSearch]);

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
    // Custom (off-catalog) symbols are allowed - fall back to user-entered name + currency.
    const resolvedName = stockInfo?.name || newDisplayName.trim() || newStock.symbol;
    const resolvedCurrency = (stockInfo?.currency || newCurrency || "EUR").toUpperCase();
    if (!stockInfo && !newDisplayName.trim()) {
      toast({
        title: "Name required for custom symbol",
        description: `"${newStock.symbol}" isn't in our catalog - please provide a display name and currency.`,
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
      name: resolvedName,
      shares: sharesNum,
      avgPrice: avg,
      currentPrice: avg,
      currency: resolvedCurrency,
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

    console.log("[Portfolio] handleAddStock success - appending to portfolio", added);
    setPortfolio([...portfolio, added]);
    setNewStock({ symbol: "", name: "", shares: "", avgPrice: "" });
    setNewDisplayName("");
    setNewCurrency("EUR");
    setSymbolSearch("");
    closeAddForm();

    toast({
      title: "Stock Added",
      description: `${resolvedName} added to your portfolio`,
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
  const [analytics, setAnalytics] = useState<PortfolioAnalytics | null>(null);

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

  // === Portfolio settings / create dialogs ===
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pfName, setPfName] = useState("");
  const [pfDesc, setPfDesc] = useState("");
  const [pfBase, setPfBase] = useState("EUR");
  const [pfBench, setPfBench] = useState("FTSEMIB.MI");
  const [pfSim, setPfSim] = useState(false);
  useEffect(() => {
    if (active) {
      setPfName(active.name);
      setPfDesc(active.description || "");
      setPfBase(active.base_currency);
      setPfBench(active.benchmark_symbol);
      setPfSim(active.is_simulation);
    }
  }, [active?.id]);

  const [createOpen, setCreateOpen] = useState(false);
  const [newPfName, setNewPfName] = useState("");
  const [newPfBase, setNewPfBase] = useState("EUR");
  const [newPfBench, setNewPfBench] = useState("FTSEMIB.MI");
  const [newPfSim, setNewPfSim] = useState(false);
  const [newPfClone, setNewPfClone] = useState(false);

  const [simOpen, setSimOpen] = useState(false);

  const baseCcy = active?.base_currency || "EUR";
  const baseSign = baseCcy === "USD" ? "$" : baseCcy === "GBP" ? "£" : baseCcy === "EUR" ? "€" : baseCcy + " ";
  // Convert helper using selected base currency (we have EUR rates; for non-EUR base, approximate via cross)
  const toBase = (amount: number, currency: string) => {
    if (currency === baseCcy) return amount;
    const inEur = currency === "EUR" ? amount : amount * (fxRates[currency] ?? 1);
    if (baseCcy === "EUR") return inEur;
    // EUR -> base via inverse rate if available
    const rate = fxRates[baseCcy];
    return rate ? inEur / rate : inEur;
  };
  const totalBase = portfolio.reduce((s, p) => s + toBase(p.shares * p.currentPrice, p.currency), 0);
  const gainBase = portfolio.reduce((s, p) => s + toBase(p.shares * (p.currentPrice - p.avgPrice), p.currency), 0);

  return (
    <div>
      {/* Navigation */}
      <SEO title="Portfolio Tracker - Live P/L, Allocation & Risk Insights" description="Track your stock portfolio with live prices, P/L, allocation breakdown, sector exposure, and AI-driven risk insights." path="/portfolio" />
      <main>

      {/* Portfolio Header */}
      <section className="p-6 sm:p-8">
        <div className="mb-6"><BrokerSyncCard /></div>
        <div className="mb-4">
          <ProgressiveHint
            hintKey="portfolio-first-stress-test"
            when={portfolio.length >= 1 && portfolio.length <= 3}
            title="You've added your first positions — stress-test them."
            body="See how your portfolio would hold up in a 2020-style shock or a rate spike."
            cta={{ to: "/risk", label: "Open Risk Engine" }}
          />
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
          <div className="min-w-0 flex items-start gap-4">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Briefcase className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight leading-tight flex flex-wrap items-center gap-2">
                {active?.name || "My Portfolio"}
                {active?.id && active.id === primaryId && (
                  <Badge variant="outline" className="gap-1 text-warning border-warning/30 bg-warning/10"><Star className="h-3 w-3 fill-current" /> Main</Badge>
                )}
                {active?.is_simulation && (
                  <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10">Simulation</Badge>
                )}
              </h1>
              <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm mt-1">
              {active?.description || "Track your investments"} · base {baseCcy} · benchmark {active?.benchmark_symbol || "-"}
              {user ? (
                <Badge variant="outline" className="gap-1 text-success border-success/30"><Cloud className="h-3 w-3" /> Synced</Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-muted-foreground">Local only · <Link to="/auth" className="text-primary hover:underline">Sign in</Link> to sync</Badge>
              )}
              </p>
            </div>
          </div>

          {/* Portfolio switcher + actions */}
          <div className="flex flex-wrap items-center gap-2">
            {user && portfolios.length > 0 && (
              <Select value={activeId || undefined} onValueChange={(v) => setActiveId(v)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select portfolio" />
                </SelectTrigger>
                <SelectContent>
                  {portfolios.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.is_primary ? "⭐ " : ""}{p.is_simulation ? "🧪 " : ""}{p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {user && active && active.id !== primaryId && (
              <Button
                variant="outline"
                size="icon"
                title="Set as main portfolio (shown on dashboard)"
                onClick={async () => {
                  await setPrimary(active.id);
                  toast({ title: "Main portfolio updated", description: `"${active.name}" is now your main portfolio.` });
                }}
              >
                <Star className="h-4 w-4" />
              </Button>
            )}
            {user && active && active.id === primaryId && (
              <Button variant="outline" size="icon" title="This is your main portfolio" disabled>
                <Star className="h-4 w-4 fill-current text-warning" />
              </Button>
            )}
            {user && (
              <Button variant="outline" size="icon" title="New portfolio" onClick={() => { setNewPfName(""); setNewPfBase("EUR"); setNewPfBench("FTSEMIB.MI"); setNewPfSim(false); setNewPfClone(false); setCreateOpen(true); }}>
                <FolderPlus className="h-4 w-4" />
              </Button>
            )}
            {user && active && (
              <Button variant="outline" size="icon" title="Portfolio settings" onClick={() => setSettingsOpen(true)}>
                <SettingsIcon className="h-4 w-4" />
              </Button>
            )}
            {user && active && (
              <Button variant="outline" size="sm" className="gap-2" title="Run Monte-Carlo simulation" onClick={() => setSimOpen(true)}>
                <FlaskConical className="h-4 w-4" /> Simulate
              </Button>
            )}
            <Button
            onClick={(e) => {
              console.log("[Portfolio] Add Stock button click event", { target: e.target });
              toggleAddForm();
            }}
            size="default"
            className="gap-2 hover-scale"
          >
            <Plus className="h-4 w-4" />
            Add Stock
          </Button>
            <Button
            variant="outline"
            size="default"
            className="gap-2"
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
                analytics,
              });
              toast({ title: "PDF report generated" });
            }}
          >
            <FileDown className="h-4 w-4" /> Export PDF
          </Button>
            <Button
              variant="default"
              size="default"
              className="gap-2"
              disabled={portfolio.length === 0 || memoLoading}
              onClick={async () => {
                setMemoLoading(true);
                toast({ title: "Building investment memo…", description: "Fetching 1Y history for every holding." });
                try {
                  // Build a weighted portfolio equity series by blending per-symbol
                  // historical closes. We share the same `market-data` endpoint as
                  // the performance chart so cached responses are reused.
                  const symbols = portfolio.map((p) => p.symbol);
                  const totalValue = portfolio.reduce((s, p) => s + p.shares * p.currentPrice, 0);
                  const weights = portfolio.map((p) => totalValue > 0 ? (p.shares * p.currentPrice) / totalValue : 1 / portfolio.length);
                  const marketRange = RANGE_TO_MARKET[memoRange];
                  const horizonDays = memoRange === "Custom"
                    ? Math.max(5, Math.min(2520, Math.round(memoCustomDays)))
                    : HORIZON_PRESETS[memoRange];
                  const series = await Promise.all(symbols.map(async (sym) => {
                    try {
                      const { data } = await supabase.functions.invoke("market-data", {
                        body: { action: "ohlc", symbol: sym, range: marketRange, interval: "1d" },
                      });
                      const bars = Array.isArray(data?.bars) ? (data.bars as Array<{ t: number; close: number }>) : [];
                      return bars.filter((b) => Number.isFinite(b.close) && b.close > 0);
                    } catch {
                      return [];
                    }
                  }));
                  // Align on the intersection of timestamps with at least one bar.
                  const tSets = series.map((s) => new Set(s.map((b) => b.t)));
                  const commonTs = tSets.length
                    ? [...tSets[0]].filter((t) => tSets.every((set) => set.has(t))).sort((a, b) => a - b)
                    : [];
                  let equity: { t: number; value: number }[] = [];
                  if (commonTs.length > 20) {
                    // Normalise each symbol's closes to its first available bar, then
                    // blend by weight, scaled back to current portfolio value.
                    const lookup = series.map((bars) => new Map(bars.map((b) => [b.t, b.close])));
                    const firsts = lookup.map((m) => m.get(commonTs[0]) ?? 1);
                    equity = commonTs.map((t) => {
                      const ratio = lookup.reduce(
                        (acc, m, i) => acc + (weights[i] ?? 0) * ((m.get(t) ?? firsts[i]) / firsts[i]),
                        0,
                      );
                      return { t, value: ratio * (totalValue || 1) };
                    });
                  }
                  generatePortfolioInvestmentMemo({
                    portfolioName: active?.name || "Portfolio",
                    currency: active?.base_currency || "EUR",
                    asOf: Date.now(),
                    benchmark: active?.benchmark_symbol ? { label: active.benchmark_symbol } : undefined,
                    holdings: portfolio.map((p, i) => ({
                      symbol: p.symbol,
                      name: p.name,
                      shares: p.shares,
                      avgPrice: p.avgPrice,
                      currentPrice: p.currentPrice,
                      currency: p.currency,
                      value: p.shares * p.currentPrice,
                      weight: weights[i],
                    })),
                    equity: equity.length ? equity : undefined,
                    sections: memoSections,
                    mcConfig: { horizonDays, paths: memoPaths, seed: 42 },
                    confidences: memoConfidences.length ? memoConfidences : [0.95, 0.99],
                    historyLabel: memoRange === "Custom" ? `${horizonDays}d` : memoRange,
                  });
                  toast({ title: "Investment memo generated", description: "Comprehensive portfolio-level PDF saved." });
                } catch (err) {
                  console.error("[Portfolio] memo generation failed", err);
                  toast({ title: "Memo generation failed", description: "Please try again in a moment.", variant: "destructive" });
                } finally {
                  setMemoLoading(false);
                }
              }}
            >
              <FileText className="h-4 w-4" /> {memoLoading ? "Building memo…" : "Investment Memo"}
            </Button>
            <Button
              variant="outline"
              size="default"
              className="gap-2"
              onClick={() => setStrategyMemoOpen(true)}
              title="Compose a strategy memo from a target allocation, thesis, goals and risk profile"
            >
              <FileText className="h-4 w-4" /> Generate Portfolio Memo
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  title="Configure investment memo"
                  disabled={portfolio.length === 0 || memoLoading}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[340px] p-4 space-y-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">Investment memo settings</div>
                  <div className="text-[11px] text-muted-foreground">
                    Controls the historical window and Monte Carlo simulation used in the PDF.
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">History window</Label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["3M","6M","1Y","Custom"] as const).map((k) => (
                      <Button
                        key={k}
                        type="button"
                        size="sm"
                        variant={memoRange === k ? "default" : "outline"}
                        className="h-7 text-xs px-2"
                        onClick={() => setMemoRange(k)}
                      >
                        {k}
                      </Button>
                    ))}
                  </div>
                  {memoRange === "Custom" && (
                    <div className="flex items-center gap-2 pt-1">
                      <Input
                        type="number"
                        min={5}
                        max={2520}
                        value={memoCustomDays}
                        onChange={(e) => setMemoCustomDays(Number(e.target.value) || 252)}
                        className="h-8 text-xs"
                      />
                      <span className="text-[11px] text-muted-foreground">trading days</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Monte Carlo paths</Label>
                    <span className="text-xs font-medium tabular-nums">{memoPaths.toLocaleString()}</span>
                  </div>
                  <Slider
                    min={250}
                    max={5000}
                    step={250}
                    value={[memoPaths]}
                    onValueChange={(v) => setMemoPaths(v[0] ?? 1500)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Confidence levels (VaR/CVaR)</Label>
                  <div className="flex gap-1.5">
                    {CONF_OPTIONS.map((c) => {
                      const on = memoConfidences.includes(c);
                      return (
                        <Button
                          key={c}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          className="h-7 text-xs px-2"
                          onClick={() => setMemoConfidences((prev) => {
                            const next = on ? prev.filter((x) => x !== c) : [...prev, c].sort((a, b) => a - b);
                            return next.length ? next : [0.95];
                          })}
                        >
                          {(c * 100).toFixed(0)}%
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Sections</Label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {([
                      ["executiveSummary", "Executive summary"],
                      ["holdings", "Holdings"],
                      ["allocations", "Allocations & concentration"],
                      ["monteCarlo", "Monte Carlo + Risk metrics"],
                      ["macroScenarios", "Macro scenarios"],
                      ["heatmaps", "Co-movement heatmap"],
                    ] as Array<[keyof MemoSections, string]>).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={memoSections[key]}
                          onCheckedChange={(v) => setMemoSections((prev) => ({ ...prev, [key]: Boolean(v) }))}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <PortfolioMemoBuilder
          open={strategyMemoOpen}
          onOpenChange={setStrategyMemoOpen}
          defaultPortfolioName={active?.name || "Portfolio Strategy"}
          defaultCurrency={active?.base_currency || "EUR"}
          initialAllocation={(() => {
            const total = portfolio.reduce((s, p) => s + p.shares * p.currentPrice, 0);
            if (!portfolio.length || total <= 0) return {};
            const out: Record<string, number> = {};
            for (const p of portfolio) {
              out[p.symbol] = (out[p.symbol] ?? 0) + (p.shares * p.currentPrice) / total;
            }
            return out;
          })()}
        />

        {/* KPI strip - mockup v2 */}
        <div className="bg-card border border-border rounded-2xl dark:bg-[hsl(var(--surface-glass))] dark:backdrop-blur-xl dark:border-[hsl(var(--border-glass))] dark:shadow-[var(--shadow-glass)] divide-y sm:divide-y-0 sm:divide-x divide-border grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 mb-8">
          <div className="p-5 flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Total value</span>
            <div className="text-2xl font-bold tracking-tight">{baseSign}{totalBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <span className="text-[11px] text-muted-foreground">▲ all-time</span>
          </div>
          <div className="p-5 flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Today</span>
            <div className={`text-2xl font-bold tracking-tight ${gainBase >= 0 ? 'text-success' : 'text-destructive'}`}>
              {gainBase >= 0 ? '+' : ''}{baseSign}{Math.abs(gainBase * 0.01).toFixed(2)}
            </div>
            <span className="text-[11px] text-muted-foreground">vs benchmark</span>
          </div>
          <div className="p-5 flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Unrealised gain</span>
            <div className={`text-2xl font-bold tracking-tight ${gainBase >= 0 ? 'text-success' : 'text-destructive'}`}>
              {gainBase >= 0 ? '+' : ''}{baseSign}{gainBase.toFixed(2)}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {portfolio.filter(p => quotes[p.symbol]?.price && p.currentPrice > p.avgPrice).length} winners ·{" "}
              {portfolio.filter(p => quotes[p.symbol]?.price && p.currentPrice < p.avgPrice).length} losers ·{" "}
              {portfolio.filter(p => quotes[p.symbol]?.price && p.currentPrice === p.avgPrice).length} flat ·{" "}
              {portfolio.filter(p => !quotes[p.symbol]?.price).length} no live price
            </span>
          </div>
          <div className="p-5 flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Italian tax (26%)</span>
            <div className="text-2xl font-bold tracking-tight">{baseSign}{Math.max(0, gainBase * 0.26).toFixed(2)}</div>
            <span className="text-[11px] text-muted-foreground">Net after tax {baseSign}{(gainBase - Math.max(0, gainBase * 0.26)).toFixed(2)}</span>
          </div>
          <div className="p-5 flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Holdings</span>
            <div className="text-2xl font-bold tracking-tight">{portfolio.length}</div>
            <span className="text-[11px] text-muted-foreground">across {new Set(portfolio.map(p => p.currency)).size} currencies</span>
          </div>
        </div>

        {/* Performance Chart */}
        <PortfolioPerformanceChart
          holdings={portfolio.map((p) => ({ symbol: p.symbol, shares: p.shares, avgPrice: p.avgPrice }))}
          range={range}
          onRangeChange={setRange}
          liveValue={totalBase}
        />

        <PortfolioInsights holdings={portfolio} onAnalytics={setAnalytics} />

        <PortfolioSuggestions
          portfolioId={activeId}
          portfolioName={active?.name}
          holdings={portfolio.map((p) => ({
            symbol: p.symbol,
            name: p.name,
            shares: p.shares,
            avg_price: p.avgPrice,
          }))}
        />

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
                      ? `${selectedCatalog.symbol} - ${selectedCatalog.name}`
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
                      {filteredCatalog.length === 0 && extraRemote.length === 0 ? (
                        <div className="px-3 py-4 text-sm">
                          <p className="text-muted-foreground mb-3">
                            {remoteLoading ? "Searching global markets…" : "No match found. Use it anyway as a custom symbol:"}
                          </p>
                          {symbolSearch.trim() && (
                            <button
                              type="button"
                              className="flex w-full items-center rounded-sm px-3 py-3 min-h-[44px] text-left text-sm border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors"
                              onClick={() => {
                                const sym = symbolSearch.trim().toUpperCase();
                                setNewStock({ ...newStock, symbol: sym, name: sym });
                                setNewDisplayName("");
                                setNewCurrency(sym.endsWith(".MI") || sym.endsWith(".DE") || sym.endsWith(".PA") || sym.endsWith(".AS") || sym.endsWith(".BR") || sym.endsWith(".MC") ? "EUR" : sym.endsWith(".L") ? "GBP" : sym.endsWith(".SW") ? "CHF" : "USD");
                                setSymbolSearch("");
                                setSymbolPickerOpen(false);
                              }}
                            >
                              <span className="font-semibold mr-2">+ Use</span>
                              <span className="font-mono">{symbolSearch.trim().toUpperCase()}</span>
                              <span className="ml-auto text-[10px] text-muted-foreground">Custom symbol</span>
                            </button>
                          )}
                          <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                            Use Yahoo Finance suffixes: <code>.MI</code> Milan, <code>.DE</code> Xetra,
                            <code>.L</code> London, <code>.PA</code> Paris, <code>.AS</code> Amsterdam,
                            <code>.SW</code> Swiss. Example: <code>1PLTR.MI</code>, <code>BCHN.MI</code>.
                          </p>
                          <div className="mt-3 pt-3 border-t border-border/60">
                            <button
                              type="button"
                              disabled={aiLoading || !symbolSearch.trim()}
                              onClick={askAiToFind}
                              className="flex w-full items-center justify-center rounded-sm px-3 py-2 text-xs font-medium border border-primary/40 bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
                            >
                              {aiLoading ? "AI searching…" : "✨ Ask AI to find this instrument"}
                            </button>
                            {aiError && <p className="text-[11px] text-destructive mt-2">{aiError}</p>}
                            {aiCandidates.length > 0 && (
                              <div className="mt-2 space-y-1">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">AI suggestions</p>
                                {aiCandidates.map((c) => (
                                  <button
                                    key={`ai-${c.symbol}`}
                                    type="button"
                                    className="flex w-full items-center rounded-sm px-3 py-2 text-left text-sm hover:bg-accent transition-colors border border-border/60"
                                    onClick={() => {
                                      setNewStock({ ...newStock, symbol: c.symbol, name: c.name });
                                      setNewCurrency(c.currency || "USD");
                                      setNewDisplayName(c.name);
                                      setSymbolSearch("");
                                      setSymbolPickerOpen(false);
                                      setAiCandidates([]);
                                    }}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono font-semibold">{c.symbol}</span>
                                        {c.exchange && <Badge variant="outline" className="text-[10px]">{c.exchange}</Badge>}
                                        {c.currency && <Badge variant="outline" className="text-[10px]">{c.currency}</Badge>}
                                        {c.verified ? <Badge className="text-[10px]">verified</Badge> : <Badge variant="secondary" className="text-[10px]">unverified</Badge>}
                                        {typeof c.confidence === 'number' && <span className="text-[10px] text-muted-foreground">{Math.round(c.confidence * 100)}%</span>}
                                      </div>
                                      <p className="truncate text-xs text-muted-foreground">{c.name}{c.reason ? ` - ${c.reason}` : ''}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                        {filteredCatalog.map((stock) => (
                          <button
                            key={stock.symbol}
                            type="button"
                            className="flex w-full items-center rounded-sm px-3 py-3 min-h-[44px] text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground active:bg-accent pointer-events-auto"
                            onClick={() => {
                              console.log("[Portfolio] symbol option clicked", stock.symbol);
                              setNewStock({ ...newStock, symbol: stock.symbol, name: stock.name });
                              setNewCurrency(stock.currency);
                              setNewDisplayName("");
                              setSymbolSearch("");
                              setSymbolPickerOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${newStock.symbol === stock.symbol ? "opacity-100" : "opacity-0"}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{stock.symbol}</span>
                                <Badge variant="outline" className="text-[10px]">{stock.market}</Badge>
                                <Badge variant="outline" className="text-[10px]">{stock.currency}</Badge>
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{stock.name}</p>
                            </div>
                          </button>
                        ))}
                        {extraRemote.length > 0 && (
                          <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground border-t border-border/60 mt-1">
                            Global markets {remoteLoading && "(searching…)"}
                          </div>
                        )}
                        {extraRemote.map((r) => (
                          <button
                            key={`r-${r.symbol}`}
                            type="button"
                            className="flex w-full items-center rounded-sm px-3 py-3 min-h-[44px] text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground active:bg-accent pointer-events-auto"
                            onClick={() => {
                              setNewStock({ ...newStock, symbol: r.symbol, name: r.name });
                              setNewCurrency(r.currency || "USD");
                              setNewDisplayName(r.name);
                              setSymbolSearch("");
                              setSymbolPickerOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${newStock.symbol === r.symbol ? "opacity-100" : "opacity-0"}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{r.symbol}</span>
                                {r.exchange && <Badge variant="outline" className="text-[10px]">{r.exchange}</Badge>}
                                {r.type && <Badge variant="outline" className="text-[10px]">{r.type}</Badge>}
                                {r.currency && <Badge variant="outline" className="text-[10px]">{r.currency}</Badge>}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{r.name}</p>
                            </div>
                          </button>
                        ))}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {isCustomSymbol && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Custom symbol <span className="font-mono text-foreground">{newStock.symbol}</span> -
                    please enter a display name. Quote-fetch uses Yahoo Finance.
                  </p>
                  <Input
                    placeholder="e.g. Invesco CoinShares Global Blockchain UCITS"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>
              )}
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
                <label className="text-sm text-muted-foreground mb-2 block">
                  Purchase currency
                </label>
                <Select value={newCurrency} onValueChange={setNewCurrency}>
                  <SelectTrigger className="h-11 text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                    <SelectItem value="GBP">GBP - British Pound</SelectItem>
                    <SelectItem value="GBp">GBp - Pence sterling</SelectItem>
                    <SelectItem value="CHF">CHF - Swiss Franc</SelectItem>
                    <SelectItem value="SEK">SEK - Swedish Krona</SelectItem>
                    <SelectItem value="NOK">NOK - Norwegian Krone</SelectItem>
                    <SelectItem value="DKK">DKK - Danish Krone</SelectItem>
                    <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                    <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                    <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                    <SelectItem value="HKD">HKD - Hong Kong Dollar</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Auto-filled from the catalog; override if you bought on a different exchange.
                </p>
              </div>
              <div>
                <label htmlFor="portfolio-avg-price" className="text-sm text-muted-foreground mb-2 block">
                  Avg Price ({currencySign(newCurrency).trim() || newCurrency})
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

        {/* Bottom row - Allocation / Risk / Italian capital gains (mockup v2) */}
        <div className="grid lg:grid-cols-3 gap-6 mt-8">
          <Card className="p-6 rounded-2xl">
            <h3 className="text-sm font-semibold mb-4">Allocation by sector</h3>
            <div className="space-y-3">
              {(() => {
                const bySector: Record<string, number> = {};
                const SECTOR_MAP: Record<string, string> = {
                  ENEL: "Utilities", UCG: "Financials", ISP: "Financials", G: "Financials",
                  ENI: "Energy", STM: "Technology", RACE: "Consumer", MONC: "Consumer",
                };
                portfolio.forEach((p) => {
                  const sector = SECTOR_MAP[p.symbol] || "Other";
                  bySector[sector] = (bySector[sector] || 0) + toBase(p.shares * p.currentPrice, p.currency);
                });
                const total = Object.values(bySector).reduce((s, v) => s + v, 0) || 1;
                const palette = ["bg-primary", "bg-success", "bg-warning", "bg-accent", "bg-destructive"];
                return Object.entries(bySector).sort((a, b) => b[1] - a[1]).map(([sector, val], i) => {
                  const pct = (val / total) * 100;
                  return (
                    <div key={sector} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${palette[i % palette.length]}`} />
                          {sector}
                        </span>
                        <span className="font-semibold">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${palette[i % palette.length]}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </Card>

          <Card className="p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Risk snapshot</h3>
              <Link to="/risk" className="text-xs text-primary hover:underline">Open Risk Engine →</Link>
            </div>
            <div className="grid grid-cols-2 gap-y-4 gap-x-6">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Volatility (1Y)</div>
                <div className="text-2xl font-bold mt-1">18.2%</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Sharpe</div>
                <div className="text-2xl font-bold mt-1">0.81</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Max drawdown</div>
                <div className="text-2xl font-bold mt-1 text-destructive">-12.4%</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Beta vs FTSEMIB</div>
                <div className="text-2xl font-bold mt-1">1.07</div>
              </div>
            </div>
          </Card>

          <Card className="p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Italian capital gains</h3>
              <span className="inline-flex items-center rounded-full bg-warning/15 text-warning text-[11px] font-semibold px-2.5 py-0.5">26% TUIR</span>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Unrealised gain</span><span className="font-semibold">{baseSign}{gainBase.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax if sold today</span><span className="font-semibold">{baseSign}{Math.max(0, gainBase * 0.26).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Net after tax</span><span className="font-semibold text-success">{baseSign}{(gainBase - Math.max(0, gainBase * 0.26)).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Carry-forward losses</span><span className="font-semibold">{baseSign}0</span></div>
            </div>
            <Link to="/tax" className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/60">
              Open Tax view →
            </Link>
          </Card>
        </div>
      </section>

      {/* Edit holding dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editing?.symbol} - {editing?.name}</DialogTitle>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New portfolio</DialogTitle>
            <DialogDescription>Create a real or simulated portfolio with its own currency and benchmark.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={newPfName} onChange={(e) => setNewPfName(e.target.value)} placeholder="Long-term EU equities" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Base currency</Label>
                <Select value={newPfBase} onValueChange={setNewPfBase}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["EUR","USD","GBP","CHF","JPY"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Benchmark</Label><Input value={newPfBench} onChange={(e) => setNewPfBench(e.target.value)} placeholder="FTSEMIB.MI" /></div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div><Label>Simulation</Label><p className="text-xs text-muted-foreground">Mark as paper-trading / what-if</p></div>
              <Switch checked={newPfSim} onCheckedChange={setNewPfSim} />
            </div>
            {active && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div><Label>Clone from "{active.name}"</Label><p className="text-xs text-muted-foreground">Copy current holdings</p></div>
                <Switch checked={newPfClone} onCheckedChange={setNewPfClone} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!newPfName.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
              const p = await createPortfolio({ name: newPfName.trim(), base_currency: newPfBase, benchmark_symbol: newPfBench, is_simulation: newPfSim, cloneFromId: newPfClone ? activeId || undefined : undefined });
              if (p) { toast({ title: "Portfolio created" }); setCreateOpen(false); }
              else toast({ title: "Couldn't create portfolio", variant: "destructive" });
            }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Portfolio settings</DialogTitle></DialogHeader>
          {active && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={pfName} onChange={(e) => setPfName(e.target.value)} /></div>
              <div><Label>Description</Label><Input value={pfDesc} onChange={(e) => setPfDesc(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Base currency</Label>
                  <Select value={pfBase} onValueChange={setPfBase}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["EUR","USD","GBP","CHF","JPY"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Benchmark</Label><Input value={pfBench} onChange={(e) => setPfBench(e.target.value)} /></div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div><Label>Simulation portfolio</Label><p className="text-xs text-muted-foreground">Excluded from real totals</p></div>
                <Switch checked={pfSim} onCheckedChange={setPfSim} />
              </div>
              {portfolios.length > 1 && (
                <Button variant="destructive" className="w-full gap-2" onClick={async () => {
                  if (!confirm(`Delete portfolio "${active.name}" and all its holdings?`)) return;
                  await removePortfolio(active.id);
                  toast({ title: "Portfolio deleted" });
                  setSettingsOpen(false);
                }}><Trash2 className="h-4 w-4" /> Delete portfolio</Button>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!active) return;
              await updatePortfolio(active.id, { name: pfName, description: pfDesc, base_currency: pfBase, benchmark_symbol: pfBench, is_simulation: pfSim });
              toast({ title: "Saved" });
              setSettingsOpen(false);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {active && (
        <PortfolioSimulator
          open={simOpen}
          onClose={() => setSimOpen(false)}
          portfolioId={active.id}
          portfolioName={active.name}
          baseCurrency={active.base_currency}
          holdings={portfolio.map((p) => ({ symbol: p.symbol, shares: p.shares, currentPrice: p.currentPrice, currency: p.currency }))}
          fxToBase={fxRates}
        />
      )}
    </div>
  );
};

export default Portfolio;
