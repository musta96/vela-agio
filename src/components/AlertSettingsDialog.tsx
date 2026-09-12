import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAlerts, type AlertRule } from "@/hooks/useAlerts";
import { useToast } from "@/hooks/use-toast";

interface Props {
  symbol: string;
  name: string;
  currentPrice?: number;
}

const numOrNull = (v: string): number | null => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fixedTwo = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrentPrice = (value: unknown): string =>
  typeof value === "number" && Number.isFinite(value) ? ` Current price: ${fixedTwo.format(value)}.` : "";

export const AlertSettingsDialog = ({ symbol, name, currentPrice }: Props) => {
  const { getRule, upsertRule, removeRule } = useAlerts();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const existing = getRule(symbol);

  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [priceAbove, setPriceAbove] = useState(existing?.priceAbove?.toString() ?? "");
  const [priceBelow, setPriceBelow] = useState(existing?.priceBelow?.toString() ?? "");
  const [changeUp, setChangeUp] = useState(existing?.changeUpPct?.toString() ?? "");
  const [changeDown, setChangeDown] = useState(existing?.changeDownPct?.toString() ?? "");
  const [sentAbove, setSentAbove] = useState(existing?.sentimentAbove?.toString() ?? "");
  const [sentBelow, setSentBelow] = useState(existing?.sentimentBelow?.toString() ?? "");

  useEffect(() => {
    if (!open) return;
    const e = getRule(symbol);
    setEnabled(e?.enabled ?? true);
    setPriceAbove(e?.priceAbove?.toString() ?? "");
    setPriceBelow(e?.priceBelow?.toString() ?? "");
    setChangeUp(e?.changeUpPct?.toString() ?? "");
    setChangeDown(e?.changeDownPct?.toString() ?? "");
    setSentAbove(e?.sentimentAbove?.toString() ?? "");
    setSentBelow(e?.sentimentBelow?.toString() ?? "");
  }, [open, symbol, getRule]);

  const hasAny = !!existing;

  const save = () => {
    const rule: AlertRule = {
      id: existing?.id ?? `${symbol}-${Date.now()}`,
      symbol,
      name,
      enabled,
      priceAbove: numOrNull(priceAbove),
      priceBelow: numOrNull(priceBelow),
      changeUpPct: numOrNull(changeUp),
      changeDownPct: numOrNull(changeDown),
      sentimentAbove: numOrNull(sentAbove),
      sentimentBelow: numOrNull(sentBelow),
      createdAt: existing?.createdAt ?? Date.now(),
    };
    const anyCondition =
      rule.priceAbove != null ||
      rule.priceBelow != null ||
      rule.changeUpPct != null ||
      rule.changeDownPct != null ||
      rule.sentimentAbove != null ||
      rule.sentimentBelow != null;
    if (!anyCondition) {
      toast({ title: "Add at least one condition", description: "Enter a price, change, or sentiment threshold.", variant: "destructive" });
      return;
    }
    upsertRule(rule);
    toast({ title: "Alert saved", description: `${symbol} - conditions active` });
    setOpen(false);
  };

  const clear = () => {
    removeRule(symbol);
    toast({ title: "Alert removed", description: symbol });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Configure alerts"
          title={hasAny ? "Edit alerts" : "Set up alerts"}
        >
          {hasAny && existing?.enabled ? (
            <BellRing className="h-4 w-4 text-primary" />
          ) : (
            <Bell className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alerts for {symbol}</DialogTitle>
          <DialogDescription>
            Get notified when price or sentiment matches your conditions.
            {formatCurrentPrice(currentPrice)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">Enabled</div>
              <div className="text-xs text-muted-foreground">Monitor while the app is open</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">Price</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="pa" className="text-xs">Above</Label>
                <Input id="pa" inputMode="decimal" placeholder="e.g. 25.00" value={priceAbove} onChange={(e) => setPriceAbove(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pb" className="text-xs">Below</Label>
                <Input id="pb" inputMode="decimal" placeholder="e.g. 20.00" value={priceBelow} onChange={(e) => setPriceBelow(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">Daily change %</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="cu" className="text-xs">Up ≥</Label>
                <Input id="cu" inputMode="decimal" placeholder="e.g. 3" value={changeUp} onChange={(e) => setChangeUp(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="cd" className="text-xs">Down ≥</Label>
                <Input id="cd" inputMode="decimal" placeholder="e.g. 3" value={changeDown} onChange={(e) => setChangeDown(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">Sentiment (0–100)</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="sa" className="text-xs">Bullish ≥</Label>
                <Input id="sa" inputMode="numeric" placeholder="e.g. 70" value={sentAbove} onChange={(e) => setSentAbove(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="sb" className="text-xs">Bearish ≤</Label>
                <Input id="sb" inputMode="numeric" placeholder="e.g. 30" value={sentBelow} onChange={(e) => setSentBelow(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Sentiment is refreshed every ~10 minutes using AI news analysis.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {hasAny && (
            <Button variant="ghost" onClick={clear} className="mr-auto text-destructive hover:text-destructive">
              Remove
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save}>Save alert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
