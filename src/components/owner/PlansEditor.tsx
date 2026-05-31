import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Save } from "lucide-react";

type Plan = {
  id: string;
  slug: string;
  name: string;
  price_label: string;
  price_period: string | null;
  cta_label: string;
  cta_href: string;
  features: string[];
  highlighted: boolean;
  sort_order: number;
  is_active: boolean;
};

export function PlansEditor() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) toast({ title: "Failed to load plans", description: error.message, variant: "destructive" });
    setPlans((data || []).map((p: any) => ({ ...p, features: Array.isArray(p.features) ? p.features : [] })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const update = (id: string, patch: Partial<Plan>) =>
    setPlans((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const save = async (p: Plan) => {
    const { id, ...rest } = p;
    const { error } = await supabase.from("subscription_plans").update(rest).eq("id", id);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Plan saved", description: p.name });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this plan?")) return;
    const { error } = await supabase.from("subscription_plans").delete().eq("id", id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    load();
  };

  const add = async () => {
    const slug = `plan-${Date.now()}`;
    const { error } = await supabase.from("subscription_plans").insert({
      slug,
      name: "New plan",
      price_label: "€0",
      price_period: "/ month",
      cta_label: "Get started",
      cta_href: "/auth",
      features: [],
      highlighted: false,
      sort_order: (plans[plans.length - 1]?.sort_order ?? 0) + 1,
      is_active: true,
    });
    if (error) return toast({ title: "Create failed", description: error.message, variant: "destructive" });
    load();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading plans…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Plans & pricing</h2>
          <p className="text-xs text-muted-foreground">These plans are rendered on the public landing page.</p>
        </div>
        <Button size="sm" onClick={add}><Plus className="h-3.5 w-3.5 mr-1" /> Add plan</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.id} className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Name</Label>
                <Input value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} />
              </div>
              <div>
                <Label className="text-[10px]">Slug</Label>
                <Input value={p.slug} onChange={(e) => update(p.id, { slug: e.target.value })} />
              </div>
              <div>
                <Label className="text-[10px]">Price label</Label>
                <Input value={p.price_label} onChange={(e) => update(p.id, { price_label: e.target.value })} />
              </div>
              <div>
                <Label className="text-[10px]">Period</Label>
                <Input value={p.price_period ?? ""} onChange={(e) => update(p.id, { price_period: e.target.value })} />
              </div>
              <div>
                <Label className="text-[10px]">CTA label</Label>
                <Input value={p.cta_label} onChange={(e) => update(p.id, { cta_label: e.target.value })} />
              </div>
              <div>
                <Label className="text-[10px]">CTA link</Label>
                <Input value={p.cta_href} onChange={(e) => update(p.id, { cta_href: e.target.value })} />
              </div>
              <div>
                <Label className="text-[10px]">Sort order</Label>
                <Input type="number" value={p.sort_order} onChange={(e) => update(p.id, { sort_order: Number(e.target.value) })} />
              </div>
              <div className="flex items-center gap-4 pt-5">
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={p.highlighted} onCheckedChange={(v) => update(p.id, { highlighted: v })} /> Highlighted
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={p.is_active} onCheckedChange={(v) => update(p.id, { is_active: v })} /> Active
                </label>
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Features (one per line)</Label>
              <Textarea
                rows={5}
                value={p.features.join("\n")}
                onChange={(e) => update(p.id, { features: e.target.value.split("\n").map((s) => s.trimEnd()).filter(Boolean) })}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(p.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
              <Button size="sm" onClick={() => save(p)}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default PlansEditor;