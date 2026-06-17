import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert, Compass, TrendingDown, Sigma } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Toggles = { allow_cross_asset: boolean; allow_shorts: boolean; allow_derivatives: boolean };

export function AdvisorTogglesCard() {
  const { user } = useAuth();
  const [val, setVal] = useState<Toggles>({ allow_cross_asset: false, allow_shorts: false, allow_derivatives: false });
  const [loading, setLoading] = useState(true);
  const [masterOn, setMasterOn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("profiles").select("allow_cross_asset,allow_shorts,allow_derivatives").eq("user_id", user.id).maybeSingle(),
      supabase.from("feature_flags").select("enabled").eq("key", "advisor_unrestricted_enabled").maybeSingle(),
    ]).then(([p, f]) => {
      if (p.data) setVal({
        allow_cross_asset: !!p.data.allow_cross_asset,
        allow_shorts: !!p.data.allow_shorts,
        allow_derivatives: !!p.data.allow_derivatives,
      });
      setMasterOn(!!f.data?.enabled);
      setLoading(false);
    });
  }, [user?.id]);

  const update = async (patch: Partial<Toggles>) => {
    if (!user) return;
    const next = { ...val, ...patch };
    setVal(next);
    const { error } = await supabase.from("profiles").update(next).eq("user_id", user.id);
    if (error) toast.error("Could not save", { description: error.message });
  };

  return (
    <Card className="p-6 rounded-2xl space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-1 flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /> Advisor permissions</h2>
        <p className="text-sm text-muted-foreground">Opt in to the kind of suggestions the Advisor is allowed to make for you. All defaults are off. Some moves additionally require your suitability profile to be complete and certified at the appropriate risk level.</p>
      </div>

      {masterOn === false && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          The platform owner has the unrestricted-advisor master switch off. Your toggles are saved but no suggestion beyond long-only equity will be made until the owner enables it.
        </div>
      )}

      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <div className="space-y-4">
          <ToggleRow
            icon={<Compass className="h-4 w-4" />}
            title="Cross-asset suggestions"
            hint="Allow the advisor to propose moves into bonds, commodities, crypto and FX-hedge ETFs alongside equities."
            checked={val.allow_cross_asset}
            onChange={v => update({ allow_cross_asset: v })}
          />
          <ToggleRow
            icon={<TrendingDown className="h-4 w-4" />}
            title="Short positions"
            hint="Allow the advisor to propose short equity / inverse-ETF positions. Requires a suitability score of SRI 5 or higher and your unrestricted-advice toggle on."
            checked={val.allow_shorts}
            onChange={v => update({ allow_shorts: v })}
          />
          <ToggleRow
            icon={<Sigma className="h-4 w-4" />}
            title="Derivatives (options)"
            hint="Allow the advisor to propose covered calls, protective puts, collars and spreads. Requires SRI 6 or higher and your unrestricted-advice toggle on."
            checked={val.allow_derivatives}
            onChange={v => update({ allow_derivatives: v })}
          />
        </div>
      )}
    </Card>
  );
}

function ToggleRow({ icon, title, hint, checked, onChange }: { icon: React.ReactNode; title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label className="flex items-center gap-2 text-sm font-medium">{icon}{title}</Label>
        <p className="text-xs text-muted-foreground max-w-prose">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}