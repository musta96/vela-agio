import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export interface SimulationSettingsValue {
  name: string;
  currency: string;
  startingCash: number;
  cash: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: SimulationSettingsValue;
  /** Persist edited settings. */
  onSave: (v: SimulationSettingsValue) => Promise<void> | void;
  /** Wipe all trades and restore cash to the starting amount. */
  onReset: () => Promise<void> | void;
  /** Delete the whole simulation. */
  onDelete: () => Promise<void> | void;
}

const CURRENCIES = ["EUR", "USD", "GBP", "CHF"];

/**
 * Lets the user change every input of a paper simulation: its name, the base
 * currency, the total amount invested (starting cash) and the cash currently
 * available. Changing the starting amount shifts available cash by the same
 * delta so open positions and P&L stay consistent.
 */
export function SimulationSettingsDialog({ open, onOpenChange, value, onSave, onReset, onDelete }: Props) {
  const [name, setName] = useState(value.name);
  const [currency, setCurrency] = useState(value.currency || "EUR");
  const [starting, setStarting] = useState(String(value.startingCash ?? 0));
  const [cash, setCash] = useState(String(value.cash ?? 0));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(value.name);
    setCurrency(value.currency || "EUR");
    setStarting(String(value.startingCash ?? 0));
    setCash(String(value.cash ?? 0));
  }, [open, value.name, value.currency, value.startingCash, value.cash]);

  // Keep available cash in step with the invested total unless it is edited directly.
  function changeStarting(next: string) {
    const prev = Number(starting) || 0;
    const n = Number(next);
    setStarting(next);
    if (Number.isFinite(n)) setCash(String(Math.max(0, (Number(cash) || 0) + (n - prev))));
  }

  async function save() {
    setBusy(true);
    try {
      await onSave({
        name: name.trim() || value.name,
        currency,
        startingCash: Math.max(0, Number(starting) || 0),
        cash: Math.max(0, Number(cash) || 0),
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Simulation settings</DialogTitle>
          <DialogDescription>Change the name, currency and the amount of virtual money in this simulation.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Total amount invested</Label>
              <Input type="number" min="0" step="100" value={starting} onChange={(e) => changeStarting(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Cash available now</Label>
              <Input type="number" min="0" step="100" value={cash} onChange={(e) => setCash(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Raising the total also adds the same amount to your available cash. Edit the cash field afterwards if you want a different split.
          </p>

          <Alert className="border-amber-500/40 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-[11px]">
              Reset clears every simulated trade and puts all the money back into cash. Delete removes the whole simulation. Neither can be undone.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await onReset(); onOpenChange(false); } finally { setBusy(false); } }}>
              Reset trades
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={async () => { setBusy(true); try { await onDelete(); onOpenChange(false); } finally { setBusy(false); } }}>
              Delete
            </Button>
          </div>
          <Button onClick={save} disabled={busy}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
