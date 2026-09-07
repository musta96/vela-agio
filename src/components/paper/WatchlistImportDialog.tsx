import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye } from "lucide-react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import type { ParsedRow } from "./SheetImportDialog";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImport: (rows: ParsedRow[]) => Promise<void> | void;
}

/**
 * Turns followed instruments into simulated buys. Either a fixed amount of
 * cash per instrument (equal weight) or a fixed number of units.
 */
export function WatchlistImportDialog({ open, onOpenChange, onImport }: Props) {
  const { items } = useWatchlist();
  const symbols = useMemo(() => items.map((i) => i.symbol), [items]);
  const { quotes } = useLiveQuotes(open ? symbols : [], 60_000);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"amount" | "units">("amount");
  const [amount, setAmount] = useState("5000");
  const [units, setUnits] = useState("10");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setPicked(new Set(symbols));
  }, [open, symbols]);

  const rows = useMemo<ParsedRow[]>(() => {
    const perTrade = Number(amount) || 0;
    const qtyFixed = Number(units) || 0;
    return items
      .filter((i) => picked.has(i.symbol))
      .map((i) => {
        const price = quotes[i.symbol]?.price ?? null;
        const quantity = mode === "units"
          ? qtyFixed
          : price && price > 0 ? Math.floor(perTrade / price) : 0;
        return {
          symbol: i.symbol,
          name: i.name || null,
          side: "buy" as const,
          quantity,
          price,
          currency: quotes[i.symbol]?.currency ?? null,
          executedAt: null,
        };
      })
      .filter((r) => r.quantity > 0);
  }, [items, picked, quotes, mode, amount, units]);

  async function confirm() {
    setBusy(true);
    try {
      await onImport(rows);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Eye className="h-4 w-4" /> Import from your watchlist</DialogTitle>
          <DialogDescription>Buy the instruments you follow at today's live price, with virtual cash.</DialogDescription>
        </DialogHeader>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Your watchlist is empty. Follow a few instruments first.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">How much per instrument</Label>
                <div className="flex gap-1 mt-1">
                  <Button size="sm" variant={mode === "amount" ? "default" : "outline"} onClick={() => setMode("amount")}>Cash amount</Button>
                  <Button size="sm" variant={mode === "units" ? "default" : "outline"} onClick={() => setMode("units")}>Fixed units</Button>
                </div>
              </div>
              {mode === "amount" ? (
                <div>
                  <Label className="text-xs" htmlFor="wl-amount">Amount each</Label>
                  <Input id="wl-amount" className="w-32 mt-1" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
                </div>
              ) : (
                <div>
                  <Label className="text-xs" htmlFor="wl-units">Units each</Label>
                  <Input id="wl-units" className="w-32 mt-1" value={units} onChange={(e) => setUnits(e.target.value)} inputMode="decimal" />
                </div>
              )}
            </div>

            <div className="rounded-md border divide-y max-h-64 overflow-auto">
              {items.map((i) => {
                const row = rows.find((r) => r.symbol === i.symbol);
                const price = quotes[i.symbol]?.price;
                return (
                  <label key={i.symbol} className="flex items-center gap-3 p-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={picked.has(i.symbol)}
                      onCheckedChange={(c) => setPicked((p) => {
                        const n = new Set(p);
                        if (c) n.add(i.symbol); else n.delete(i.symbol);
                        return n;
                      })}
                    />
                    <span className="font-medium w-24 truncate">{i.symbol}</span>
                    <span className="flex-1 truncate text-muted-foreground text-xs">{i.name}</span>
                    <span className="tabular-nums text-xs">
                      {price ? `${price.toFixed(2)} × ${row?.quantity ?? 0}` : "no price"}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={!rows.length || busy}>
            {busy ? "Importing…" : `Buy ${rows.length} instrument${rows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default WatchlistImportDialog;
