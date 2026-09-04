import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TickerSearch } from "@/components/TickerSearch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Loader2, CloudOff } from "lucide-react";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
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

/**
 * Trade journal (formerly /blotter).
 *
 * Amounts are rendered in the account's base currency — the page used to
 * hardcode "$" while the rest of the app is EUR-based.
 */
export function TradeJournal() {
  const { user, loading: authLoading } = useAuth();
  const { baseCurrency } = useBaseCurrency();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sym, setSym] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState(10);
  const [price, setPrice] = useState(0);
  const [note, setNote] = useState("");

  const money = useMemo(() => {
    const ccy = (baseCurrency || "EUR").toUpperCase();
    const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency: ccy, maximumFractionDigits: 2 });
    return (n: number) => fmt.format(n);
  }, [baseCurrency]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("blotter_trades")
      .select("id, executed_at, symbol, side, quantity, price, note")
      .order("executed_at", { ascending: false });
    if (error) { toast.error("Could not load your journal"); return; }
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

  if (!authLoading && !user) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
          <CloudOff className="h-4 w-4" /> Sign in to keep your journal synced across every device.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Realised P&L</CardTitle></CardHeader>
          <CardContent className={`text-2xl font-mono ${realised >= 0 ? "text-bull" : "text-bear"}`}>{money(realised)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Unrealised P&L</CardTitle></CardHeader>
          <CardContent className={`text-2xl font-mono ${unrealised >= 0 ? "text-bull" : "text-bear"}`}>{money(unrealised)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total trades</CardTitle></CardHeader>
          <CardContent className="text-2xl font-mono">{trades.length}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle>New trade</CardTitle></CardHeader>
        {/*
          Stacks on phones, two columns from `sm`, six from `xl`. The old
          fixed 2/6-column grid squeezed the ticker search and note field down
          to "Ricer…" / "Nota (motiva…" at 390px.
        */}
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 items-end">
          <div className="space-y-1.5 sm:col-span-2 xl:col-span-2 min-w-0">
            <Label htmlFor="journal-symbol" className="text-xs">Instrument</Label>
            <TickerSearch
              value={sym}
              onValueChange={setSym}
              onSelect={(hit) => setSym(hit.symbol.toUpperCase())}
              placeholder="Search instrument"
            />
          </div>
          <div className="space-y-1.5 min-w-0">
            <Label className="text-xs">Side</Label>
            <Select value={side} onValueChange={(v) => setSide(v as "BUY" | "SELL")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="BUY">BUY</SelectItem><SelectItem value="SELL">SELL</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-0">
            <Label htmlFor="journal-qty" className="text-xs">Quantity</Label>
            <Input id="journal-qty" type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5 min-w-0">
            <Label htmlFor="journal-price" className="text-xs">Price</Label>
            <Input id="journal-price" type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2 xl:col-span-5 min-w-0">
            <Label htmlFor="journal-note" className="text-xs">Note (rationale)</Label>
            <Input id="journal-note" placeholder="Why are you taking this trade?" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button className="w-full sm:col-span-2 xl:col-span-1" onClick={add} disabled={saving || !sym || qty <= 0 || price <= 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add trade
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle>Trade log (audit trail)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {trades.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 py-2 text-sm last:border-0"
            >
              <span className="font-semibold">{t.symbol}</span>
              <span className={t.side === "BUY" ? "text-bull" : "text-bear"}>{t.side}</span>
              <span className="font-mono">{t.quantity}</span>
              <span className="font-mono">@ {money(t.price)}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {new Date(t.executed_at).toLocaleString()}
              </span>
              {t.note && <span className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1 sm:truncate">{t.note}</span>}
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto shrink-0"
                aria-label={`Delete ${t.symbol} trade`}
                onClick={() => remove(t.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading trades…
            </div>
          )}
          {!loading && !trades.length && <div className="text-sm text-muted-foreground">No trades yet.</div>}
        </CardContent>
      </Card>
    </div>
  );
}

export default TradeJournal;
