import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { TopNav } from "@/components/TopNav";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, Save, Sparkles } from "lucide-react";

interface PlanRow {
  id: string;
  tier: string;
  display_name: string | null;
  ai_model_tier: string;
  ai_monthly_quota: number;
}

const MODEL_TIERS = ["none", "flash", "mid", "premium"] as const;

export default function AdminAiQuotas() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("subscription_plans")
        .select("id, tier, display_name, ai_model_tier, ai_monthly_quota")
        .order("ai_monthly_quota", { ascending: true });
      setPlans((data ?? []) as PlanRow[]);
      setLoading(false);
    })();
  }, [isAdmin]);

  const update = (id: string, field: keyof PlanRow, value: any) =>
    setPlans(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));

  const save = async (p: PlanRow) => {
    setSaving(p.id);
    const { error } = await supabase
      .from("subscription_plans")
      .update({ ai_model_tier: p.ai_model_tier, ai_monthly_quota: Number(p.ai_monthly_quota) })
      .eq("id", p.id);
    setSaving(null);
    if (error) toast.error(`Failed to save ${p.tier}: ${error.message}`);
    else toast.success(`Saved ${p.display_name ?? p.tier} quota`);
  };

  if (authLoading || isAdmin === null) {
    return <div className="min-h-screen bg-background"><TopNav /><div className="container mx-auto p-6 text-muted-foreground">Loading…</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <div className="container mx-auto p-6">
          <Card><CardContent className="p-8 text-center">
            <Shield className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-lg font-semibold">Admin only</h2>
            <p className="text-sm text-muted-foreground mt-1">You need the <code>admin</code> role to access this page.</p>
          </CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="container mx-auto p-6 max-w-4xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5" /> AI credit quotas per plan</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set the monthly AI credit cap and model tier for each subscription plan. Use <code>-1</code> for unlimited,
            <code> 0</code> for no AI. Changes take effect on the next AI request.
          </p>
        </div>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading plans…</p>
        ) : plans.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">No subscription plans found.</CardContent></Card>
        ) : plans.map(p => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="text-base capitalize">{p.display_name ?? p.tier}</CardTitle>
              <CardDescription>Tier id: <code>{p.tier}</code></CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <Label className="text-xs">Monthly AI credit cap</Label>
                <Input
                  type="number"
                  value={p.ai_monthly_quota}
                  onChange={(e) => update(p.id, "ai_monthly_quota", e.target.value === "" ? 0 : Number(e.target.value))}
                />
              </div>
              <div>
                <Label className="text-xs">Model tier</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={p.ai_model_tier}
                  onChange={(e) => update(p.id, "ai_model_tier", e.target.value)}
                >
                  {MODEL_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Button onClick={() => save(p)} disabled={saving === p.id} className="w-full gap-2">
                  <Save className="h-4 w-4" /> {saving === p.id ? "Saving…" : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}