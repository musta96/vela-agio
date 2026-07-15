import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Wrench, Plus, X, Play, Save, Trash2 } from "lucide-react";
import {
  CONDITION_LABELS,
  describeCondition,
  type Condition,
  type ConditionType,
  type RiskConfig,
  type TradingStrategyRow,
} from "@/lib/ta/strategyTypes";

interface Props {
  symbol: string;
  timeframe: string;
}

const EMPTY_ENTRY: Condition[] = [{ type: "rsi_below", value: 30 }];
const EMPTY_EXIT: Condition[]  = [{ type: "rsi_above", value: 70 }];

export function StrategyBuilderCard({ symbol, timeframe }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState<string>(`${symbol} · ${timeframe} strategy`);
  const [description, setDescription] = useState<string>("");
  const [entry, setEntry] = useState<Condition[]>(EMPTY_ENTRY);
  const [exit, setExit] = useState<Condition[]>(EMPTY_EXIT);
  const [risk, setRisk] = useState<RiskConfig>({ stopPct: 5, targetPct: 10, riskPct: 1 });
  const [saved, setSaved] = useState<TradingStrategyRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSaved = async () => {
    if (!user) return;
    const { data, error } = await (supabase as any)
      .from("trading_strategies")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) return;
    setSaved((data as TradingStrategyRow[]) ?? []);
  };

  useEffect(() => { loadSaved(); }, [user]);

  useEffect(() => {
    setName((prev) => prev.startsWith(symbol) ? `${symbol} · ${timeframe} strategy` : prev);
  }, [symbol, timeframe]);

  const addCondition = (list: Condition[], set: (c: Condition[]) => void) => {
    set([...list, { type: "price_above_sma", period: 50 }]);
  };
  const updateCondition = (list: Condition[], set: (c: Condition[]) => void, i: number, patch: Partial<Condition>) => {
    set(list.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };
  const removeCondition = (list: Condition[], set: (c: Condition[]) => void, i: number) => {
    set(list.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Sign in to save trading strategies.", variant: "destructive" });
      return;
    }
    if (entry.length === 0) {
      toast({ title: "Add at least one entry rule", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      name: name.trim() || "Untitled strategy",
      description: description || null,
      symbol, timeframe,
      entry_rules: entry as any,
      exit_rules: exit as any,
      risk_config: risk as any,
    };
    let res;
    if (selectedId) {
      res = await (supabase as any).from("trading_strategies").update(payload).eq("id", selectedId).select().single();
    } else {
      res = await (supabase as any).from("trading_strategies").insert(payload).select().single();
    }
    setSaving(false);
    if (res.error) {
      toast({ title: "Save failed", description: res.error.message, variant: "destructive" });
      return;
    }
    setSelectedId((res.data as any).id);
    toast({ title: "Strategy saved" });
    loadSaved();
  };

  const handleLoad = (row: TradingStrategyRow) => {
    setSelectedId(row.id);
    setName(row.name);
    setDescription(row.description ?? "");
    setEntry(row.entry_rules ?? []);
    setExit(row.exit_rules ?? []);
    setRisk(row.risk_config ?? {});
  };

  const handleDelete = async (row: TradingStrategyRow) => {
    const { error } = await (supabase as any).from("trading_strategies").delete().eq("id", row.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    if (selectedId === row.id) setSelectedId(null);
    loadSaved();
    toast({ title: "Strategy deleted" });
  };

  const backtestHref = selectedId
    ? `/backtest?strategy_id=${encodeURIComponent(selectedId)}`
    : null;

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center gap-2 mb-4">
        <Wrench className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Strategy Builder</h3>
        <Badge variant="outline" className="text-[10px]">
          Rule-based · backtest ready
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Build an entry & exit rule from the detected primitives, save it to your profile, and backtest it on historical bars.
      </p>

      {/* Header */}
      <div className="grid gap-3 md:grid-cols-2 mb-4">
        <div>
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Description (optional)</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Buy oversold reversals on Enel" />
        </div>
      </div>

      {/* Entry rules */}
      <RuleList
        title="Entry (all must be true)"
        list={entry}
        onAdd={() => addCondition(entry, setEntry)}
        onChange={(i, p) => updateCondition(entry, setEntry, i, p)}
        onRemove={(i) => removeCondition(entry, setEntry, i)}
      />

      {/* Exit rules */}
      <RuleList
        title="Exit"
        list={exit}
        onAdd={() => addCondition(exit, setExit)}
        onChange={(i, p) => updateCondition(exit, setExit, i, p)}
        onRemove={(i) => removeCondition(exit, setExit, i)}
      />

      {/* Risk */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-xs">Stop-loss %</Label>
          <Input type="number" value={risk.stopPct ?? ""} onChange={(e) => setRisk({ ...risk, stopPct: Number(e.target.value) || undefined })} />
        </div>
        <div>
          <Label className="text-xs">Target %</Label>
          <Input type="number" value={risk.targetPct ?? ""} onChange={(e) => setRisk({ ...risk, targetPct: Number(e.target.value) || undefined })} />
        </div>
        <div>
          <Label className="text-xs">Risk % per trade</Label>
          <Input type="number" value={risk.riskPct ?? ""} onChange={(e) => setRisk({ ...risk, riskPct: Number(e.target.value) || undefined })} />
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 p-3 rounded-md bg-muted/30 border border-border text-xs">
        <p className="font-semibold mb-1">Rule summary</p>
        <p><span className="text-success font-medium">ENTER LONG</span> when: {entry.map(describeCondition).join(" AND ") || "—"}</p>
        <p><span className="text-destructive font-medium">EXIT</span> when: {exit.map(describeCondition).join(" AND ") || "—"}
          {risk.stopPct ? ` OR price falls ${risk.stopPct}% (stop)` : ""}
          {risk.targetPct ? ` OR price rises ${risk.targetPct}% (target)` : ""}.</p>
        {risk.stopPct && risk.targetPct ? (
          <p className="mt-1 text-muted-foreground">
            R:R = <span className="font-semibold text-foreground">{(risk.targetPct / risk.stopPct).toFixed(2)}:1</span>
            {risk.riskPct ? ` · position sized to risk ${risk.riskPct}% of equity per trade` : ""}
          </p>
        ) : null}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {selectedId ? "Update" : "Save"}
        </Button>
        {backtestHref && (
          <Button asChild size="sm" variant="secondary" className="gap-2">
            <Link to={backtestHref}><Play className="h-4 w-4" /> Backtest on /backtest</Link>
          </Button>
        )}
        {selectedId && (
          <Button size="sm" variant="outline" onClick={() => {
            setSelectedId(null);
            setName(`${symbol} · ${timeframe} strategy`);
            setDescription("");
            setEntry(EMPTY_ENTRY);
            setExit(EMPTY_EXIT);
            setRisk({ stopPct: 5, targetPct: 10, riskPct: 1 });
          }}>New</Button>
        )}
      </div>

      {/* Saved list */}
      {saved.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold mb-2 text-muted-foreground">Your saved strategies ({saved.length})</p>
          <div className="space-y-1 max-h-56 overflow-auto">
            {saved.map((s) => (
              <div key={s.id} className={`flex items-center justify-between p-2 rounded border text-sm ${selectedId === s.id ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}>
                <button onClick={() => handleLoad(s)} className="flex-1 min-w-0 text-left">
                  <span className="font-medium truncate">{s.name}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {s.symbol ?? "—"} · {s.timeframe ?? "—"}
                  </span>
                </button>
                <Link to={`/backtest?strategy_id=${encodeURIComponent(s.id)}`}
                      className="text-[11px] text-primary hover:underline mr-2">Backtest</Link>
                <button onClick={() => handleDelete(s)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function RuleList({
  title, list, onAdd, onChange, onRemove,
}: {
  title: string;
  list: Condition[];
  onAdd: () => void;
  onChange: (i: number, p: Partial<Condition>) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <Label className="text-sm">{title}</Label>
        <Button size="sm" variant="outline" onClick={onAdd} className="gap-1 h-7">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      <div className="space-y-2">
        {list.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 p-2 rounded border border-border bg-muted/10">
            <Select value={c.type} onValueChange={(v) => onChange(i, { type: v as ConditionType })}>
              <SelectTrigger className="h-8 w-[240px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CONDITION_LABELS) as ConditionType[]).map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">{CONDITION_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ParamInputs c={c} onChange={(p) => onChange(i, p)} />
            <button onClick={() => onRemove(i)} className="ml-auto text-muted-foreground hover:text-destructive">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {list.length === 0 && <p className="text-xs text-muted-foreground">No rules yet.</p>}
      </div>
    </div>
  );
}

function ParamInputs({ c, onChange }: { c: Condition; onChange: (p: Partial<Condition>) => void }) {
  const num = (v: string) => (v === "" ? undefined : Number(v));
  switch (c.type) {
    case "rsi_below":
    case "rsi_above":
      return <NumField label="Level" value={c.value ?? (c.type === "rsi_below" ? 30 : 70)} onChange={(v) => onChange({ value: v })} />;
    case "sma_cross_up":
    case "sma_cross_down":
      return (
        <>
          <NumField label="Fast" value={c.fast ?? 20} onChange={(v) => onChange({ fast: v })} />
          <NumField label="Slow" value={c.slow ?? 50} onChange={(v) => onChange({ slow: v })} />
        </>
      );
    case "price_above_sma":
    case "price_below_sma":
      return <NumField label="SMA period" value={c.period ?? 50} onChange={(v) => onChange({ period: v })} />;
    case "volume_spike":
      return <NumField label="× avg" value={c.value ?? 2} onChange={(v) => onChange({ value: v })} step={0.1} />;
    case "price_pct_change":
      return (
        <>
          <NumField label="Bars" value={c.period ?? 5} onChange={(v) => onChange({ period: v })} />
          <NumField label="≥ %" value={c.value ?? 5} onChange={(v) => onChange({ value: v })} step={0.5} />
        </>
      );
    default:
      return null;
  }
}

function NumField({ label, value, onChange, step }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; step?: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Input
        type="number"
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="h-8 w-20 text-xs"
      />
    </div>
  );
}
