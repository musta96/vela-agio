import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Target, TrendingDown, TrendingUp } from "lucide-react";
import { computeTradePlan, type SRZone } from "@/lib/ta";

interface Props {
  lastPrice: number;
  atr: number | null;
  zones: SRZone[]; // sorted strongest first
}

export function TradePlannerCard({ lastPrice, atr, zones }: Props) {
  const [side, setSide] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState(lastPrice);
  // Default stop = nearest S/R against the trade + a small ATR buffer.
  const buffer = (atr ?? lastPrice * 0.01) * 0.25;
  const nearestSupport = useMemo(
    () => zones.filter((z) => z.type === "support" && z.price < lastPrice).sort((a, b) => b.price - a.price)[0]?.price,
    [zones, lastPrice],
  );
  const nearestResistance = useMemo(
    () => zones.filter((z) => z.type === "resistance" && z.price > lastPrice).sort((a, b) => a.price - b.price)[0]?.price,
    [zones, lastPrice],
  );
  const [stop, setStop] = useState(
    side === "long"
      ? (nearestSupport ?? lastPrice * 0.97) - buffer
      : (nearestResistance ?? lastPrice * 1.03) + buffer,
  );
  const [target, setTarget] = useState(
    side === "long"
      ? (nearestResistance ?? lastPrice * 1.06)
      : (nearestSupport ?? lastPrice * 0.94),
  );
  const [equity, setEquity] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);

  // Keep entry synced to last price when it changes materially.
  useEffect(() => { setEntry(lastPrice); }, [lastPrice]);

  useEffect(() => {
    if (side === "long") {
      setStop((nearestSupport ?? lastPrice * 0.97) - buffer);
      setTarget(nearestResistance ?? lastPrice * 1.06);
    } else {
      setStop((nearestResistance ?? lastPrice * 1.03) + buffer);
      setTarget(nearestSupport ?? lastPrice * 0.94);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, lastPrice, nearestSupport, nearestResistance]);

  const plan = computeTradePlan({ side, entry, stop, target, accountEquity: equity, riskPct, atr });

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Trade planner · R:R + position sizing</h3>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant={side === "long" ? "default" : "outline"} onClick={() => setSide("long")}>
            <TrendingUp className="h-3 w-3 mr-1" /> Long
          </Button>
          <Button size="sm" variant={side === "short" ? "default" : "outline"} onClick={() => setSide("short")}>
            <TrendingDown className="h-3 w-3 mr-1" /> Short
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <Label className="text-xs">Entry</Label>
          <Input type="number" step="0.01" value={entry} onChange={(e) => setEntry(parseFloat(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs">Stop</Label>
          <Input type="number" step="0.01" value={stop} onChange={(e) => setStop(parseFloat(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs">Target</Label>
          <Input type="number" step="0.01" value={target} onChange={(e) => setTarget(parseFloat(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs">Account equity ($)</Label>
          <Input type="number" step="100" value={equity} onChange={(e) => setEquity(parseFloat(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs">Risk per trade (%)</Label>
          <Input type="number" step="0.1" value={riskPct} onChange={(e) => setRiskPct(parseFloat(e.target.value))} />
        </div>
      </div>

      {plan && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3">
          <Stat label="Risk / share" value={`$${plan.riskPerShare.toFixed(2)}`} />
          <Stat label="Reward / share" value={`$${plan.rewardPerShare.toFixed(2)}`} />
          <Stat label="R:R"
            value={`${plan.rr.toFixed(2)}R`}
            tone={plan.rr >= 2 ? "bull" : plan.rr >= 1 ? "warn" : "bear"}
          />
          <Stat
            label="Stop as ATR"
            value={plan.atrMultiple ? `${plan.atrMultiple.toFixed(2)}×` : "—"}
            tone={plan.atrMultiple && plan.atrMultiple < 1 ? "warn" : undefined}
          />
          <Stat label="Position size" value={`${plan.positionSize.toLocaleString()} sh`} />
          <Stat label="Position value" value={`$${plan.positionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          <Stat label="Risked $"
            value={`$${plan.riskAmount.toFixed(2)}`}
          />
        </div>
      )}

      {plan?.warnings?.length ? (
        <div className="mt-3 space-y-1">
          {plan.warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-warning">
              <AlertTriangle className="h-3 w-3" /> {w}
            </div>
          ))}
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground mt-4">
        Stop and target auto-fill from the nearest support / resistance detected on the chart. Position size respects your risk-per-trade %; adjust the account equity to match your broker.
      </p>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" | "warn" }) {
  const color = tone === "bull" ? "text-success" : tone === "bear" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <div className="p-2 rounded-md border border-border/60">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-semibold font-mono ${color}`}>{value}</p>
    </div>
  );
}