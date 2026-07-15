import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Plus } from "lucide-react";
import { useAlerts, type AlertRule } from "@/hooks/useAlerts";
import { useToast } from "@/hooks/use-toast";
import type { FullAnalysis } from "@/lib/ta";
import type { OHLCBar } from "@/lib/technicalIndicators";

interface Props {
  symbol: string;
  name?: string;
  bars: OHLCBar[];
  analysis: FullAnalysis;
}

interface LevelOption {
  id: string;
  label: string;
  price: number;
  side: "above" | "below";
  source: "sr" | "trendline";
}

export function BreakoutAlertsCard({ symbol, name, bars, analysis }: Props) {
  const { toast } = useToast();
  const { getRule, upsertRule, removeRule } = useAlerts();
  const rule = getRule(symbol);

  const lastBar = bars[bars.length - 1];
  const lastPrice = lastBar?.close ?? 0;

  const levels: LevelOption[] = useMemo(() => {
    const out: LevelOption[] = [];
    for (const z of analysis.supportResistance) {
      out.push({
        id: `sr-${z.type}-${z.price.toFixed(4)}`,
        label: `${z.type === "support" ? "Support" : "Resistance"} ${z.price.toFixed(2)} · ${z.touches} touch${z.touches > 1 ? "es" : ""}`,
        price: z.price,
        side: z.type === "support" ? "below" : "above",
        source: "sr",
      });
    }
    for (const tl of analysis.trendlines) {
      const projected = tl.slope * (bars.length - 1) + tl.intercept;
      if (!isFinite(projected) || projected <= 0) continue;
      out.push({
        id: `tl-${tl.kind}-${projected.toFixed(4)}`,
        label: `${tl.kind === "up" ? "Uptrend" : "Downtrend"} line @ ${projected.toFixed(2)}${tl.broken ? " (already broken)" : ""}`,
        price: projected,
        side: tl.kind === "up" ? "below" : "above",
        source: "trendline",
      });
    }
    return out.sort((a, b) => a.price - b.price);
  }, [analysis, bars.length]);

  const [selectedAbove, setSelectedAbove] = useState<string>("");
  const [selectedBelow, setSelectedBelow] = useState<string>("");

  const applyBreakoutAlerts = () => {
    const above = levels.find((l) => l.id === selectedAbove);
    const below = levels.find((l) => l.id === selectedBelow);
    if (!above && !below) {
      toast({ title: "Pick at least one level", variant: "destructive" });
      return;
    }
    const next: AlertRule = {
      id: rule?.id ?? crypto.randomUUID(),
      symbol,
      name: name ?? symbol,
      priceAbove: above ? Number(above.price.toFixed(4)) : rule?.priceAbove ?? null,
      priceBelow: below ? Number(below.price.toFixed(4)) : rule?.priceBelow ?? null,
      changeUpPct: rule?.changeUpPct ?? null,
      changeDownPct: rule?.changeDownPct ?? null,
      sentimentAbove: rule?.sentimentAbove ?? null,
      sentimentBelow: rule?.sentimentBelow ?? null,
      enabled: true,
      createdAt: rule?.createdAt ?? Date.now(),
    };
    upsertRule(next);
    toast({
      title: "Breakout alerts armed",
      description: `${above ? `Notify on close above ${above.price.toFixed(2)}. ` : ""}${below ? `Notify on close below ${below.price.toFixed(2)}.` : ""}`,
    });
  };

  const disable = () => {
    if (rule) removeRule(symbol);
    toast({ title: "Alerts cleared for this symbol" });
  };

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Breakout alerts</h3>
          <Badge variant="outline" className="text-[10px]">S/R & trendlines</Badge>
        </div>
        {rule && (rule.priceAbove || rule.priceBelow) && (
          <Badge variant="outline" className="text-xs">
            Armed · {rule.priceAbove ? `↑ ${rule.priceAbove}` : ""}{rule.priceAbove && rule.priceBelow ? " · " : ""}{rule.priceBelow ? `↓ ${rule.priceBelow}` : ""}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Pick a resistance or trendline to notify on breakout above, and/or a support/uptrend line for a breakdown below.
        Last close: <span className="font-medium text-foreground">{lastPrice.toFixed(2)}</span>.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <LevelPicker
          title="Break ABOVE (bullish)"
          side="above"
          levels={levels.filter((l) => l.price > lastPrice)}
          value={selectedAbove}
          onChange={setSelectedAbove}
        />
        <LevelPicker
          title="Break BELOW (bearish)"
          side="below"
          levels={levels.filter((l) => l.price < lastPrice)}
          value={selectedBelow}
          onChange={setSelectedBelow}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={applyBreakoutAlerts} className="gap-2">
          <Plus className="h-4 w-4" /> Arm alerts
        </Button>
        {rule && (
          <Button size="sm" variant="outline" onClick={disable} className="gap-2">
            <BellOff className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Alerts fire on the browser monitor when live price crosses the level. Manage all rules on <a href="/alerts" className="underline">/alerts</a>.
      </p>
    </Card>
  );
}

function LevelPicker({
  title, side, levels, value, onChange,
}: {
  title: string;
  side: "above" | "below";
  levels: LevelOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <p className={`text-xs font-semibold mb-2 ${side === "above" ? "text-success" : "text-destructive"}`}>{title}</p>
      {levels.length === 0 && <p className="text-[11px] text-muted-foreground">No {side} levels detected.</p>}
      <div className="space-y-1 max-h-40 overflow-auto pr-1">
        {levels.map((l) => (
          <label key={l.id} className={`flex items-center gap-2 text-xs p-1.5 rounded cursor-pointer ${value === l.id ? "bg-primary/10 border border-primary/40" : "hover:bg-muted/40"}`}>
            <input
              type="radio"
              className="accent-primary"
              checked={value === l.id}
              onChange={() => onChange(value === l.id ? "" : l.id)}
              onClick={() => value === l.id && onChange("")}
            />
            <span className="flex-1 min-w-0 truncate">{l.label}</span>
            <Badge variant="outline" className="text-[9px]">{l.source === "sr" ? "S/R" : "TL"}</Badge>
          </label>
        ))}
      </div>
    </div>
  );
}