import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  GripVertical, Eye, EyeOff, Save, RefreshCw, Trash2, Plus,
  ExternalLink, ChevronDown, ChevronRight, RotateCcw,
} from "lucide-react";
import { DEFAULT_SECTIONS, mergeWithDefaults, type LandingSectionRow } from "@/data/landingDefaults";

type Row = LandingSectionRow & { _dirty?: boolean };

const KIND_LABELS: Record<string, string> = {
  hero: "Hero", stats: "Stat strip", features: "Feature grid",
  audiences: "Audience cards", steps: "Step list",
  pricing: "Pricing wrapper", trust: "Trust cards",
  faq: "FAQ", cta: "Call to action",
};

export function LandingEditor() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = async () => {
    const { data } = await (supabase as any)
      .from("landing_sections")
      .select("id, key, kind, sort_order, enabled, content");
    setRows(mergeWithDefaultsKeepAll(data || []));
  };
  useEffect(() => { load(); }, []);

  const dirty = useMemo(() => rows.some(r => r._dirty), [rows]);

  const update = (key: string, patch: Partial<Row>) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch, _dirty: true } : r));
  };
  const setContent = (key: string, path: string, value: any) => {
    setRows(prev => prev.map(r => {
      if (r.key !== key) return r;
      const next = JSON.parse(JSON.stringify(r.content || {}));
      const segs = path.split(".");
      let cur = next;
      for (let i = 0; i < segs.length - 1; i++) {
        const s = segs[i];
        if (cur[s] == null) cur[s] = isNaN(Number(segs[i + 1])) ? {} : [];
        cur = cur[s];
      }
      cur[segs[segs.length - 1]] = value;
      return { ...r, content: next, _dirty: true };
    }));
  };

  // Drag-and-drop reorder (native HTML5)
  const dragKey = useRef<string | null>(null);
  const onDragStart = (k: string) => (e: React.DragEvent) => {
    dragKey.current = k;
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop = (target: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragKey.current; dragKey.current = null;
    if (!src || src === target) return;
    setRows(prev => {
      const arr = [...prev].sort((a, b) => a.sort_order - b.sort_order);
      const from = arr.findIndex(r => r.key === src);
      const to = arr.findIndex(r => r.key === target);
      if (from < 0 || to < 0) return prev;
      const [m] = arr.splice(from, 1);
      arr.splice(to, 0, m);
      return arr.map((r, i) => ({ ...r, sort_order: (i + 1) * 10, _dirty: true }));
    });
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const dirtyRows = rows.filter(r => r._dirty);
      for (const r of dirtyRows) {
        const payload: any = {
          key: r.key, kind: r.kind, sort_order: r.sort_order,
          enabled: r.enabled, content: r.content,
        };
        if (r.id) payload.id = r.id;
        const { error } = await (supabase as any).from("landing_sections").upsert(payload, { onConflict: "key" });
        if (error) throw error;
      }
      toast({ title: "Saved", description: `${dirtyRows.length} section${dirtyRows.length === 1 ? "" : "s"} updated.` });
      await load();
      setPreviewKey(k => k + 1);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message || String(e), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const resetToDefault = async (key: string) => {
    const r = rows.find(x => x.key === key);
    if (!r) return;
    if (r.id) {
      const { error } = await (supabase as any).from("landing_sections").delete().eq("id", r.id);
      if (error) { toast({ title: "Reset failed", description: error.message, variant: "destructive" }); return; }
    }
    toast({ title: "Reset to default" });
    await load();
    setPreviewKey(k => k + 1);
  };

  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(420px,520px)_1fr] gap-4 h-[calc(100vh-7rem)]">
      {/* Editor pane */}
      <div className="flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Landing page</h2>
            <p className="text-xs text-muted-foreground">Drag to reorder. Toggle visibility. Edit copy inline. Live preview on the right.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Reload</Button>
            <Button size="sm" onClick={saveAll} disabled={!dirty || saving} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />{saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {sorted.map((r) => {
            const isOpen = !!open[r.key];
            return (
              <Card
                key={r.key}
                className={`p-3 ${r._dirty ? "border-amber-400/60" : ""}`}
                onDragOver={onDragOver}
                onDrop={onDrop(r.key)}
              >
                <div className="flex items-center gap-2">
                  <button
                    draggable
                    onDragStart={onDragStart(r.key)}
                    className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                    title="Drag to reorder"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setOpen(o => ({ ...o, [r.key]: !o[r.key] }))}
                    className="flex items-center gap-1.5 flex-1 text-left"
                  >
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <span className="text-sm font-medium">{KIND_LABELS[r.kind] || r.kind}</span>
                    <Badge variant="outline" className="text-[9px] ml-1">{r.key}</Badge>
                    {r._dirty && <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/40 text-[9px]">unsaved</Badge>}
                  </button>
                  <button
                    onClick={() => update(r.key, { enabled: !r.enabled })}
                    className="text-muted-foreground hover:text-foreground"
                    title={r.enabled ? "Hide section" : "Show section"}
                  >
                    {r.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 opacity-50" />}
                  </button>
                  <button
                    onClick={() => resetToDefault(r.key)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Reset to default"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isOpen && (
                  <div className="mt-3 pl-6 space-y-3 border-l border-border/60">
                    <SectionFields row={r} setContent={(p, v) => setContent(r.key, p, v)} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Preview pane */}
      <Card className="overflow-hidden flex flex-col min-h-0">
        <div className="h-9 px-3 border-b border-border flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Live preview · /</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setPreviewKey(k => k + 1)}>
              <RefreshCw className="h-3 w-3 mr-1" />Refresh
            </Button>
            <a href="/" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
              Open <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <iframe
          key={previewKey}
          ref={iframeRef}
          src="/"
          title="Landing preview"
          className="flex-1 w-full bg-background"
        />
      </Card>
    </div>
  );
}

function SectionFields({ row, setContent }: { row: Row; setContent: (path: string, value: any) => void }) {
  const c = row.content || {};
  const k = row.kind;

  const TextField = ({ label, path, multiline }: { label: string; path: string; multiline?: boolean }) => {
    const val = path.split(".").reduce((a: any, s) => a?.[s], c) ?? "";
    return (
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</label>
        {multiline ? (
          <Textarea value={val} onChange={(e) => setContent(path, e.target.value)} rows={3} className="mt-1 text-sm" />
        ) : (
          <Input value={val} onChange={(e) => setContent(path, e.target.value)} className="mt-1 h-8 text-sm" />
        )}
      </div>
    );
  };

  const ItemsEditor = ({ path, fields }: { path: string; fields: { key: string; label: string; multiline?: boolean }[] }) => {
    const items: any[] = path.split(".").reduce((a: any, s) => a?.[s], c) ?? [];
    const setItems = (next: any[]) => setContent(path, next);
    return (
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{path}</label>
        {items.map((it, i) => (
          <Card key={i} className="p-2 space-y-1.5 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
              <div className="flex gap-1">
                <button className="text-muted-foreground hover:text-foreground text-[10px] px-1"
                        onClick={() => { if (i === 0) return; const n = [...items]; [n[i-1], n[i]] = [n[i], n[i-1]]; setItems(n); }}>↑</button>
                <button className="text-muted-foreground hover:text-foreground text-[10px] px-1"
                        onClick={() => { if (i === items.length-1) return; const n = [...items]; [n[i+1], n[i]] = [n[i], n[i+1]]; setItems(n); }}>↓</button>
                <button className="text-destructive/70 hover:text-destructive"
                        onClick={() => setItems(items.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            {fields.map(f => (
              <div key={f.key}>
                <label className="text-[9px] uppercase text-muted-foreground">{f.label}</label>
                {f.multiline ? (
                  <Textarea value={it[f.key] ?? ""} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], [f.key]: e.target.value }; setItems(n); }} rows={2} className="text-xs mt-0.5" />
                ) : (
                  <Input value={it[f.key] ?? ""} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], [f.key]: e.target.value }; setItems(n); }} className="h-7 text-xs mt-0.5" />
                )}
              </div>
            ))}
          </Card>
        ))}
        <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1"
                onClick={() => setItems([...items, Object.fromEntries(fields.map(f => [f.key, ""]))])}>
          <Plus className="h-3 w-3" /> Add item
        </Button>
      </div>
    );
  };

  const PointsEditor = ({ itemIdx }: { itemIdx: number }) => {
    const items: any[] = (c.items as any[]) || [];
    const points: string[] = items[itemIdx]?.points || [];
    const setPoints = (next: string[]) => {
      const n = [...items]; n[itemIdx] = { ...n[itemIdx], points: next }; setContent("items", n);
    };
    return (
      <div className="space-y-1">
        <label className="text-[9px] uppercase text-muted-foreground">Points</label>
        {points.map((p, j) => (
          <div key={j} className="flex gap-1">
            <Input value={p} onChange={(e) => { const n = [...points]; n[j] = e.target.value; setPoints(n); }} className="h-7 text-xs" />
            <button onClick={() => setPoints(points.filter((_, x) => x !== j))} className="text-destructive/70"><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setPoints([...points, ""])}><Plus className="h-3 w-3 mr-1" /> Point</Button>
      </div>
    );
  };

  switch (k) {
    case "hero":
      return (
        <>
          <TextField label="Eyebrow badge" path="eyebrow" />
          <TextField label="Title" path="title" />
          <TextField label="Title accent (highlighted line)" path="titleAccent" />
          <TextField label="Subtitle" path="subtitle" multiline />
          <TextField label="Primary CTA label" path="primaryCta.label" />
          <TextField label="Primary CTA href" path="primaryCta.href" />
          <TextField label="Secondary CTA label" path="secondaryCta.label" />
          <TextField label="Secondary CTA href" path="secondaryCta.href" />
          <TextField label="Footnote" path="note" />
          <ItemsEditor path="trust" fields={[{ key: "icon", label: "Icon (e.g. Lock)" }, { key: "label", label: "Label" }]} />
        </>
      );
    case "stats":
      return <ItemsEditor path="items" fields={[{ key: "k", label: "Value" }, { key: "v", label: "Label" }]} />;
    case "features":
    case "trust":
    case "steps":
      return (
        <>
          <TextField label="Title" path="title" />
          {k !== "steps" && <TextField label="Subtitle" path="subtitle" multiline />}
          <ItemsEditor path="items" fields={[
            { key: "icon", label: "Icon" },
            { key: "title", label: "Title" },
            { key: "desc", label: "Description", multiline: true },
          ]} />
        </>
      );
    case "audiences": {
      const items: any[] = (c.items as any[]) || [];
      return (
        <>
          {items.map((_, i) => (
            <Card key={i} className="p-2 space-y-1.5 bg-muted/30">
              <span className="text-[10px] text-muted-foreground">Audience #{i + 1}</span>
              <div><label className="text-[9px] uppercase text-muted-foreground">Icon</label><Input value={items[i].icon ?? ""} className="h-7 text-xs mt-0.5" onChange={(e) => { const n=[...items]; n[i]={...n[i],icon:e.target.value}; setContent("items", n); }} /></div>
              <div><label className="text-[9px] uppercase text-muted-foreground">Tag</label><Input value={items[i].tag ?? ""} className="h-7 text-xs mt-0.5" onChange={(e) => { const n=[...items]; n[i]={...n[i],tag:e.target.value}; setContent("items", n); }} /></div>
              <div><label className="text-[9px] uppercase text-muted-foreground">Title</label><Input value={items[i].title ?? ""} className="h-7 text-xs mt-0.5" onChange={(e) => { const n=[...items]; n[i]={...n[i],title:e.target.value}; setContent("items", n); }} /></div>
              <PointsEditor itemIdx={i} />
            </Card>
          ))}
          <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1" onClick={() => setContent("items", [...items, { icon: "Users", tag: "", title: "", points: [] }])}><Plus className="h-3 w-3" /> Add audience</Button>
        </>
      );
    }
    case "pricing":
      return (
        <>
          <TextField label="Title" path="title" />
          <TextField label="Subtitle" path="subtitle" multiline />
          <TextField label="Footnote" path="footnote" multiline />
          <p className="text-[10px] text-muted-foreground italic">Tiers themselves are edited in <strong>Plans &amp; pricing</strong>.</p>
        </>
      );
    case "faq":
      return (
        <>
          <TextField label="Title" path="title" />
          <ItemsEditor path="items" fields={[{ key: "q", label: "Question" }, { key: "a", label: "Answer", multiline: true }]} />
        </>
      );
    case "cta":
      return (
        <>
          <TextField label="Title" path="title" />
          <TextField label="Subtitle" path="subtitle" multiline />
          <TextField label="Primary CTA label" path="primaryCta.label" />
          <TextField label="Primary CTA href" path="primaryCta.href" />
          <TextField label="Secondary CTA label" path="secondaryCta.label" />
          <TextField label="Secondary CTA href" path="secondaryCta.href" />
        </>
      );
    default:
      return <p className="text-xs text-muted-foreground">No inline editor for kind <code>{k}</code>.</p>;
  }
}

// Like mergeWithDefaults but keeps disabled rows too (so the editor can toggle them back on).
function mergeWithDefaultsKeepAll(rows: any[]): Row[] {
  const byKey = new Map(rows.map((r: any) => [r.key, r]));
  const merged: Row[] = DEFAULT_SECTIONS.map(d => {
    const row = byKey.get(d.key);
    if (!row) return { ...d };
    return { ...d, ...row, content: { ...d.content, ...(row.content || {}) } };
  });
  for (const r of rows) if (!DEFAULT_SECTIONS.find(d => d.key === r.key)) merged.push(r);
  return merged.sort((a, b) => a.sort_order - b.sort_order);
}