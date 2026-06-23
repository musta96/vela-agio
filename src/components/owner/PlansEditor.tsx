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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

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
  feature_keys: string[];
};

type CatalogRow = {
  key: string;
  name: string;
  description: string | null;
  category: string;
  sort_order: number;
};

export function PlansEditor() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [newFeatKey, setNewFeatKey] = useState("");
  const [newFeatName, setNewFeatName] = useState("");
  const [newFeatCategory, setNewFeatCategory] = useState("general");

  const load = async () => {
    setLoading(true);
    const [plansRes, catRes] = await Promise.all([
      supabase.from("subscription_plans").select("*").order("sort_order", { ascending: true }),
      supabase.from("feature_catalog").select("key,name,description,category,sort_order").order("sort_order", { ascending: true }),
    ]);
    if (plansRes.error) toast({ title: "Failed to load plans", description: plansRes.error.message, variant: "destructive" });
    setPlans((plansRes.data || []).map((p: any) => ({
      ...p,
      features: Array.isArray(p.features) ? p.features : [],
      feature_keys: Array.isArray(p.feature_keys) ? p.feature_keys : [],
    })));
    setCatalog((catRes.data as any[]) ?? []);
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

  const toggleFeatureKey = (planId: string, key: string, on: boolean) => {
    setPlans((ps) => ps.map((p) => {
      if (p.id !== planId) return p;
      const set = new Set(p.feature_keys);
      if (on) set.add(key); else set.delete(key);
      return { ...p, feature_keys: Array.from(set) };
    }));
  };

  const addCatalogFeature = async () => {
    const key = newFeatKey.trim().toLowerCase().replace(/\s+/g, ".");
    const name = newFeatName.trim();
    if (!key || !name) {
      return toast({ title: "Need both key and name", description: "e.g. key: ai.advanced_screener · name: Advanced screener", variant: "destructive" });
    }
    const { error } = await supabase.from("feature_catalog").insert({
      key, name, category: newFeatCategory || "general", sort_order: (catalog.at(-1)?.sort_order ?? 100) + 10,
    });
    if (error) return toast({ title: "Couldn't add feature", description: error.message, variant: "destructive" });
    setNewFeatKey(""); setNewFeatName("");
    toast({ title: "Feature added", description: `${name} (${key})` });
    load();
  };

  const removeCatalogFeature = async (key: string) => {
    if (!confirm(`Remove feature "${key}" from the catalog? Plans will lose this entitlement.`)) return;
    const { error } = await supabase.from("feature_catalog").delete().eq("key", key);
    if (error) return toast({ title: "Couldn't remove", description: error.message, variant: "destructive" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this plan?")) return;
    const { error } = await supabase.from("subscription_plans").delete().eq("id", id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    load();
  };

  const add = async () => {
    const slug = `plan-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const { data, error } = await supabase.from("subscription_plans").insert({
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
    }).select().single();
    if (error) {
      console.error("[PlansEditor] create failed", error);
      return toast({
        title: "Create failed",
        description: error.message + (error.code === "42501"
          ? " - your account is missing the 'admin' role required to manage plans."
          : ""),
        variant: "destructive",
      });
    }
    toast({ title: "Plan created", description: data?.name ?? "New plan" });
    load();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading plans…</p>;

  const grouped = catalog.reduce<Record<string, CatalogRow[]>>((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Plans & pricing</h2>
          <p className="text-xs text-muted-foreground">
            Toggle which features each tier unlocks. The app automatically enforces these — paying users
            unlock the boxes you check, and locked features show an upgrade prompt.
          </p>
        </div>
        <Button size="sm" onClick={add}><Plus className="h-3.5 w-3.5 mr-1" /> Add plan</Button>
      </div>

      {/* Feature catalog manager ------------------------------------ */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold">Feature catalog</h3>
            <p className="text-xs text-muted-foreground">Every gated feature in the app. Add a new one any time — it'll appear on every plan card below as a checkbox.</p>
          </div>
          <Badge variant="outline">{catalog.length} features</Badge>
        </div>
        <div className="grid sm:grid-cols-[1fr_1fr_140px_auto] gap-2">
          <Input placeholder="key (e.g. ai.advanced_screener)" value={newFeatKey} onChange={(e) => setNewFeatKey(e.target.value)} />
          <Input placeholder="Display name" value={newFeatName} onChange={(e) => setNewFeatName(e.target.value)} />
          <Input placeholder="category" value={newFeatCategory} onChange={(e) => setNewFeatCategory(e.target.value)} />
          <Button size="sm" onClick={addCatalogFeature}><Plus className="h-3.5 w-3.5 mr-1" /> Add feature</Button>
        </div>
      </Card>

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
              <Label className="text-[10px]">Marketing bullets (one per line) — shown on the public pricing card</Label>
              <Textarea
                rows={5}
                value={p.features.join("\n")}
                onChange={(e) => update(p.id, { features: e.target.value.split("\n").map((s) => s.trimEnd()).filter(Boolean) })}
              />
            </div>

            {/* Entitlement checkboxes ------------------------------- */}
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-semibold uppercase tracking-wider">Feature access</Label>
                <Badge variant="outline" className="text-[10px]">{p.feature_keys.length} unlocked</Badge>
              </div>
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat} className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{cat}</div>
                  <div className="grid grid-cols-1 gap-1">
                    {items.map((f) => {
                      const checked = p.feature_keys.includes(f.key);
                      return (
                        <label key={f.key} className="flex items-start gap-2 text-xs group">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => toggleFeatureKey(p.id, f.key, v === true)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium leading-tight">{f.name}</div>
                            {f.description && <div className="text-muted-foreground text-[10px] truncate">{f.description}</div>}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCatalogFeature(f.key)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                            title="Remove from catalog"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
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