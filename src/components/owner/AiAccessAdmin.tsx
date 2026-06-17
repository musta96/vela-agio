import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Loader2, Zap } from "lucide-react";

type Cap = "none" | "flash" | "mid" | "premium";
type UsageRow = { user_id: string; cnt: number };

const CAP_LABEL: Record<Cap, string> = {
  none: "None (no AI)",
  flash: "Flash - cheap (Gemini Flash)",
  mid: "Mid - balanced (GPT-5 mini)",
  premium: "Premium - best (GPT-5 / Gemini Pro)",
};

export function AiAccessAdmin() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [cap, setCap] = useState<Cap>("flash");
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [totalThisMonth, setTotalThisMonth] = useState(0);

  const load = async () => {
    setLoading(true);
    const { data: ctrl } = await supabase
      .from("platform_controls")
      .select("enabled, value")
      .eq("key", "ai_beta_override")
      .maybeSingle();
    if (ctrl) {
      setEnabled(!!ctrl.enabled);
      const c = ((ctrl.value as any)?.model_cap ?? "flash") as Cap;
      setCap(c);
    }
    // Usage rollup - RLS lets admins read everything.
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { data: rows } = await supabase
      .from("ai_usage_log")
      .select("user_id, feature")
      .gte("created_at", monthStart.toISOString())
      .limit(1000);
    if (rows) {
      const map = new Map<string, number>();
      for (const r of rows) map.set(r.user_id, (map.get(r.user_id) ?? 0) + 1);
      const out = Array.from(map.entries())
        .map(([user_id, cnt]) => ({ user_id, cnt }))
        .sort((a, b) => b.cnt - a.cnt)
        .slice(0, 20);
      setUsage(out);
      setTotalThisMonth(rows.length);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("platform_controls")
      .upsert({
        key: "ai_beta_override",
        enabled,
        value: { model_cap: cap },
        reason: enabled ? `Beta override - all users get ${CAP_LABEL[cap]}` : null,
      }, { onConflict: "key" });
    setSaving(false);
    if (error) toast.error("Could not save", { description: error.message });
    else toast.success(enabled ? `AI enabled for ALL users (${cap})` : "AI gating restored to paid-only");
  };

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading AI access settings…</div>;

  return (
    <div className="space-y-6">
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">AI access control</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          By default, Lovable AI features are gated to paid subscribers. Toggle the beta override to grant access to <strong>every</strong> signed-in user - useful for free trials, launch promos and load testing. Costs are billed to your Lovable workspace.
        </p>
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Beta override</label>
            <div className="flex items-center gap-3 h-10">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              <span className="text-sm">{enabled ? <Badge variant="default" className="gap-1"><Zap className="h-3 w-3" />Active for everyone</Badge> : <span className="text-muted-foreground">Paid only</span>}</span>
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Model cap during beta</label>
            <Select value={cap} onValueChange={(v) => setCap(v as Cap)} disabled={!enabled}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CAP_LABEL) as Cap[]).filter(c => c !== "none").map(c => (
                  <SelectItem key={c} value={c}>{CAP_LABEL[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Free users can also unlock AI for free by adding their own API key (OpenAI / Anthropic / Gemini / OpenRouter) in <code className="text-foreground">Settings → AI provider</code> - no cost to you.
        </p>
      </Card>

      <Card className="p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold">This month's AI usage</h2>
          <Badge variant="outline" className="tabular-nums">{totalThisMonth.toLocaleString()} requests</Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Top 20 users by Lovable AI request count (BYO key usage is not billed to you and isn't shown here).</p>
        {usage.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI requests this month yet.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>User ID</TableHead><TableHead className="text-right">Requests</TableHead></TableRow></TableHeader>
            <TableBody>
              {usage.map(u => (
                <TableRow key={u.user_id}><TableCell className="font-mono text-xs">{u.user_id}</TableCell><TableCell className="text-right tabular-nums">{u.cnt}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}