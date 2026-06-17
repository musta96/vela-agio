import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import { LANDING_TEMPLATES, type LandingTemplate } from "@/data/landingTemplates";
import { Plus, Trash2, RotateCcw, Save, History, Beaker, Globe, Wand2 } from "lucide-react";

// ---------- Templates ----------
export function TemplatesPanel({ onApplied }: { onApplied: () => void }) {
  const apply = async (tpl: LandingTemplate) => {
    if (!confirm(`Replace landing sections with "${tpl.name}"? Current state will be snapshotted to version history.`)) return;
    try {
      // Snapshot current
      const { data: current } = await (supabase as any).from("landing_sections").select("*");
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase as any).from("landing_versions").insert({
        label: `Auto-snapshot before applying "${tpl.name}"`,
        snapshot: { sections: current || [] },
        created_by: user?.id ?? null,
      });
      // Wipe variant A
      await (supabase as any).from("landing_sections").delete().eq("variant", "A");
      const rows = tpl.sections.map((s) => ({
        key: s.key, kind: s.kind, sort_order: s.sort_order,
        enabled: s.enabled, content: s.content, variant: "A",
      }));
      const { error } = await (supabase as any).from("landing_sections").insert(rows);
      if (error) throw error;
      toast({ title: "Template applied", description: tpl.name });
      onApplied();
    } catch (e: any) {
      toast({ title: "Failed to apply template", description: e.message, variant: "destructive" });
    }
  };
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {LANDING_TEMPLATES.map((t) => (
        <Card key={t.id} className="p-4 flex flex-col gap-3">
          <div>
            <div className="font-medium flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" />{t.name}</div>
            <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
          </div>
          <div className="text-[10px] text-muted-foreground">{t.sections.length} sections</div>
          <Button size="sm" onClick={() => apply(t)}>Apply</Button>
        </Card>
      ))}
    </div>
  );
}

// ---------- Versions ----------
type Version = { id: string; label: string; note: string | null; snapshot: any; created_at: string };
export function VersionsPanel({ onRestored }: { onRestored: () => void }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [viewing, setViewing] = useState<Version | null>(null);

  const load = async () => {
    const { data } = await (supabase as any).from("landing_versions")
      .select("id, label, note, snapshot, created_at").order("created_at", { ascending: false }).limit(50);
    setVersions((data || []) as Version[]);
  };
  useEffect(() => { load(); }, []);

  const snapshot = async () => {
    if (!label.trim()) { toast({ title: "Label required" }); return; }
    const { data: current } = await (supabase as any).from("landing_sections").select("*");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("landing_versions").insert({
      label, note: note || null, snapshot: { sections: current || [] }, created_by: user?.id ?? null,
    });
    if (error) { toast({ title: "Snapshot failed", description: error.message, variant: "destructive" }); return; }
    setLabel(""); setNote("");
    toast({ title: "Version saved" });
    load();
  };

  const restore = async (v: Version) => {
    if (!confirm(`Restore "${v.label}"? Current state will be saved as a new snapshot first.`)) return;
    try {
      const { data: current } = await (supabase as any).from("landing_sections").select("*");
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase as any).from("landing_versions").insert({
        label: `Auto-snapshot before restoring "${v.label}"`,
        snapshot: { sections: current || [] }, created_by: user?.id ?? null,
      });
      await (supabase as any).from("landing_sections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      const rows = (v.snapshot?.sections || []).map((s: any) => ({
        key: s.key, kind: s.kind, sort_order: s.sort_order,
        enabled: s.enabled, content: s.content, variant: s.variant || "A",
      }));
      if (rows.length) await (supabase as any).from("landing_sections").insert(rows);
      toast({ title: "Restored" });
      load(); onRestored();
    } catch (e: any) {
      toast({ title: "Restore failed", description: e.message, variant: "destructive" });
    }
  };

  const del = async (v: Version) => {
    if (!confirm(`Delete version "${v.label}"?`)) return;
    await (supabase as any).from("landing_versions").delete().eq("id", v.id);
    load();
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 space-y-2">
        <div className="flex items-center gap-2"><History className="h-4 w-4" /><span className="font-medium text-sm">Take a snapshot</span></div>
        <Input placeholder="Label (e.g. v2 - Q3 launch copy)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-8" />
        <Textarea placeholder="Optional note / change log" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="text-sm" />
        <Button size="sm" onClick={snapshot} className="gap-1.5"><Save className="h-3.5 w-3.5" />Snapshot current state</Button>
      </Card>

      <div className="space-y-2">
        {versions.length === 0 && <p className="text-xs text-muted-foreground">No versions yet.</p>}
        {versions.map((v) => (
          <Card key={v.id} className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{v.label}</div>
                <div className="text-[11px] text-muted-foreground">{new Date(v.created_at).toLocaleString()} · {(v.snapshot?.sections || []).length} sections</div>
                {v.note && <div className="text-xs text-muted-foreground mt-1">{v.note}</div>}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setViewing(viewing?.id === v.id ? null : v)}>Diff</Button>
                <Button size="sm" variant="outline" onClick={() => restore(v)} className="gap-1"><RotateCcw className="h-3 w-3" />Restore</Button>
                <Button size="sm" variant="ghost" onClick={() => del(v)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
              </div>
            </div>
            {viewing?.id === v.id && (
              <pre className="mt-3 text-[10px] bg-muted/50 p-2 rounded max-h-64 overflow-auto whitespace-pre-wrap">
{JSON.stringify(v.snapshot, null, 2)}
              </pre>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------- A/B Testing ----------
export function AbTestPanel() {
  const [enabled, setEnabled] = useState(false);
  const [split, setSplit] = useState(50);
  const [winner, setWinner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await (supabase as any).from("landing_settings").select("ab").eq("id", 1).maybeSingle();
    const ab = data?.ab || {};
    setEnabled(!!ab.enabled); setSplit(ab.split ?? 50); setWinner(ab.winner ?? null);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    const { error } = await (supabase as any).from("landing_settings").upsert({
      id: 1, ab: { enabled, split, winner, variants: ["A", "B"] }, updated_at: new Date().toISOString(),
    });
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "A/B settings saved" });
  };

  const cloneAtoB = async () => {
    if (!confirm("Copy all variant A sections to variant B as a starting point?")) return;
    const { data } = await (supabase as any).from("landing_sections").select("*").eq("variant", "A");
    await (supabase as any).from("landing_sections").delete().eq("variant", "B");
    if (data?.length) {
      const rows = data.map((s: any) => ({
        key: s.key, kind: s.kind, sort_order: s.sort_order,
        enabled: s.enabled, content: s.content, variant: "B",
      }));
      await (supabase as any).from("landing_sections").insert(rows);
    }
    toast({ title: "Variant B cloned from A", description: "Now edit variant-B rows in the Sections tab." });
  };

  if (loading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2"><Beaker className="h-4 w-4" /><span className="font-medium text-sm">A/B test</span>
          <Badge variant="outline" className="ml-auto text-[9px]">{enabled ? "LIVE" : "OFF"}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Enable A/B test</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1.5"><span>Traffic split (A%)</span><span className="font-mono">{split}% / {100 - split}%</span></div>
          <Slider value={[split]} min={0} max={100} step={5} onValueChange={(v) => setSplit(v[0])} disabled={!enabled} />
        </div>
        <div>
          <div className="text-xs mb-1.5">Winner (forces all traffic)</div>
          <div className="flex gap-2">
            {(["A", "B"] as const).map((v) => (
              <Button key={v} size="sm" variant={winner === v ? "default" : "outline"} onClick={() => setWinner(winner === v ? null : v)}>Variant {v}</Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setWinner(null)}>Clear</Button>
          </div>
        </div>
        <div className="flex gap-2 pt-2 border-t">
          <Button size="sm" onClick={save} className="gap-1.5"><Save className="h-3.5 w-3.5" />Save</Button>
          <Button size="sm" variant="outline" onClick={cloneAtoB}>Clone A → B</Button>
        </div>
      </Card>
      <p className="text-[11px] text-muted-foreground">Visitors are randomly bucketed and remembered in localStorage. A "winner" override pins every visitor to that variant.</p>
    </div>
  );
}

// ---------- Globals (reusable fields) ----------
type Global = { key: string; value: any; label: string | null };
export function GlobalsPanel() {
  const [items, setItems] = useState<Global[]>([]);
  const [key, setKey] = useState(""); const [label, setLabel] = useState(""); const [val, setVal] = useState("");

  const load = async () => {
    const { data } = await (supabase as any).from("landing_globals").select("key, value, label").order("key");
    setItems((data || []) as Global[]);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!key.trim()) return;
    let parsed: any = val;
    try { parsed = JSON.parse(val); } catch { /* keep as string */ }
    const { error } = await (supabase as any).from("landing_globals").upsert({
      key: key.trim(), value: parsed, label: label || null, updated_at: new Date().toISOString(),
    });
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setKey(""); setLabel(""); setVal(""); load();
  };
  const update = async (k: string, value: any) => {
    await (supabase as any).from("landing_globals").update({ value, updated_at: new Date().toISOString() }).eq("key", k);
  };
  const del = async (k: string) => {
    await (supabase as any).from("landing_globals").delete().eq("key", k); load();
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 space-y-2">
        <div className="text-sm font-medium">Add a reusable field</div>
        <div className="grid grid-cols-3 gap-2">
          <Input placeholder="key (e.g. brand)" value={key} onChange={(e) => setKey(e.target.value)} className="h-8" />
          <Input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-8" />
          <Input placeholder='value or JSON' value={val} onChange={(e) => setVal(e.target.value)} className="h-8" />
        </div>
        <Button size="sm" onClick={add} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add field</Button>
        <p className="text-[11px] text-muted-foreground">Reference in any section using <code>{"{{key}}"}</code>. Updates propagate everywhere automatically.</p>
      </Card>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-xs text-muted-foreground">No global fields yet. Try: <code>brand</code>, <code>tagline</code>, <code>support_email</code>.</p>}
        {items.map((g) => (
          <Card key={g.key} className="p-3 flex items-center gap-2">
            <div className="w-28 shrink-0"><Badge variant="outline" className="font-mono text-[10px]">{g.key}</Badge>{g.label && <div className="text-[10px] text-muted-foreground mt-1">{g.label}</div>}</div>
            <Input
              defaultValue={typeof g.value === "string" ? g.value : JSON.stringify(g.value)}
              onBlur={(e) => {
                let v: any = e.target.value;
                try { v = JSON.parse(e.target.value); } catch {}
                update(g.key, v);
              }}
              className="h-8 flex-1 text-sm font-mono"
            />
            <Button size="sm" variant="ghost" onClick={() => del(g.key)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------- SEO + social preview ----------
export function SeoPanel() {
  const [seo, setSeo] = useState<any>({ title: "", description: "", ogImage: "", ogTitle: "", ogDescription: "" });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (supabase as any).from("landing_settings").select("seo").eq("id", 1).maybeSingle().then(({ data }: any) => {
      if (data?.seo) setSeo({ title: "", description: "", ogImage: "", ogTitle: "", ogDescription: "", ...data.seo });
      setLoading(false);
    });
  }, []);
  const save = async () => {
    const { error } = await (supabase as any).from("landing_settings").upsert({
      id: 1, seo, updated_at: new Date().toISOString(),
    });
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "SEO saved" });
  };
  if (loading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  const ogTitle = seo.ogTitle || seo.title || "Your landing page title";
  const ogDesc = seo.ogDescription || seo.description || "Your landing page description";
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2"><Globe className="h-4 w-4" /><span className="font-medium text-sm">SEO meta</span></div>
        <div><label className="text-[10px] uppercase text-muted-foreground">Title (≤60 chars)</label>
          <Input value={seo.title || ""} onChange={(e) => setSeo({ ...seo, title: e.target.value })} maxLength={70} className="h-8" />
          <div className="text-[10px] text-muted-foreground mt-0.5">{(seo.title || "").length}/60</div>
        </div>
        <div><label className="text-[10px] uppercase text-muted-foreground">Description (≤160 chars)</label>
          <Textarea value={seo.description || ""} onChange={(e) => setSeo({ ...seo, description: e.target.value })} rows={3} maxLength={200} className="text-sm" />
          <div className="text-[10px] text-muted-foreground mt-0.5">{(seo.description || "").length}/160</div>
        </div>
        <div className="border-t pt-3 space-y-3">
          <div className="text-xs font-medium">Social (Open Graph) - leave blank to reuse SEO above</div>
          <Input placeholder="OG title" value={seo.ogTitle || ""} onChange={(e) => setSeo({ ...seo, ogTitle: e.target.value })} className="h-8" />
          <Textarea placeholder="OG description" value={seo.ogDescription || ""} onChange={(e) => setSeo({ ...seo, ogDescription: e.target.value })} rows={2} className="text-sm" />
          <Input placeholder="OG image URL (1200×630)" value={seo.ogImage || ""} onChange={(e) => setSeo({ ...seo, ogImage: e.target.value })} className="h-8" />
        </div>
        <Button size="sm" onClick={save} className="gap-1.5"><Save className="h-3.5 w-3.5" />Save SEO</Button>
      </Card>
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">Social card preview</div>
        <Card className="overflow-hidden border-border">
          <div className="aspect-[1200/630] bg-muted flex items-center justify-center text-muted-foreground text-xs">
            {seo.ogImage ? <img src={seo.ogImage} alt="OG preview" className="w-full h-full object-cover" /> : "No OG image set"}
          </div>
          <div className="p-3 border-t">
            <div className="text-[10px] uppercase text-muted-foreground">vela-agio.lovable.app</div>
            <div className="font-semibold text-sm mt-0.5 line-clamp-2">{ogTitle}</div>
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{ogDesc}</div>
          </div>
        </Card>
        <div className="text-xs text-muted-foreground">Google search result preview</div>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">https://vela-agio.lovable.app</div>
          <div className="text-blue-600 dark:text-blue-400 text-base font-medium truncate">{seo.title || "Your landing page title"}</div>
          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{seo.description || "Your landing page description"}</div>
        </Card>
      </div>
    </div>
  );
}