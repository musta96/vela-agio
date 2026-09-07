import { useEffect, useMemo, useRef, useState } from "react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FlaskConical, Search, AlertTriangle, TrendingUp, TrendingDown, Trash2, RotateCcw, Download, Upload, ArrowDownFromLine, FileSpreadsheet, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolios } from "@/hooks/usePortfolios";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AiDisclaimerStrip } from "@/components/AiDisclaimerStrip";
import { ShortRiskChecklist } from "@/components/shorts/ShortRiskChecklist";
import { buildShortChecklist, estimateBorrow, loadShortPrefs, saveShortPrefs } from "@/lib/shorts";
import { SheetImportDialog, type ParsedRow } from "@/components/paper/SheetImportDialog";
import { WatchlistImportDialog } from "@/components/paper/WatchlistImportDialog";
import { SimulationSettingsDialog } from "@/components/paper/SimulationSettingsDialog";
import { SimulationReview } from "@/components/paper/SimulationReview";


/**
 * Paper Trading Lab.
 *
 * Uses an `is_simulation = true` portfolio for isolation. Cash balance and
 * filled trades live in `paper_cash` / `paper_trades`. Open positions are
 * derived (FIFO net qty) and marked-to-market with live quotes.
 *
 * No real money is ever moved. We display a permanent MIFID-style
 * disclaimer and tag every order accordingly.
 */

type Trade = { id: string; symbol: string; name: string | null; side: "buy" | "sell"; quantity: number; price: number; currency: string; executed_at: string };
type Cash = { id: string; portfolio_id: string; currency: string; starting_cash: number; cash: number };
type SearchHit = { symbol: string; name: string; exchange: string; type: string; currency: string };

function fmt(n: number, ccy = "EUR") {
  const sym = ccy === "USD" ? "$" : ccy === "GBP" ? "£" : "€";
  return `${sym}${n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export default function PaperTrading({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  const { portfolios, create: createPortfolio, update: updatePortfolio, remove: removePortfolio, refresh: refreshPortfolios } = usePortfolios();
  const { toast } = useToast();

  const sims = useMemo(() => portfolios.filter((p) => p.is_simulation), [portfolios]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const LAST_KEY = "vela.paper.last_sim";
  // Prefer the user's last-used sim from localStorage; otherwise the first one.
  useEffect(() => {
    if (activeId || sims.length === 0) return;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(LAST_KEY) : null;
    const found = stored && sims.find((p) => p.id === stored);
    setActiveId(found ? stored! : sims[0].id);
  }, [sims, activeId]);
  useEffect(() => {
    if (activeId && typeof window !== "undefined") window.localStorage.setItem(LAST_KEY, activeId);
  }, [activeId]);

  // Refresh portfolio list on mount in case prior simulations weren't loaded yet.
  useEffect(() => { refreshPortfolios?.(); }, [refreshPortfolios]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);

  const [cash, setCash] = useState<Cash | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);

  // Ticket form
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const [side, setSide] = useState<"buy" | "sell" | "short">("buy");
  const [qty, setQty] = useState<string>("10");
  // Every ticket input is editable: size by units or by money, and override the fill price.
  const [sizeMode, setSizeMode] = useState<"qty" | "amount">("qty");
  const [amount, setAmount] = useState<string>("1000");
  const [priceOverride, setPriceOverride] = useState<string>("");
  const [settingsOpen, setSettingsOpen] = useState(false);


  // Symbol search (debounced)
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/symbol-search?q=${encodeURIComponent(term)}`;
        const r = await fetch(url); const j = await r.json();
        if (!cancelled) setHits(((j?.results as SearchHit[]) || []).slice(0, 8));
      } catch {}
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  // Load cash + trades for active simulation
  async function refresh(pid: string) {
    setLoading(true);
    const [{ data: cashRow }, { data: tradeRows }] = await Promise.all([
      (supabase as any).from("paper_cash").select("*").eq("portfolio_id", pid).maybeSingle(),
      (supabase as any).from("paper_trades").select("*").eq("portfolio_id", pid).order("executed_at", { ascending: false }),
    ]);
    setCash((cashRow as Cash) || null);
    setTrades((tradeRows as Trade[]) || []);
    setLoading(false);
  }
  useEffect(() => { if (activeId) refresh(activeId); }, [activeId]);

  // Quotes for marking positions to market — always include the instrument
  // currently selected in the order ticket so a first-time buy has a price.
  const liveSymbols = useMemo(
    () => Array.from(new Set([...trades.map((t) => t.symbol), ...(selected?.symbol ? [selected.symbol] : [])])),
    [trades, selected?.symbol],
  );
  const { quotes } = useLiveQuotes(liveSymbols, 60_000);


  // Derive positions (net qty + average cost basis) - simple weighted avg
  const positions = useMemo(() => {
    const map = new Map<string, { symbol: string; name: string; qty: number; cost: number; currency: string }>();
    for (const t of [...trades].reverse()) {
      const cur = map.get(t.symbol) || { symbol: t.symbol, name: t.name || t.symbol, qty: 0, cost: 0, currency: t.currency };
      if (t.side === "buy") { cur.cost = cur.cost + t.quantity * t.price; cur.qty += t.quantity; }
      else { if (cur.qty > 0) cur.cost -= (cur.cost / cur.qty) * Math.min(cur.qty, t.quantity); cur.qty -= t.quantity; }
      map.set(t.symbol, cur);
    }
    return Array.from(map.values()).filter((p) => Math.abs(p.qty) > 1e-9);
  }, [trades]);

  const positionsValue = positions.reduce((s, p) => s + (quotes[p.symbol]?.price || 0) * p.qty, 0);
  const equity = (cash?.cash || 0) + positionsValue;
  const startingCash = cash?.starting_cash || 0;
  const pnl = startingCash > 0 ? equity - startingCash : 0;
  const pnlPct = startingCash > 0 ? (pnl / startingCash) * 100 : 0;

  async function createSimulation() {
    const name = prompt("Name for your paper trading portfolio?", "Paper Trading Lab");
    if (!name) return;
    const startStr = prompt("Starting virtual cash (EUR)?", "100000");
    const start = Math.max(0, Number(startStr || 0)) || 100000;
    const p = await createPortfolio({ name, is_simulation: true, base_currency: "EUR" });
    if (!p || !user) return;
    await (supabase as any).from("paper_cash").insert({ user_id: user.id, portfolio_id: p.id, currency: "EUR", starting_cash: start, cash: start });
    setActiveId(p.id);
    toast({ title: "Paper portfolio created", description: `${name} funded with ${fmt(start)}.` });
  }

  async function placeOrder() {
    if (!user || !activeId || !selected) return;
    let px = quotes[selected.symbol]?.price;
    if (!px) {
      // Not in the polled batch yet (freshly searched instrument): fetch it now.
      const { data } = await supabase.functions.invoke("market-data", { body: { action: "quote", symbols: [selected.symbol] } });
      const p = (data?.quotes ?? {})[selected.symbol]?.price;
      if (typeof p === "number" && Number.isFinite(p) && p > 0) px = p;
    }
    // A manually typed fill price wins over the live quote (what-if pricing).
    const manual = Number(priceOverride);
    if (Number.isFinite(manual) && manual > 0) px = manual;
    if (!px) { toast({ title: "No live price available", description: `We could not get a price for ${selected.symbol} right now. Try again shortly, or type a price yourself.`, variant: "destructive" }); return; }

    // Size either by number of units or by the amount of money to commit.
    const quantity = sizeMode === "amount"
      ? Math.max(0, Math.floor(((Number(amount) || 0) / px) * 1e6) / 1e6)
      : Math.max(0, Number(qty));
    if (!quantity) return;
    const notional = px * quantity;
    const currentCash = cash?.cash || 0;

    const heldQty = positions.find((p) => p.symbol === selected.symbol)?.qty || 0;
    if (side === "buy" && notional > currentCash) {
      toast({ title: "Insufficient virtual cash", description: `Need ${fmt(notional)}, have ${fmt(currentCash)}.`, variant: "destructive" });
      return;
    }
    if (side === "sell" && quantity > heldQty) {
      toast({ title: "Cannot sell more than you hold", description: `You hold ${heldQty} ${selected.symbol}. Use SHORT to sell shares you don't own.`, variant: "destructive" });
      return;
    }
    if (side === "short") {
      const borrow = estimateBorrow(selected.symbol, px);
      const prefs = loadShortPrefs(activeId, selected.symbol);
      const { blocking, items } = buildShortChecklist({ symbol: selected.symbol, qty: quantity, price: px, currentCash, stopPrice: prefs.stop, borrow });
      if (blocking) {
        const danger = items.find((i) => i.severity === "danger");
        toast({ title: "Short blocked by risk check", description: danger?.detail || "Resolve highlighted risk to proceed.", variant: "destructive" });
        return;
      }
      const marginReq = notional * 0.5;
      const ok = confirm(`Confirm SHORT SELL ${quantity} ${selected.symbol} @ ${fmt(px, selected.currency)}?\n\nLosses on a short are theoretically unlimited. Initial margin ~${fmt(marginReq)} will be reserved. Est. borrow ~${(borrow.rate * 100).toFixed(2)}% APR (${borrow.difficulty}).`);
      if (!ok) return;
      // Record entry for the position manager
      saveShortPrefs(activeId, selected.symbol, { entryPrice: px, borrowRate: borrow.rate, openedAt: new Date().toISOString() });
    }
    // Persist: SHORT rows use side='sell' (DB CHECK constraint) but the note tags them so the
    // positions reducer already produces a negative qty (existing behaviour).
    await (supabase as any).from("paper_trades").insert({
      user_id: user.id, portfolio_id: activeId, symbol: selected.symbol, name: selected.name,
      side: side === "short" ? "sell" : side, quantity, price: px, currency: selected.currency || "EUR",
      notes: side === "short" ? "short_sell" : null,
    });
    // Cash impact: SHORT credits proceeds but reserves margin; keep it simple and mirror sell credit.
    const newCash = side === "buy" ? currentCash - notional : currentCash + notional;
    await (supabase as any).from("paper_cash").update({ cash: newCash }).eq("portfolio_id", activeId);
    toast({
      title: `${side === "short" ? "SHORT SELL" : side.toUpperCase()} simulated`,
      description: `${quantity} ${selected.symbol} @ ${fmt(px, selected.currency)}${side === "short" ? " · unlimited-loss risk noted" : ""}`,
    });
    setSelected(null); setQ(""); setQty("10"); setPriceOverride("");
    refresh(activeId);
  }

  /** Persist edited simulation settings (name, currency, invested total, cash). */
  async function saveSettings(v: { name: string; currency: string; startingCash: number; cash: number }) {
    if (!activeId || !user) return;
    await updatePortfolio(activeId, { name: v.name, base_currency: v.currency });
    if (cash) {
      await (supabase as any).from("paper_cash")
        .update({ currency: v.currency, starting_cash: v.startingCash, cash: v.cash })
        .eq("portfolio_id", activeId);
    } else {
      await (supabase as any).from("paper_cash")
        .insert({ user_id: user.id, portfolio_id: activeId, currency: v.currency, starting_cash: v.startingCash, cash: v.cash });
    }
    await refreshPortfolios?.();
    await refresh(activeId);
    toast({ title: "Simulation updated", description: `${v.name} · ${fmt(v.startingCash, v.currency)} invested.` });
  }

  /** Wipe every simulated trade and put all money back into cash. */
  async function resetSimulation() {
    if (!activeId) return;
    await (supabase as any).from("paper_trades").delete().eq("portfolio_id", activeId);
    await (supabase as any).from("paper_cash").update({ cash: cash?.starting_cash || 0 }).eq("portfolio_id", activeId);
    await refresh(activeId);
    toast({ title: "Simulation reset", description: "All trades removed and cash restored." });
  }

  async function deleteSimulation() {
    if (!activeId) return;
    await (supabase as any).from("paper_trades").delete().eq("portfolio_id", activeId);
    await (supabase as any).from("paper_cash").delete().eq("portfolio_id", activeId);
    await removePortfolio(activeId);
    setActiveId(null);
    await refreshPortfolios?.();
    toast({ title: "Simulation deleted" });
  }


  async function deleteTrade(id: string) {
    if (!confirm("Delete this paper trade? Cash will not be rebalanced automatically.")) return;
    await (supabase as any).from("paper_trades").delete().eq("id", id);
    if (activeId) refresh(activeId);
  }

  function resumeLastSimulation() {
    if (sims.length === 0) {
      toast({ title: "No saved simulations", description: "Create a new paper portfolio to get started." });
      return;
    }
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(LAST_KEY) : null;
    const target = (stored && sims.find((p) => p.id === stored)?.id) || sims[0].id;
    setActiveId(target);
    refresh(target);
    toast({ title: "Simulation resumed", description: "Loaded your last paper-trading session and positions." });
  }

  async function exportSimulation() {
    if (!activeId) return;
    const sim = sims.find((p) => p.id === activeId);
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      portfolio: sim ? { name: sim.name, base_currency: sim.base_currency } : null,
      cash: cash ? { currency: cash.currency, starting_cash: cash.starting_cash, cash: cash.cash } : null,
      trades: trades.map((t) => ({
        symbol: t.symbol, name: t.name, side: t.side, quantity: t.quantity,
        price: t.price, currency: t.currency, executed_at: t.executed_at,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vela-paper-${(sim?.name || "simulation").replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast({ title: "Simulation exported", description: "Keep the JSON file as a backup or share it across devices." });
  }

  async function importSimulation(file: File) {
    if (!user) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const name = (data?.portfolio?.name || `Imported ${new Date().toLocaleDateString()}`).slice(0, 80);
      const ccy = data?.cash?.currency || data?.portfolio?.base_currency || "EUR";
      const startingCash = Number(data?.cash?.starting_cash ?? 0) || 0;
      const remainingCash = Number(data?.cash?.cash ?? startingCash) || 0;
      const trades: any[] = Array.isArray(data?.trades) ? data.trades : [];

      const p = await createPortfolio({ name, is_simulation: true, base_currency: ccy });
      if (!p) { toast({ title: "Import failed", description: "Could not create the simulation portfolio.", variant: "destructive" }); return; }

      await (supabase as any).from("paper_cash").insert({
        user_id: user.id, portfolio_id: p.id, currency: ccy,
        starting_cash: startingCash, cash: remainingCash,
      });
      if (trades.length) {
        await (supabase as any).from("paper_trades").insert(
          trades.map((t) => ({
            user_id: user.id, portfolio_id: p.id,
            symbol: String(t.symbol), name: t.name ?? null,
            side: t.side === "sell" ? "sell" : "buy",
            quantity: Number(t.quantity) || 0,
            price: Number(t.price) || 0,
            currency: t.currency || ccy,
            executed_at: t.executed_at || new Date().toISOString(),
          })),
        );
      }
      setActiveId(p.id);
      await refresh(p.id);
      toast({ title: "Simulation imported", description: `${name} restored with ${trades.length} trade(s).` });
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message || "Invalid backup file.", variant: "destructive" });
    }
  }

  /**
   * Shared entry point for spreadsheet and watchlist imports: rows without a
   * price are filled with the current live quote, then booked as paper trades
   * and settled against the virtual cash balance.
   */
  async function importRows(rows: ParsedRow[]) {
    if (!user || !activeId || rows.length === 0) return;
    const need = Array.from(new Set(rows.filter((r) => !r.price).map((r) => r.symbol)));
    let live: Record<string, { price?: number; currency?: string; name?: string }> = {};
    if (need.length) {
      const { data } = await supabase.functions.invoke("market-data", { body: { action: "quote", symbols: need } });
      live = (data?.quotes ?? {}) as typeof live;
    }
    const baseCcy = cash?.currency || "EUR";
    const priced = rows.map((r) => {
      const q = live[r.symbol];
      const price = r.price ?? (typeof q?.price === "number" ? q.price : null);
      return { ...r, price, name: r.name ?? q?.name ?? null, currency: r.currency ?? q?.currency ?? baseCcy };
    });
    const usable = priced.filter((r) => r.price != null && r.price > 0);
    if (!usable.length) {
      toast({ title: "Nothing imported", description: "No live price could be found for these instruments.", variant: "destructive" });
      return;
    }
    await (supabase as any).from("paper_trades").insert(
      usable.map((r) => ({
        user_id: user.id, portfolio_id: activeId, symbol: r.symbol, name: r.name,
        side: r.side, quantity: r.quantity, price: r.price, currency: r.currency,
        executed_at: r.executedAt || new Date().toISOString(),
        notes: "imported",
      })),
    );
    const net = usable.reduce((s, r) => s + (r.side === "buy" ? -1 : 1) * r.quantity * (r.price as number), 0);
    await (supabase as any).from("paper_cash").update({ cash: (cash?.cash || 0) + net }).eq("portfolio_id", activeId);
    await refresh(activeId);
    const skipped = priced.length - usable.length;
    toast({
      title: "Import complete",
      description: `${usable.length} position${usable.length === 1 ? "" : "s"} added${skipped ? ` · ${skipped} skipped (no price)` : ""}.`,
    });
  }


  return (
    <>
      {!embedded && (
        <SEO title="Paper Trading Lab - Vela" description="Practice strategies with virtual cash. No real money is ever moved." path="/paper-trading" />
      )}
      <div className={embedded ? "min-w-0" : "px-6 sm:px-8 py-6 max-w-7xl mx-auto"}>
        {!embedded && <PageHeader icon={FlaskConical} title="Paper Trading Lab" description="Practice with virtual cash against live market data. Trades are simulated - no real orders are placed and no real money is ever moved." />}

        <Alert className="mb-4 border-amber-500/40 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs">
            <strong>Simulation only.</strong> Results do not represent actual performance. Simulated trading ignores slippage, partial fills, taxes and market impact. Past simulated performance is not indicative of future real-world results. For educational use only - not investment advice (MIFID II disclosure).
          </AlertDescription>
        </Alert>

        {sims.length === 0 ? (
          <Card className="p-8 text-center">
            <FlaskConical className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold mb-1">Create your first paper portfolio</h3>
            <p className="text-sm text-muted-foreground mb-4">Get virtual cash and trade live markets with zero risk.</p>
            <Button onClick={createSimulation}>Start a simulation</Button>
          </Card>
        ) : (
          <>
            <Card className="p-4 mb-4 flex flex-wrap items-center gap-3">
              <Label className="text-xs">Portfolio</Label>
              <Select value={activeId || ""} onValueChange={setActiveId}>
                <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sims.map((p) => <SelectItem key={p.id} value={p.id}>🧪 {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={createSimulation}>+ New simulation</Button>
              <Button variant="outline" size="sm" onClick={resumeLastSimulation} className="gap-1">
                <RotateCcw className="h-3.5 w-3.5" /> Resume simulation
              </Button>
              <Button variant="outline" size="sm" onClick={exportSimulation} disabled={!activeId} className="gap-1">
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)} disabled={!activeId} className="gap-1">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Import spreadsheet
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWatchOpen(true)} disabled={!activeId} className="gap-1">
                <Eye className="h-3.5 w-3.5" /> Import watchlist
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1">
                <Upload className="h-3.5 w-3.5" /> Restore backup
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importSimulation(f);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
            </Card>

            <SheetImportDialog open={sheetOpen} onOpenChange={setSheetOpen} onImport={importRows} />
            <WatchlistImportDialog open={watchOpen} onOpenChange={setWatchOpen} onImport={importRows} />


            {sims.length > 1 && (
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground self-center mr-1">
                  All simulations ({sims.length}):
                </span>
                {sims.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveId(p.id)}
                    className={`text-xs rounded-full border px-3 py-1 transition-colors ${activeId === p.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted/60"}`}
                  >
                    🧪 {p.name}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Card className="p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">Equity</div><div className="text-2xl font-bold tabular-nums">{fmt(equity)}</div></Card>
              <Card className="p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">Cash</div><div className="text-2xl font-bold tabular-nums">{fmt(cash?.cash || 0)}</div></Card>
              <Card className="p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">Positions</div><div className="text-2xl font-bold tabular-nums">{fmt(positionsValue)}</div></Card>
              <Card className="p-4">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total P&amp;L</div>
                <div className={`text-2xl font-bold tabular-nums ${pnl >= 0 ? "text-success" : "text-destructive"}`}>
                  {pnl >= 0 ? "+" : ""}{fmt(pnl)} <span className="text-sm font-normal">({pnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)</span>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Order ticket */}
              <Card className="p-4 lg:col-span-1">
                <h3 className="text-sm font-semibold mb-3">New paper order</h3>
                <div className="flex gap-2 mb-3">
                  <Badge variant={side === "buy" ? "default" : "outline"} className="cursor-pointer" onClick={() => setSide("buy")}>Buy</Badge>
                  <Badge variant={side === "sell" ? "default" : "outline"} className="cursor-pointer" onClick={() => setSide("sell")}>Sell</Badge>
                  <Badge
                    variant={side === "short" ? "default" : "outline"}
                    className={`cursor-pointer gap-1 ${side === "short" ? "" : "border-destructive/40 text-destructive"}`}
                    onClick={() => setSide("short")}
                  >
                    <ArrowDownFromLine className="h-3 w-3" /> Short
                  </Badge>
                </div>
                {side === "short" && (
                  <Alert className="mb-3 border-destructive/40 bg-destructive/5">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <AlertDescription className="text-[11px] leading-snug">
                      <strong>Short-sell risk checks:</strong> losses are theoretically unlimited. Simulation reserves 50% initial margin (Reg-T style) and credits proceeds to cash. Real broker shorts also require locate/borrow availability and pay borrow fees, which we ignore here.
                    </AlertDescription>
                  </Alert>
                )}
                <Label className="text-xs">Instrument</Label>
                <div className="flex items-center gap-2 mb-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={selected ? `${selected.symbol} - ${selected.name}` : q} onChange={(e) => { setSelected(null); setQ(e.target.value); }} placeholder="Search ticker or name…" />
                </div>
                {!selected && hits.length > 0 && (
                  <Card className="mb-2 max-h-52 overflow-y-auto divide-y divide-border">
                    {hits.map((h) => (
                      <button key={`${h.symbol}-${h.exchange}`} onClick={() => { setSelected(h); setQ(""); setHits([]); }} className="w-full text-left px-3 py-2 hover:bg-muted">
                        <div className="text-sm font-semibold">{h.symbol} <span className="text-xs text-muted-foreground">{h.exchange}</span></div>
                        <div className="text-xs text-muted-foreground truncate">{h.name}</div>
                      </button>
                    ))}
                  </Card>
                )}
                <Label className="text-xs">Quantity</Label>
                <Input type="number" min="0" step="1" value={qty} onChange={(e) => setQty(e.target.value)} className="mb-3" />
                {selected && quotes[selected.symbol]?.price && (() => {
                  const px = quotes[selected.symbol].price;
                  const notional = px * Number(qty || 0);
                  const heldQty = positions.find((p) => p.symbol === selected.symbol)?.qty || 0;
                  const currentCash = cash?.cash || 0;
                  const marginReq = notional * 0.5;
                  return (
                    <div className="text-xs text-muted-foreground mb-3 space-y-0.5">
                      <div>Live: <span className="font-semibold tabular-nums">{fmt(px, selected.currency)}</span> · Notional ≈ <span className="font-semibold tabular-nums">{fmt(notional, selected.currency)}</span></div>
                      {side === "short" && (
                        <>
                          <div>Position held: <span className="font-mono">{heldQty}</span> · Margin req (50%): <span className={`font-semibold ${marginReq > currentCash ? "text-destructive" : ""}`}>{fmt(marginReq, selected.currency)}</span></div>
                          <div>Cash after fill: <span className="font-mono">{fmt(currentCash + notional, selected.currency)}</span> · Reserved for margin: <span className="font-mono">{fmt(marginReq, selected.currency)}</span></div>
                        </>
                      )}
                    </div>
                  );
                })()}
                {side === "short" && selected && quotes[selected.symbol]?.price && activeId && (
                  <ShortRiskChecklist
                    className="mb-3 rounded-md border border-border/60 p-2.5"
                    symbol={selected.symbol}
                    qty={Number(qty) || 0}
                    price={quotes[selected.symbol].price}
                    currentCash={cash?.cash || 0}
                    stopPrice={loadShortPrefs(activeId, selected.symbol).stop}
                    borrow={estimateBorrow(selected.symbol, quotes[selected.symbol].price)}
                  />
                )}
                <Button
                  className={`w-full ${side === "short" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}
                  onClick={placeOrder}
                  disabled={!selected || !Number(qty)}
                >
                  Simulate {side === "short" ? "SHORT SELL" : side.toUpperCase()}
                </Button>
              </Card>

              {/* Positions + history */}
              <Card className="p-4 lg:col-span-2">
                <h3 className="text-sm font-semibold mb-3">Open positions</h3>
                {positions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No open positions yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <tr><th className="text-left py-2">Symbol</th><th className="text-right">Qty</th><th className="text-right">Avg cost</th><th className="text-right">Last</th><th className="text-right">P&amp;L</th></tr>
                    </thead>
                    <tbody>
                      {positions.map((p) => {
                        const last = quotes[p.symbol]?.price || 0;
                        const avg = p.qty ? p.cost / p.qty : 0;
                        const pl = (last - avg) * p.qty;
                        const plp = avg ? ((last - avg) / avg) * 100 : 0;
                        return (
                          <tr key={p.symbol} className="border-b border-border/50">
                            <td className="py-2"><div className="font-semibold">{p.symbol}</div><div className="text-[10px] text-muted-foreground truncate">{p.name}</div></td>
                            <td className="text-right tabular-nums">{p.qty}</td>
                            <td className="text-right tabular-nums">{fmt(avg, p.currency)}</td>
                            <td className="text-right tabular-nums">{last ? fmt(last, p.currency) : "-"}</td>
                            <td className={`text-right tabular-nums font-semibold ${pl >= 0 ? "text-success" : "text-destructive"}`}>
                              {pl >= 0 ? "+" : ""}{fmt(pl, p.currency)} <span className="text-[10px] font-normal">({plp.toFixed(2)}%)</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                <h3 className="text-sm font-semibold mt-6 mb-2">Trade history</h3>
                {trades.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No trades yet.</p>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0 bg-card border-b border-border">
                        <tr><th className="text-left py-2">When</th><th className="text-left">Symbol</th><th className="text-left">Side</th><th className="text-right">Qty</th><th className="text-right">Price</th><th></th></tr>
                      </thead>
                      <tbody>
                        {trades.map((t) => (
                          <tr key={t.id} className="border-b border-border/50">
                            <td className="py-1.5">{new Date(t.executed_at).toLocaleString()}</td>
                            <td className="font-semibold">{t.symbol}</td>
                            <td>{t.side === "buy" ? <span className="inline-flex items-center gap-1 text-success"><TrendingUp className="h-3 w-3" />BUY</span> : <span className="inline-flex items-center gap-1 text-destructive"><TrendingDown className="h-3 w-3" />SELL</span>}</td>
                            <td className="text-right tabular-nums">{t.quantity}</td>
                            <td className="text-right tabular-nums">{fmt(t.price, t.currency)}</td>
                            <td className="text-right"><button onClick={() => deleteTrade(t.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
        <AiDisclaimerStrip />
      </div>
    </>
  );
}