import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowDownFromLine, Target, ShieldAlert, Save } from "lucide-react";
import {
  computeShortMargin,
  estimateBorrow,
  loadShortPrefs,
  saveShortPrefs,
  shortPnL,
} from "@/lib/shorts";
import { HedgeSuggestions } from "./HedgeSuggestions";

export interface ShortPosition {
  symbol: string;
  name: string;
  qty: number; // negative for shorts
  avgCost: number;
  currency: string;
  openedAt?: string;
}

function fmt(n: number, ccy = "USD") {
  const sym = ccy === "USD" ? "$" : ccy === "GBP" ? "£" : "€";
  if (!isFinite(n)) return `${sym}∞`;
  return `${sym}${n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

/** Editable manager row for a single short position. */
export function ShortPositionRow({
  portfolioId,
  pos,
  lastPrice,
}: {
  portfolioId: string;
  pos: ShortPosition;
  lastPrice: number;
}) {
  const stored = loadShortPrefs(portfolioId, pos.symbol);
  const borrow = estimateBorrow(pos.symbol, lastPrice);
  const shortQty = Math.abs(pos.qty);

  const [target, setTarget] = useState<string>(stored.target?.toString() ?? "");
  const [stop, setStop] = useState<string>(stored.stop?.toString() ?? "");
  const [borrowRate, setBorrowRate] = useState<string>(((stored.borrowRate ?? borrow.rate) * 100).toFixed(2));
  const [hedgeOpen, setHedgeOpen] = useState(false);

  const days = useMemo(() => {
    const opened = stored.openedAt ? new Date(stored.openedAt).getTime() : Date.now();
    return Math.max(1, Math.round((Date.now() - opened) / (1000 * 60 * 60 * 24)));
  }, [stored.openedAt]);

  const m = computeShortMargin(pos.avgCost, shortQty, 0);
  const pnl = shortPnL(pos.avgCost, lastPrice || pos.avgCost, shortQty, days, Number(borrowRate) / 100);

  function persist() {
    saveShortPrefs(portfolioId, pos.symbol, {
      target: target ? Number(target) : undefined,
      stop: stop ? Number(stop) : undefined,
      borrowRate: Number(borrowRate) / 100,
      openedAt: stored.openedAt || new Date().toISOString(),
      entryPrice: pos.avgCost,
    });
  }

  const stopHit = stop && lastPrice >= Number(stop);
  const targetHit = target && lastPrice <= Number(target);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <ArrowDownFromLine className="h-4 w-4 text-destructive" />
            <span className="font-semibold">{pos.symbol}</span>
            <span className="text-xs text-muted-foreground truncate max-w-[220px]">{pos.name}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            SHORT {shortQty} @ avg {fmt(pos.avgCost, pos.currency)} · last {fmt(lastPrice, pos.currency)} · held {days}d
          </div>
        </div>
        <div className="flex gap-1 flex-wrap">
          <Badge variant="outline" className={`text-[10px] ${borrow.difficulty === "easy" ? "border-success/50 text-success" : borrow.difficulty === "moderate" ? "border-amber-500/50 text-amber-500" : "border-destructive/50 text-destructive"}`}>
            Borrow: {borrow.difficulty}
          </Badge>
          {stopHit && <Badge variant="destructive" className="text-[10px]">Stop breached</Badge>}
          {targetHit && <Badge className="text-[10px] bg-success text-success-foreground">Target hit</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="rounded-md bg-muted/40 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">Price P/L</div>
          <div className={`font-semibold tabular-nums ${pnl.priceGain >= 0 ? "text-success" : "text-destructive"}`}>
            {pnl.priceGain >= 0 ? "+" : ""}{fmt(pnl.priceGain, pos.currency)}
          </div>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">Borrow cost ({days}d)</div>
          <div className="font-semibold tabular-nums text-destructive">-{fmt(pnl.carry, pos.currency)}</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">Net P/L</div>
          <div className={`font-semibold tabular-nums ${pnl.net >= 0 ? "text-success" : "text-destructive"}`}>
            {pnl.net >= 0 ? "+" : ""}{fmt(pnl.net, pos.currency)}
          </div>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">Margin call ≈</div>
          <div className="font-semibold tabular-nums">{fmt(m.marginCallPrice, pos.currency)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
        <div>
          <Label className="text-[10px] uppercase">Target (cover)</Label>
          <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={fmt(pos.avgCost * 0.9, pos.currency)} className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-[10px] uppercase">Stop (buy-stop)</Label>
          <Input value={stop} onChange={(e) => setStop(e.target.value)} placeholder={fmt(pos.avgCost * 1.08, pos.currency)} className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-[10px] uppercase">Borrow APR (%)</Label>
          <Input value={borrowRate} onChange={(e) => setBorrowRate(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="gap-1" onClick={persist}>
            <Save className="h-3 w-3" /> Save
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setHedgeOpen((v) => !v)}>
            <Target className="h-3 w-3" /> Hedge
          </Button>
        </div>
      </div>

      {hedgeOpen && (
        <div className="pt-2 border-t border-border/60">
          <HedgeSuggestions symbol={pos.symbol} qty={shortQty} entryPrice={pos.avgCost} lastPrice={lastPrice || pos.avgCost} />
        </div>
      )}

      <p className="text-[10px] text-muted-foreground flex items-start gap-1">
        <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0" />
        Simulation only. Target/stop are educational overlays — they do not auto-execute. Borrow cost is illustrative and not deducted from cash.
      </p>
    </Card>
  );
}