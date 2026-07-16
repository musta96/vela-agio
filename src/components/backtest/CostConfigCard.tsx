import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";
import type { CostConfig } from "@/lib/backtest/costs";

interface Props {
  costs: CostConfig;
  onChange: (c: CostConfig) => void;
}

const PRESETS: Array<{ label: string; c: CostConfig }> = [
  { label: "Frictionless",       c: { commissionPct: 0,    commissionFlat: 0, slippageBps: 0 } },
  { label: "Retail (0.1% + 5bps)", c: { commissionPct: 0.1, commissionFlat: 0, slippageBps: 5 } },
  { label: "Broker flat 5€",      c: { commissionPct: 0,    commissionFlat: 5, slippageBps: 3 } },
  { label: "High friction",       c: { commissionPct: 0.25, commissionFlat: 0, slippageBps: 15 } },
];

export function CostConfigCard({ costs, onChange }: Props) {
  const num = (v: string) => (v === "" ? 0 : Number(v));
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Transaction costs</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Applied to every entry and exit so backtest returns account for commissions and execution drag.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-[11px]">Commission %</Label>
            <Input type="number" step="0.01" value={costs.commissionPct ?? 0}
              onChange={(e) => onChange({ ...costs, commissionPct: num(e.target.value) })} />
          </div>
          <div>
            <Label className="text-[11px]">Flat / trade</Label>
            <Input type="number" step="0.5" value={costs.commissionFlat ?? 0}
              onChange={(e) => onChange({ ...costs, commissionFlat: num(e.target.value) })} />
          </div>
          <div>
            <Label className="text-[11px]">Slippage bps</Label>
            <Input type="number" step="1" value={costs.slippageBps ?? 0}
              onChange={(e) => onChange({ ...costs, slippageBps: num(e.target.value) })} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <Button key={p.label} size="sm" variant="outline" className="h-7 text-[11px]"
                    onClick={() => onChange(p.c)}>{p.label}</Button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Slippage widens buy prices upward and sell prices downward by the given basis points.
        </p>
      </CardContent>
    </Card>
  );
}