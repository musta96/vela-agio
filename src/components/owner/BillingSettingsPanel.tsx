import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gift, Loader2, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Settings = {
  trial_length_days: number;
  grace_period_days: number;
  retention_offer_enabled: boolean;
  retention_discount_type: "percentage" | "fixed";
  retention_discount_value: number;
  retention_duration_months: number;
  retention_offer_copy: string;
};

const DEFAULTS: Settings = {
  trial_length_days: 7, grace_period_days: 3,
  retention_offer_enabled: true, retention_discount_type: "percentage",
  retention_discount_value: 30, retention_duration_months: 3,
  retention_offer_copy: "",
};

function offerHeadline(s: Settings): string {
  const value = Number(s.retention_discount_value || 0);
  const disc = s.retention_discount_type === "percentage" ? `${value}% off` : `€${value.toFixed(0)} off`;
  const months = Math.max(1, Number(s.retention_duration_months || 1));
  return `${disc} for the next ${months} ${months === 1 ? "month" : "months"}`;
}

export default function BillingSettingsPanel() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("billing_settings").select("*").eq("id", 1).maybeSingle();
    if (data) setS({
      trial_length_days: (data as any).trial_length_days,
      grace_period_days: (data as any).grace_period_days,
      retention_offer_enabled: (data as any).retention_offer_enabled,
      retention_discount_type: (data as any).retention_discount_type,
      retention_discount_value: Number((data as any).retention_discount_value),
      retention_duration_months: (data as any).retention_duration_months,
      retention_offer_copy: (data as any).retention_offer_copy ?? "",
    });
    setDirty(false);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const patch = (p: Partial<Settings>) => { setS((prev) => ({ ...prev, ...p })); setDirty(true); };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("billing_settings").update({
      trial_length_days: s.trial_length_days,
      grace_period_days: s.grace_period_days,
      retention_offer_enabled: s.retention_offer_enabled,
      retention_discount_type: s.retention_discount_type,
      retention_discount_value: s.retention_discount_value,
      retention_duration_months: s.retention_duration_months,
      retention_offer_copy: s.retention_offer_copy,
    }).eq("id", 1);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Billing settings saved. Changes are live now."); setDirty(false); }
  };

  const preview = useMemo(() => s, [s]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Billing settings</h1>
        <p className="text-sm text-muted-foreground">Trial length, dunning grace period, and the cancellation retention offer. Changes apply immediately.</p>
      </div>

      <Card className="p-5 rounded-2xl grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="trial">Trial length (days)</Label>
          <Input id="trial" type="number" min={0} max={90} value={s.trial_length_days}
                 onChange={(e) => patch({ trial_length_days: Number(e.target.value) })} />
          <p className="text-xs text-muted-foreground">How long free Pro trials last after card validation.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="grace">Failed-payment grace period (days)</Label>
          <Input id="grace" type="number" min={0} max={30} value={s.grace_period_days}
                 onChange={(e) => patch({ grace_period_days: Number(e.target.value) })} />
          <p className="text-xs text-muted-foreground">Days of Pro access retained after a failed charge before reverting to Free.</p>
        </div>
      </Card>

      <Card className="p-5 rounded-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2"><Gift className="h-4 w-4" /> Retention offer</h2>
            <p className="text-xs text-muted-foreground">Shown to users on the cancel-subscription screen. If disabled, users skip straight to the exit-reason survey.</p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="ret-on" className="text-xs">{s.retention_offer_enabled ? "Enabled" : "Disabled"}</Label>
            <Switch id="ret-on" checked={s.retention_offer_enabled}
                    onCheckedChange={(v) => patch({ retention_offer_enabled: v })} />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Discount type</Label>
            <Select value={s.retention_discount_type}
                    onValueChange={(v) => patch({ retention_discount_type: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage off</SelectItem>
                <SelectItem value="fixed">Fixed amount off (€)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Discount value</Label>
            <Input type="number" min={0} step={s.retention_discount_type === "percentage" ? 1 : 0.5}
                   value={s.retention_discount_value}
                   onChange={(e) => patch({ retention_discount_value: Number(e.target.value) })} />
            <p className="text-xs text-muted-foreground">{s.retention_discount_type === "percentage" ? "e.g. 30 = 30% off" : "in EUR, e.g. 10 = €10 off"}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Duration (billing periods)</Label>
            <Input type="number" min={1} max={24} value={s.retention_duration_months}
                   onChange={(e) => patch({ retention_duration_months: Number(e.target.value) })} />
            <p className="text-xs text-muted-foreground">Applied as a repeating Stripe coupon.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="copy">Offer copy shown to the user</Label>
          <Textarea id="copy" rows={3} maxLength={500} value={s.retention_offer_copy}
                    onChange={(e) => patch({ retention_offer_copy: e.target.value })} />
          <p className="text-xs text-muted-foreground">Plain text. Keep it short and personal.</p>
        </div>

        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Eye className="h-3 w-3" /> Live preview — what the user sees
          </div>
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold"><Gift className="h-4 w-4 text-primary" /> Wait — an offer just for you</div>
            {preview.retention_offer_enabled ? (
              <>
                <div className="text-lg font-semibold">{offerHeadline(preview)}</div>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{preview.retention_offer_copy || "(no offer copy — add some above)"}</p>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" disabled>Accept offer</Button>
                  <Button size="sm" variant="outline" disabled>No thanks, continue cancelling</Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">Retention offer disabled — the user skips this step and goes straight to the exit-reason survey.</p>
            )}
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : "Save changes"}
        </Button>
        <Button variant="outline" onClick={load} disabled={saving}>Discard</Button>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
    </div>
  );
}