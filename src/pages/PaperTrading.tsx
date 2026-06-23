import { useEffect, useMemo, useState } from "react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FlaskConical, Search, AlertTriangle, TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolios } from "@/hooks/usePortfolios";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AiDisclaimerStrip } from "@/components/AiDisclaimerStrip";

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

export default function PaperTrading() {
  const { user } = useAuth();
  const { portfolios, create: createPortfolio } = usePortfolios();
  const { toast } = useToast();

  const sims = useMemo(() => portfolios.filter((p) => p.is_simulation), [portfolios]);
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => { if (!activeId && sims[0]) setActiveId(sims[0].id); }, [sims, activeId]);

  const [cash, setCash] = useState<Cash | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);

  // Ticket form
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState<string>("10");

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

  // Quotes for marking positions to market
  const liveSymbols = useMemo(() => Array.from(new Set(trades.map((t) => t.symbol))), [trades]);
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
    const px = quotes[selected.symbol]?.price;
    if (!px) { toast({ title: "No price yet", description: "Waiting for live quote. Try again in a second." }); return; }
    const quantity = Math.max(0, Number(qty));
    if (!quantity) return;
    const notional = px * quantity;
    const currentCash = cash?.cash || 0;
    if (side === "buy" && notional > currentCash) {
      toast({ title: "Insufficient virtual cash", description: `Need ${fmt(notional)}, have ${fmt(currentCash)}.`, variant: "destructive" });
      return;
    }
    const heldQty = positions.find((p) => p.symbol === selected.symbol)?.qty || 0;
    if (side === "sell" && quantity > heldQty) {
      toast({ title: "Short selling disabled in Lab", description: `You hold ${heldQty} ${selected.symbol}.`, variant: "destructive" });
      return;
    }
    await (supabase as any).from("paper_trades").insert({
      user_id: user.id, portfolio_id: activeId, symbol: selected.symbol, name: selected.name,
      side, quantity, price: px, currency: selected.currency || "EUR",
    });
    const newCash = side === "buy" ? currentCash - notional : currentCash + notional;
    await (supabase as any).from("paper_cash").update({ cash: newCash }).eq("portfolio_id", activeId);
    toast({ title: `${side.toUpperCase()} simulated`, description: `${quantity} ${selected.symbol} @ ${fmt(px, selected.currency)}` });
    setSelected(null); setQ(""); setQty("10");
    refresh(activeId);
  }

  async function deleteTrade(id: string) {
    if (!confirm("Delete this paper trade? Cash will not be rebalanced automatically.")) return;
    await (supabase as any).from("paper_trades").delete().eq("id", id);
    if (activeId) refresh(activeId);
  }

  return (
    <>
      <SEO title="Paper Trading Lab - Vela" description="Practice strategies with virtual cash. No real money is ever moved." path="/paper-trading" />
      <div className="px-6 sm:px-8 py-6 max-w-7xl mx-auto">
        <PageHeader icon={FlaskConical} title="Paper Trading Lab" description="Practice with virtual cash against live market data. Trades are simulated - no real orders are placed and no real money is ever moved." />

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
            </Card>

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
                </div>
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
                {selected && quotes[selected.symbol]?.price && (
                  <div className="text-xs text-muted-foreground mb-3">
                    Live: <span className="font-semibold tabular-nums">{fmt(quotes[selected.symbol].price, selected.currency)}</span>
                    {" · "}Notional ≈ <span className="font-semibold tabular-nums">{fmt(quotes[selected.symbol].price * Number(qty || 0), selected.currency)}</span>
                  </div>
                )}
                <Button className="w-full" onClick={placeOrder} disabled={!selected || !Number(qty)}>
                  Simulate {side.toUpperCase()}
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