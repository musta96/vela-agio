import { useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, Plus, Trash2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface Rule {
  id: string;
  kind: string;
  symbol: string | null;
  name: string | null;
  threshold: number | null;
  enabled: boolean;
  notify_email_immediate: boolean;
  cooldown_minutes: number;
  last_fired_at: string | null;
  created_at: string;
}

interface Prefs {
  user_id: string;
  email_enabled: boolean;
  daily_digest_enabled: boolean;
  digest_hour_utc: number;
  immediate_only_critical: boolean;
}

const KIND_OPTIONS: { value: string; label: string; symbolRequired: boolean; thresholdLabel?: string }[] = [
  { value: "price_above", label: "Price above (€)", symbolRequired: true, thresholdLabel: "Price" },
  { value: "price_below", label: "Price below (€)", symbolRequired: true, thresholdLabel: "Price" },
  { value: "change_up_pct", label: "Daily change up ≥ %", symbolRequired: true, thresholdLabel: "%" },
  { value: "change_down_pct", label: "Daily change down ≥ %", symbolRequired: true, thresholdLabel: "%" },
  { value: "rsi_overbought", label: "RSI overbought (≥)", symbolRequired: true, thresholdLabel: "RSI" },
  { value: "rsi_oversold", label: "RSI oversold (≤)", symbolRequired: true, thresholdLabel: "RSI" },
  { value: "macd_cross", label: "MACD cross", symbolRequired: true },
  { value: "ma_cross", label: "Golden/Death cross (50/200)", symbolRequired: true },
  { value: "breakout_52w", label: "52-week breakout", symbolRequired: true },
  { value: "portfolio_drawdown", label: "Portfolio drawdown ≥ %", symbolRequired: false, thresholdLabel: "%" },
  { value: "portfolio_concentration", label: "Single holding > % of portfolio", symbolRequired: false, thresholdLabel: "%" },
];

const Alerts = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [rules, setRules] = useState<Rule[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);

  const [kind, setKind] = useState("price_above");
  const [symbol, setSymbol] = useState("");
  const [threshold, setThreshold] = useState("");
  const [immediateEmail, setImmediateEmail] = useState(false);

  const currentKind = useMemo(() => KIND_OPTIONS.find((k) => k.value === kind)!, [kind]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [r, p] = await Promise.all([
      supabase.from("alert_rules").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("alert_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    setRules((r.data as Rule[]) ?? []);
    if (p.data) setPrefs(p.data as Prefs);
    else {
      // create defaults row
      const def: Prefs = {
        user_id: user.id,
        email_enabled: true,
        daily_digest_enabled: true,
        digest_hour_utc: 7,
        immediate_only_critical: true,
      };
      await supabase.from("alert_preferences").insert(def);
      setPrefs(def);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const addRule = async () => {
    if (!user) return;
    if (currentKind.symbolRequired && !symbol.trim()) {
      toast({ title: "Symbol required", variant: "destructive" });
      return;
    }
    const t = threshold === "" ? null : Number(threshold);
    if (currentKind.thresholdLabel && (t == null || !Number.isFinite(t))) {
      toast({ title: "Threshold required", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("alert_rules").insert({
      user_id: user.id,
      kind,
      symbol: currentKind.symbolRequired ? symbol.trim().toUpperCase() : null,
      name: currentKind.symbolRequired ? symbol.trim().toUpperCase() : null,
      threshold: t,
      notify_email_immediate: immediateEmail,
    });
    if (error) {
      toast({ title: "Failed to add rule", description: error.message, variant: "destructive" });
      return;
    }
    setSymbol("");
    setThreshold("");
    setImmediateEmail(false);
    toast({ title: "Alert added" });
    load();
  };

  const toggleRule = async (rule: Rule, field: "enabled" | "notify_email_immediate", value: boolean) => {
    const patch: { enabled?: boolean; notify_email_immediate?: boolean } =
      field === "enabled" ? { enabled: value } : { notify_email_immediate: value };
    await supabase.from("alert_rules").update(patch).eq("id", rule.id);
    load();
  };

  const removeRule = async (id: string) => {
    await supabase.from("alert_rules").delete().eq("id", id);
    load();
  };

  const updatePrefs = async (patch: Partial<Prefs>) => {
    if (!user || !prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    await supabase.from("alert_preferences").upsert({ ...next, user_id: user.id });
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Alerts & Notifications"
        description="Configure server-side alerts on price moves, technical signals, AI picks, and portfolio risk. Get a daily morning digest by email."
        path="/alerts"
      />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <header className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-gradient">Alerts & Automation</h1>
            <p className="text-sm text-muted-foreground">
              Server-side rules evaluated every 5 minutes. Daily digest sent every morning by email.
            </p>
          </div>
        </header>

        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Email preferences</h2>
          {prefs && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Email notifications</div>
                  <div className="text-xs text-muted-foreground">Enable to receive emails at all</div>
                </div>
                <Switch
                  checked={prefs.email_enabled}
                  onCheckedChange={(v) => updatePrefs({ email_enabled: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Daily morning digest</div>
                  <div className="text-xs text-muted-foreground">One summary email per day</div>
                </div>
                <Switch
                  checked={prefs.daily_digest_enabled}
                  onCheckedChange={(v) => updatePrefs({ daily_digest_enabled: v })}
                />
              </div>
              <div>
                <Label className="text-xs">Digest delivery hour (UTC)</Label>
                <Select
                  value={String(prefs.digest_hour_utc)}
                  onValueChange={(v) => updatePrefs({ digest_hour_utc: Number(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }).map((_, h) => (
                      <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00 UTC</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">07:00 UTC ≈ 09:00 Rome (summer)</p>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Immediate emails only for critical</div>
                  <div className="text-xs text-muted-foreground">Suppress info alerts from immediate sends</div>
                </div>
                <Switch
                  checked={prefs.immediate_only_critical}
                  onCheckedChange={(v) => updatePrefs({ immediate_only_critical: v })}
                />
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Add a rule</h2>
          <div className="grid md:grid-cols-5 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">Type</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Symbol</Label>
              <Input
                placeholder="e.g. ENI.MI"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                disabled={!currentKind.symbolRequired}
              />
            </div>
            <div>
              <Label className="text-xs">{currentKind.thresholdLabel ?? "—"}</Label>
              <Input
                inputMode="decimal"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                disabled={!currentKind.thresholdLabel}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={addRule} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={immediateEmail} onCheckedChange={setImmediateEmail} id="imm" />
            <Label htmlFor="imm" className="text-xs flex items-center gap-1">
              <Mail className="h-3 w-3" /> Send me an email immediately when this fires (otherwise included in daily digest)
            </Label>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Your rules</h2>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : rules.length === 0 ? (
            <div className="text-sm text-muted-foreground">No rules yet. Add your first above.</div>
          ) : (
            <ul className="divide-y divide-border">
              {rules.map((r) => {
                const opt = KIND_OPTIONS.find((k) => k.value === r.kind);
                return (
                  <li key={r.id} className="py-3 flex items-center gap-3">
                    <Badge variant="outline">{opt?.label ?? r.kind}</Badge>
                    <div className="text-sm font-medium">
                      {r.symbol ?? "Portfolio"}{r.threshold != null ? ` · ${r.threshold}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground ml-auto flex items-center gap-4">
                      <label className="flex items-center gap-2">
                        <span>Enabled</span>
                        <Switch checked={r.enabled} onCheckedChange={(v) => toggleRule(r, "enabled", v)} />
                      </label>
                      <label className="flex items-center gap-2">
                        <Mail className="h-3 w-3" />
                        <Switch
                          checked={r.notify_email_immediate}
                          onCheckedChange={(v) => toggleRule(r, "notify_email_immediate", v)}
                        />
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRule(r.id)}
                        aria-label={`Delete rule ${r.kind}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </main>
    </div>
  );
};

export default Alerts;