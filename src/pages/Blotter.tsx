import { useCallback, useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TickerSearch } from "@/components/TickerSearch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Trash2, Loader2, CloudOff } from "lucide-react";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Trade {
  id: string;
  executed_at: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  note: string | null;
}

const LEGACY_KEY = "paper_trade_blotter";
const MIGRATED_KEY = "paper_trade_blotter:migrated";

export default function Blotter() {
  const { user, loading: authLoading } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sym, setSym] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState(10);
  const [price, setPrice] = useState(0);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("blotter_trades")
      .select("id, executed_at, symbol, side, quantity, price, note")
      .order("executed_at", { ascending: false });
    if (error) { toast.error("Could not load your blotter"); return; }
    setTrades(((data ?? []) as any[]).map((t) => ({
      ...t,
      quantity: Number(t.quantity),
      price: Number(t.price),
    })) as Trade[]);
  }, []);

  // Load from the backend and migrate trades still stored only in this browser.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (cancelled) return;

      if (!localStorage.getItem(MIGRATED_KEY)) {
        try {
          const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]") as Array<{
            ts?: number; symbol?: string; side?: string; qty?: number; price?: number; note?: string;
          }>;
          const rows = legacy
            .filter((t) => t?.symbol && Number(t.qty) > 0 && Number(t.price) > 0)
            .map((t) => ({
              user_id: user.id,
              symbol: t.symbol!.toUpperCase(),
              side: t.side === "SELL" ? "SELL" : "BUY",
              quantity: Number(t.qty),
              price: Number(t.price),
              note: t.note ?? null,
              executed_at: new Date(t.ts ?? Date.now()).toISOString(),
            }));
          if (rows.length) {
            const { error } = await supabase.from("blotter_trades").insert(rows);
            if (!error) {
              toast.success(`Synced ${rows.length} trade${rows.length > 1 ? "s" : ""} from this device`);
              await load();
            }
          }
          localStorage.setItem(MIGRATED_KEY, "1");
          localStorage.removeItem(LEGACY_KEY);
        } catch { /* ignore malformed legacy payloads */ }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authLoading, user, load]);

  const symbols = Array.from(new Set(trades.map((t) => t.symbol)));
  const { quotes } = useLiveQuotes(symbols, 60_000);

  const add = async () => {
    if (!sym || qty <= 0 || price <= 0 || !user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("blotter_trades")
      .insert({
        user_id: user.id,
        symbol: sym.toUpperCase(),
        side,
        quantity: qty,
        price,
        note: note || null,
      })
      .select("id, executed_at, symbol, side, quantity, price, note")
      .single();
    setSaving(false);
    if (error || !data) { toast.error("Could not record the trade"); return; }
    setTrades((prev) => [{ ...(data as any), quantity: Number((data as any).quantity), price: Number((data as any).price) } as Trade, ...prev]);
    setSym(""); setQty(10); setPrice(0); setNote("");
  };

  const remove = async (id: string) => {
    const prev = trades;
    setTrades(trades.filter((t) => t.id !== id));
    const { error } = await supabase.from("blotter_trades").delete().eq("id", id);
    if (error) { setTrades(prev); toast.error("Could not delete the trade"); }
  };

  // realised + unrealised PnL per symbol (FIFO simplified)
  const positions: Record<string, { qty: number; cost: number }> = {};
  let realised = 0;
  [...trades].reverse().forEach((t) => {
    const p = positions[t.symbol] ?? { qty: 0, cost: 0 };
    if (t.side === "BUY") { p.cost += t.quantity * t.price; p.qty += t.quantity; }
    else { const avg = p.qty > 0 ? p.cost / p.qty : 0; realised += (t.price - avg) * t.quantity; p.cost -= avg * t.quantity; p.qty -= t.quantity; }
    positions[t.symbol] = p;
  });
  let unrealised = 0;
  Object.entries(positions).forEach(([s, p]) => {
    if (p.qty > 0) { const mkt = quotes[s]?.price ?? 0; unrealised += (mkt * p.qty) - p.cost; }
  });

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Paper Trading Blotter | Vela.ai" description="Track simulated trades, view realised and unrealised P&L, and maintain a full audit trail for your paper portfolio." path="/blotter" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><ClipboardList className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Paper Trading Blotter</h1></div>

        {!authLoading && !user ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
              <CloudOff className="h-4 w-4" /> Sign in to keep your blotter synced across every device.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-3">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Realised P&L</CardTitle></CardHeader><CardContent className={`text-2xl font-mono ${realised >= 0 ? "text-bull" : "text-bear"}`}>${realised.toFixed(2)}</CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Unrealised P&L</CardTitle></CardHeader><CardContent className={`text-2xl font-mono ${unrealised >= 0 ? "text-bull" : "text-bear"}`}>${unrealised.toFixed(2)}</CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Total Trades</CardTitle></CardHeader><CardContent className="text-2xl font-mono">{trades.length}</CardContent></Card>
            </div>
            <Card>
              <CardHeader><CardTitle>New Trade</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <TickerSearch value={sym} onValueChange={setSym} onSelect={(hit) => setSym(hit.symbol.toUpperCase())} placeholder="Search instrument" />
                <Select value={side} onValueChange={(v) => setSide(v as "BUY" | "SELL")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="BUY">BUY</SelectItem><SelectItem value="SELL">SELL</SelectItem></SelectContent>
                </Select>
                <Input type="number" placeholder="Qty" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
                <Input type="number" placeholder="Price" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
                <Input placeholder="Note (rationale)" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button onClick={add} disabled={saving || !sym || qty <= 0 || price <= 0}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Trade Log (Audit Trail)</CardTitle></CardHeader>
              <CardContent>
                {trades.map((t) => (
                  <div key={t.id} className="grid grid-cols-7 text-sm py-1 border-b items-center">
                    <div className="font-mono text-xs">{new Date(t.executed_at).toLocaleString()}</div>
                    <div className="font-semibold">{t.symbol}</div>
                    <div className={t.side === "BUY" ? "text-bull" : "text-bear"}>{t.side}</div>
                    <div className="font-mono">{t.quantity}</div>
                    <div className="font-mono">${t.price.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.note}</div>
                    <Button variant="ghost" size="icon" aria-label="Delete trade" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                {loading && <div className="text-muted-foreground text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading trades…</div>}
                {!loading && !trades.length && <div className="text-muted-foreground text-sm">No trades yet.</div>}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
