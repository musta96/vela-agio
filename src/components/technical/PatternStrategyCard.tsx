import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wand2, Save, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { FullAnalysis } from "@/lib/ta";
import type { Bias } from "@/lib/ta/types";
import type { Condition, RiskConfig } from "@/lib/ta/strategyTypes";

interface Props {
  symbol: string;
  timeframe: string;
  analysis: FullAnalysis;
}

interface DetectedRow {
  key: string;
  kind: "candle" | "chart" | "structure";
  name: string;
  bias: Bias;
  detail: string;
  keyPrice?: number;
  invalidation?: number;
}

function buildStrategyFromPattern(
  row: DetectedRow,
  confirmationCandles: number,
  stopPct: number,
  targetRr: number,
): { entry: Condition[]; exit: Condition[]; risk: RiskConfig } {
  const risk: RiskConfig = {
    stopPct,
    targetPct: Number((stopPct * targetRr).toFixed(2)),
    riskPct: 1,
  };

  const entry: Condition[] = [];
  const exit: Condition[] = [];

  // Reversal candles: confirmation = N bars of momentum in the pattern's direction.
  if (row.kind === "candle") {
    if (row.bias === "bullish") {
      entry.push({ type: "rsi_below", value: 45 });
      entry.push({ type: "price_pct_change", period: Math.max(1, confirmationCandles), value: 0.5 });
      entry.push({ type: "price_above_sma", period: 20 });
      exit.push({ type: "rsi_above", value: 70 });
    } else if (row.bias === "bearish") {
      entry.push({ type: "rsi_above", value: 55 });
      entry.push({ type: "price_pct_change", period: Math.max(1, confirmationCandles), value: -0.5 });
      entry.push({ type: "price_below_sma", period: 20 });
      exit.push({ type: "rsi_below", value: 30 });
    } else {
      entry.push({ type: "sma_cross_up", fast: 20, slow: 50 });
      exit.push({ type: "sma_cross_down", fast: 20, slow: 50 });
    }
  }

  // Chart pattern: use price crossing the SMA proxy of the neckline direction.
  if (row.kind === "chart") {
    if (row.bias === "bullish") {
      entry.push({ type: "sma_cross_up", fast: 20, slow: 50 });
      entry.push({ type: "price_above_sma", period: 50 });
      entry.push({ type: "volume_spike", value: 1.5 });
      exit.push({ type: "macd_cross_down" });
    } else {
      entry.push({ type: "sma_cross_down", fast: 20, slow: 50 });
      entry.push({ type: "price_below_sma", period: 50 });
      entry.push({ type: "volume_spike", value: 1.5 });
      exit.push({ type: "macd_cross_up" });
    }
  }

  // Structure shift: BOS/CHoCH.
  if (row.kind === "structure") {
    if (row.bias === "bullish") {
      entry.push({ type: "price_above_sma", period: 20 });
      entry.push({ type: "macd_cross_up" });
      exit.push({ type: "macd_cross_down" });
    } else {
      entry.push({ type: "price_below_sma", period: 20 });
      entry.push({ type: "macd_cross_down" });
      exit.push({ type: "macd_cross_up" });
    }
  }

  return { entry, exit, risk };
}

export function PatternStrategyCard({ symbol, timeframe, analysis }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const rows: DetectedRow[] = useMemo(() => {
    const out: DetectedRow[] = [];
    for (const c of analysis.candlestickPatterns.slice(-8)) {
      out.push({
        key: `c-${c.index}-${c.name}`,
        kind: "candle",
        name: c.name,
        bias: c.bias,
        detail: c.description,
        invalidation: c.invalidation,
      });
    }
    for (const p of analysis.chartPatterns) {
      out.push({
        key: `p-${p.from}-${p.name}`,
        kind: "chart",
        name: p.name,
        bias: p.bias,
        detail: `Trigger ${p.keyPrice.toFixed(2)}${p.target ? ` · target ${p.target.toFixed(2)}` : ""}`,
        keyPrice: p.keyPrice,
        invalidation: p.invalidation,
      });
    }
    for (const s of analysis.structure.slice(-3)) {
      out.push({
        key: `s-${s.index}-${s.kind}`,
        kind: "structure",
        name: `${s.kind} ${s.bias === "bullish" ? "↑" : "↓"}`,
        bias: s.bias,
        detail: `Level ${s.level.toFixed(2)}`,
      });
    }
    return out;
  }, [analysis]);

  const [selectedKey, setSelectedKey] = useState<string>(rows[0]?.key ?? "");
  const [confirmationCandles, setConfirmationCandles] = useState<number>(2);
  const [stopPct, setStopPct] = useState<number>(5);
  const [targetRr, setTargetRr] = useState<number>(2);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const selected = rows.find((r) => r.key === selectedKey);
  const preview = selected
    ? buildStrategyFromPattern(selected, confirmationCandles, stopPct, targetRr)
    : null;

  const save = async () => {
    if (!user) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }
    if (!selected || !preview) return;
    setSaving(true);
    const { data, error } = await (supabase as any)
      .from("trading_strategies")
      .insert({
        user_id: user.id,
        name: `${symbol} · ${selected.name} (${timeframe})`,
        description: `Auto-generated from ${selected.kind} pattern. ${confirmationCandles} confirmation candle(s), ${stopPct}% stop, ${targetRr}:1 R:R.`,
        symbol,
        timeframe,
        entry_rules: preview.entry as any,
        exit_rules: preview.exit as any,
        risk_config: preview.risk as any,
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setSavedId((data as any).id);
    toast({ title: "Strategy created", description: "Ready to backtest with your risk parameters." });
  };

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center gap-2 mb-4">
        <Wand2 className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Pattern → Strategy</h3>
        <Badge variant="outline" className="text-[10px]">Auto-rules · backtest ready</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Pick a detected pattern; we translate it into entry/exit rules plus risk parameters.
        Adjust the confirmation candles and R:R, then save & backtest.
      </p>

      {rows.length === 0 && <p className="text-sm text-muted-foreground">No patterns currently detected.</p>}

      {rows.length > 0 && (
        <>
          <div className="grid gap-3 md:grid-cols-2 mb-4">
            <div>
              <Label className="text-xs">Detected pattern</Label>
              <Select value={selectedKey} onValueChange={setSelectedKey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {rows.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      [{r.kind}] {r.name} · {r.bias}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Timeframe</Label>
              <Input value={timeframe} readOnly />
            </div>
            <div>
              <Label className="text-xs">Confirmation candles</Label>
              <Input type="number" min={1} max={10} value={confirmationCandles} onChange={(e) => setConfirmationCandles(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div>
              <Label className="text-xs">Stop-loss %</Label>
              <Input type="number" min={0.5} step={0.5} value={stopPct} onChange={(e) => setStopPct(Number(e.target.value) || 5)} />
            </div>
            <div>
              <Label className="text-xs">Target R:R</Label>
              <Input type="number" min={0.5} step={0.5} value={targetRr} onChange={(e) => setTargetRr(Number(e.target.value) || 2)} />
            </div>
            <div className="flex items-end">
              <div className="text-xs text-muted-foreground">
                Target ≈ <span className="font-semibold text-foreground">{(stopPct * targetRr).toFixed(1)}%</span> · Risk per trade 1% equity
              </div>
            </div>
          </div>

          {selected && preview && (
            <div className="p-3 rounded-md bg-muted/30 border border-border text-xs mb-3">
              <p className="font-semibold mb-1">Preview: {selected.name}</p>
              <p className="text-muted-foreground mb-2">{selected.detail}</p>
              <p><span className="text-success font-medium">ENTER</span> when all:</p>
              <ul className="list-disc list-inside mb-1">
                {preview.entry.map((c, i) => <li key={i}>{JSON.stringify(c)}</li>)}
              </ul>
              <p><span className="text-destructive font-medium">EXIT</span> when any of:</p>
              <ul className="list-disc list-inside">
                {preview.exit.map((c, i) => <li key={i}>{JSON.stringify(c)}</li>)}
                <li>Stop-loss {stopPct}% or target {(stopPct * targetRr).toFixed(1)}% ({targetRr}:1 R:R)</li>
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={save} disabled={saving || !selected} className="gap-2">
              <Save className="h-4 w-4" /> Save as strategy
            </Button>
            {savedId && (
              <Button asChild size="sm" variant="secondary" className="gap-2">
                <Link to={`/backtest?strategy_id=${encodeURIComponent(savedId)}`}>
                  <Play className="h-4 w-4" /> Backtest now
                </Link>
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}