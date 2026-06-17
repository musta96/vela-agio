import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, Save } from "lucide-react";
import { toast } from "sonner";

type Override = "inherit" | "on" | "off";

/**
 * Owner-only per-user override for the recommendation-verdict wording
 * toggle. Resolution order in the app: this override → global feature flag
 * `show_recommendation_verdicts` → default OFF.
 *
 * Every change writes to the audit_log so we can prove who flipped what.
 */
export function RecommendationVerdictOverrideCard({ userId }: { userId: string }) {
  const [value, setValue] = useState<Override>("inherit");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [global, setGlobal] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [prof, flag] = await Promise.all([
        supabase.from("profiles").select("recommendation_verdicts_override").eq("user_id", userId).maybeSingle(),
        supabase.from("feature_flags").select("enabled").eq("key", "show_recommendation_verdicts").maybeSingle(),
      ]);
      if (!active) return;
      const v = (prof.data as any)?.recommendation_verdicts_override as Override | undefined;
      setValue(v ?? "inherit");
      setGlobal(!!(flag.data as any)?.enabled);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [userId]);

  const effective = value === "on" ? "ON" : value === "off" ? "OFF" : global ? "ON (inherited)" : "OFF (inherited)";

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ recommendation_verdicts_override: value })
      .eq("user_id", userId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    // Best-effort audit; ignore failures.
    await supabase.from("audit_log").insert({
      action: "recommendation_verdicts_override.set",
      entity: "profile",
      entity_id: userId,
      payload: { value } as any,
    } as any);
    toast.success("Override saved");
  };

  if (loading) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-3">
        <Megaphone className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Recommendation verdict wording</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Controls whether this user sees AI Buy/Hold/Sell verdict labels and horizons. Default is to inherit the global
        setting (currently <span className="font-semibold">{global ? "ON" : "OFF"}</span>). Effective for this user:{" "}
        <span className="font-semibold">{effective}</span>.
      </p>
      <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <Label className="text-xs">Override</Label>
          <Select value={value} onValueChange={(v) => setValue(v as Override)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Inherit global setting</SelectItem>
              <SelectItem value="on">Force ON - show verdicts</SelectItem>
              <SelectItem value="off">Force OFF - descriptive only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={save} disabled={saving} className="gap-2"><Save className="h-4 w-4" /> Save</Button>
      </div>
    </div>
  );
}