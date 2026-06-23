import { useEffect, useMemo, useState } from "react";
import { OwnerPageHeader } from "@/components/owner/OwnerLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Save, Trash2, RefreshCw, TrendingUp, Sparkles } from "lucide-react";
import { invalidateFeatureCatalogCache } from "@/hooks/useFeatureGate";

type CatalogRow = {
  key: string;
  name: string;
  description: string | null;
  category: string;
  sort_order: number;
};

type BlockSummary = {
  feature_key: string;
  blocks: number;
  unique_users: number;
  last_block: string | null;
};

export default function OwnerFeatureCatalogPage() {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [demand, setDemand] = useState<Record<string, BlockSummary>>({});
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState<Record<string, true>>({});
  const [filter, setFilter] = useState("");

  // New-feature form
  const [nk, setNk] = useState("");
  const [nn, setNn] = useState("");
  const [nd, setNd] = useState("");
  const [nc, setNc] = useState("general");

  const load = async () => {
    setLoading(true);
    try {
      const [catRes, demandRes] = await Promise.all([
        supabase
          .from("feature_catalog")
          .select("key,name,description,category,sort_order")
          .order("sort_order", { ascending: true }),
        supabase.rpc("admin_feature_block_summary"),
      ]);
      if (catRes.error) throw catRes.error;
      setRows((catRes.data as any[]) ?? []);
      const map: Record<string, BlockSummary> = {};
      ((demandRes.data as any[]) ?? []).forEach((r) => { map[r.feature_key] = r; });
      setDemand(map);
      setDirty({});
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load feature catalog");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const update = (key: string, patch: Partial<CatalogRow>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty((d) => ({ ...d, [key]: true }));
  };

  const save = async (row: CatalogRow) => {
    const { error } = await supabase
      .from("feature_catalog")
      .update({ name: row.name, description: row.description, category: row.category, sort_order: row.sort_order })
      .eq("key", row.key);
    if (error) return toast.error(`Save failed: ${error.message}`);
    setDirty((d) => { const { [row.key]: _, ...rest } = d; return rest; });
    toast.success(`${row.name} saved`);
    invalidateFeatureCatalogCache();
  };

  const remove = async (key: string) => {
    if (!confirm(`Remove "${key}"? Any plan that referenced it will lose this entitlement on next save.`)) return;
    const { error } = await supabase.from("feature_catalog").delete().eq("key", key);
    if (error) return toast.error(`Delete failed: ${error.message}`);
    toast.success("Feature removed");
    invalidateFeatureCatalogCache();
    void load();
  };

  const create = async () => {
    const key = nk.trim().toLowerCase().replace(/\s+/g, ".");
    const name = nn.trim();
    if (!key || !name) return toast.error("Need both key and name");
    const { error } = await supabase.from("feature_catalog").insert({
      key,
      name,
      description: nd.trim() || null,
      category: nc.trim() || "general",
      sort_order: (rows.at(-1)?.sort_order ?? 100) + 10,
    });
    if (error) return toast.error(`Couldn't add: ${error.message}`);
    toast.success(`Added ${name}`);
    setNk(""); setNn(""); setNd(""); setNc("general");
    invalidateFeatureCatalogCache();
    void load();
  };

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter((r) =>
      r.key.toLowerCase().includes(f) ||
      r.name.toLowerCase().includes(f) ||
      (r.category ?? "").toLowerCase().includes(f) ||
      (r.description ?? "").toLowerCase().includes(f),
    );
  }, [rows, filter]);

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, CatalogRow[]>>((acc, r) => {
      (acc[r.category] ??= []).push(r);
      return acc;
    }, {});
  }, [filtered]);

  return (
    <>
      <OwnerPageHeader
        title="Feature catalog"
        subtitle="Define every gated feature once. Tick which features each plan unlocks on the Plans page."
        actions={
          <>
            <Input
              placeholder="Filter features…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-9 w-56"
            />
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </>
        }
      />

      {/* Create row */}
      <Card className="p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Add a feature</h3>
        </div>
        <div className="grid sm:grid-cols-[1fr_1fr_160px_auto] gap-2 items-end">
          <div>
            <Label className="text-[10px]">Key</Label>
            <Input placeholder="ai.advanced_screener" value={nk} onChange={(e) => setNk(e.target.value)} />
          </div>
          <div>
            <Label className="text-[10px]">Display name</Label>
            <Input placeholder="Advanced screener" value={nn} onChange={(e) => setNn(e.target.value)} />
          </div>
          <div>
            <Label className="text-[10px]">Category</Label>
            <Input value={nc} onChange={(e) => setNc(e.target.value)} />
          </div>
          <Button size="sm" onClick={create}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
        </div>
        <Textarea
          className="mt-2"
          rows={2}
          placeholder="Short description (shown in the upgrade prompt)"
          value={nd}
          onChange={(e) => setNd(e.target.value)}
        />
      </Card>

      {loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading catalog…</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, items]) => (
            <section key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs uppercase tracking-[0.12em] text-muted-foreground font-semibold">{cat}</h3>
                <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {items.map((r) => {
                  const d = demand[r.key];
                  return (
                    <Card key={r.key} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Input
                              value={r.name}
                              onChange={(e) => update(r.key, { name: e.target.value })}
                              className="font-semibold h-8"
                            />
                          </div>
                          <code className="text-[10px] font-mono text-muted-foreground">{r.key}</code>
                        </div>
                        {d && (
                          <div
                            className="rounded-md border bg-muted/30 px-2 py-1 text-center min-w-[68px]"
                            title={`${d.blocks} blocks · ${d.unique_users} users · last ${d.last_block ? new Date(d.last_block).toLocaleDateString() : "—"}`}
                          >
                            <div className="flex items-center gap-1 justify-center text-warning">
                              <TrendingUp className="h-3 w-3" />
                              <span className="text-[11px] font-semibold">{d.blocks}</span>
                            </div>
                            <div className="text-[9px] text-muted-foreground">blocks · {d.unique_users}u</div>
                          </div>
                        )}
                      </div>
                      <Textarea
                        rows={2}
                        placeholder="Description"
                        value={r.description ?? ""}
                        onChange={(e) => update(r.key, { description: e.target.value })}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px]">Category</Label>
                          <Input value={r.category} onChange={(e) => update(r.key, { category: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-[10px]">Sort order</Label>
                          <Input
                            type="number"
                            value={r.sort_order}
                            onChange={(e) => update(r.key, { sort_order: Number(e.target.value) })}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(r.key)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                        </Button>
                        <Button size="sm" disabled={!dirty[r.key]} onClick={() => save(r)}>
                          <Save className="h-3.5 w-3.5 mr-1" /> {dirty[r.key] ? "Save" : "Saved"}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
          {Object.keys(grouped).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">No features match that filter.</p>
          )}
        </div>
      )}
    </>
  );
}