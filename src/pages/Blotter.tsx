import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Trash2 } from "lucide-react";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";

interface Trade { id: string; ts: number; symbol: string; side: "BUY" | "SELL"; qty: number; price: number; note?: string }

const KEY = "paper_trade_blotter";

export default function Blotter() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [sym, setSym] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState(10);
  const [price, setPrice] = useState(0);
  const [note, setNote] = useState("");

  useEffect(() => { try { setTrades(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { /* ignore */ } }, []);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(trades)); }, [trades]);

  const symbols = Array.from(new Set(trades.map(t => t.symbol)));
  const { quotes } = useLiveQuotes(symbols, 60_000);

  const add = () => {
    if (!sym || qty <= 0 || price <= 0) return;
    setTrades([{ id: crypto.randomUUID(), ts: Date.now(), symbol: sym.toUpperCase(), side, qty, price, note }, ...trades]);
    setSym(""); setQty(10); setPrice(0); setNote("");
  };

  // realised + unrealised PnL per symbol (FIFO simplified)
  const positions: Record<string, { qty: number; cost: number }> = {};
  let realised = 0;
  [...trades].reverse().forEach(t => {
    const p = positions[t.symbol] ?? { qty: 0, cost: 0 };
    if (t.side === "BUY") { p.cost += t.qty * t.price; p.qty += t.qty; }
    else { const avg = p.qty > 0 ? p.cost / p.qty : 0; realised += (t.price - avg) * t.qty; p.cost -= avg * t.qty; p.qty -= t.qty; }
    positions[t.symbol] = p;
  });
  let unrealised = 0;
  Object.entries(positions).forEach(([s, p]) => {
    if (p.qty > 0) { const mkt = quotes[s]?.price ?? 0; unrealised += (mkt * p.qty) - p.cost; }
  });

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Paper Trading Blotter | Vela.ai" description="Track simulated trades, P&L, audit trail" path="/blotter" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><ClipboardList className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Paper Trading Blotter</h1></div>
        <div className="grid md:grid-cols-3 gap-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Realised P&L</CardTitle></CardHeader><CardContent className={`text-2xl font-mono ${realised >= 0 ? "text-bull" : "text-bear"}`}>${realised.toFixed(2)}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Unrealised P&L</CardTitle></CardHeader><CardContent className={`text-2xl font-mono ${unrealised >= 0 ? "text-bull" : "text-bear"}`}>${unrealised.toFixed(2)}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Total Trades</CardTitle></CardHeader><CardContent className="text-2xl font-mono">{trades.length}</CardContent></Card>
        </div>
        <Card>
          <CardHeader><CardTitle>New Trade</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <Input placeholder="Symbol" value={sym} onChange={(e) => setSym(e.target.value)} />
            <Select value={side} onValueChange={(v) => setSide(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="BUY">BUY</SelectItem><SelectItem value="SELL">SELL</SelectItem></SelectContent>
            </Select>
            <Input type="number" placeholder="Qty" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            <Input type="number" placeholder="Price" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
            <Input placeholder="Note (rationale)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button onClick={add}>Add</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Trade Log (Audit Trail)</CardTitle></CardHeader>
          <CardContent>
            {trades.map(t => (
              <div key={t.id} className="grid grid-cols-7 text-sm py-1 border-b items-center">
                <div className="font-mono text-xs">{new Date(t.ts).toLocaleString()}</div>
                <div className="font-semibold">{t.symbol}</div>
                <div className={t.side === "BUY" ? "text-bull" : "text-bear"}>{t.side}</div>
                <div className="font-mono">{t.qty}</div>
                <div className="font-mono">${t.price.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground truncate">{t.note}</div>
                <Button variant="ghost" size="icon" onClick={() => setTrades(trades.filter(x => x.id !== t.id))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {!trades.length && <div className="text-muted-foreground text-sm">No trades yet.</div>}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}