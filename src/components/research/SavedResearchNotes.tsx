import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Trash2, GitCompare, Loader2, RefreshCw, Share2, Search, Tag, X, Plus, History } from "lucide-react";
import { toast } from "sonner";
import { ResearchCompareDialog } from "./ResearchCompareDialog";
import { ShareResearchDialog } from "./ShareResearchDialog";

export interface SavedNote {
  id: string;
  symbol: string;
  name?: string | null;
  mode: "filing" | "transcript";
  source_url?: string | null;
  source_label?: string | null;
  focus?: string | null;
  model?: string | null;
  generated_at: string;
  created_at: string;
  report: any;
  tags?: string[] | null;
  share_token?: string | null;
  share_enabled?: boolean | null;
  share_permissions?: any;
  share_expires_at?: string | null;
}

interface Props {
  symbol?: string; // filter (case-insensitive)
  onReopen?: (note: SavedNote) => void;
  refreshKey?: number; // bump to force reload
}

const ALL = "__all__";

function noteText(n: SavedNote): string {
  const r = n.report ?? {};
  return [
    n.symbol, n.name, n.source_label, n.focus, r.period, r.reportType,
    r.executiveSummary, r.researchNote, r.recommendation?.stance,
    ...(n.tags ?? []),
    ...((r.risks ?? []) as any[]).map((x) => `${x?.title ?? ""} ${x?.detail ?? ""}`),
  ].filter(Boolean).join(" ").toLowerCase();
}

export function SavedResearchNotes({ symbol, onReopen, refreshKey }: Props) {
  const [notes, setNotes] = useState<SavedNote[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareNotes, setCompareNotes] = useState<SavedNote[]>([]);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [shareNote, setShareNote] = useState<SavedNote | null>(null);

  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState(ALL);
  const [periodFilter, setPeriodFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [tagFilter, setTagFilter] = useState(ALL);
  const [tagEditor, setTagEditor] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("equity-research-analyst", {
        body: { action: "list", symbol },
      });
      if (error) throw error;
      if (data?.authenticated === false) { setAuthed(false); setNotes([]); return; }
      setAuthed(true);
      setNotes(data?.notes ?? []);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load saved notes");
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const all = notes ?? [];

  const options = useMemo(() => ({
    companies: Array.from(new Set(all.map((n) => n.symbol))).sort(),
    periods: Array.from(new Set(all.map((n) => n.report?.period).filter(Boolean) as string[])).sort(),
    types: Array.from(new Set(all.map((n) => n.report?.reportType || (n.mode === "transcript" ? "Earnings Call" : "Filing")))).sort(),
    tags: Array.from(new Set(all.flatMap((n) => n.tags ?? []))).sort(),
  }), [all]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((n) => {
      if (companyFilter !== ALL && n.symbol !== companyFilter) return false;
      if (periodFilter !== ALL && (n.report?.period ?? "") !== periodFilter) return false;
      const type = n.report?.reportType || (n.mode === "transcript" ? "Earnings Call" : "Filing");
      if (typeFilter !== ALL && type !== typeFilter) return false;
      if (tagFilter !== ALL && !(n.tags ?? []).includes(tagFilter)) return false;
      if (q && !noteText(n).includes(q)) return false;
      return true;
    });
  }, [all, query, companyFilter, periodFilter, typeFilter, tagFilter]);

  const del = async (id: string) => {
    if (!confirm("Delete this saved research note?")) return;
    try {
      const { error } = await supabase.functions.invoke("equity-research-analyst", { body: { action: "delete", id, symbol: symbol || "X" } });
      if (error) throw error;
      toast.success("Note deleted");
      setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
      load();
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    }
  };

  const saveTags = async (note: SavedNote, tags: string[]) => {
    const prev = notes;
    setNotes((ns) => (ns ?? []).map((n) => (n.id === note.id ? { ...n, tags } : n)));
    const { data, error } = await supabase.functions.invoke("equity-research-analyst", {
      body: { action: "set_tags", id: note.id, tags },
    });
    if (error || data?.error) {
      setNotes(prev ?? null);
      toast.error(data?.message || error?.message || "Could not update tags");
      return;
    }
    setNotes((ns) => (ns ?? []).map((n) => (n.id === note.id ? { ...n, tags: data.tags ?? tags } : n)));
  };

  const addTag = (note: SavedNote) => {
    const value = tagDraft.trim().toLowerCase();
    if (!value) return;
    const next = Array.from(new Set([...(note.tags ?? []), value])).slice(0, 12);
    setTagDraft("");
    saveTags(note, next);
  };

  const compareWithPrevious = (note: SavedNote) => {
    const sameCompany = all
      .filter((n) => n.symbol === note.symbol)
      .sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());
    const idx = sameCompany.findIndex((n) => n.id === note.id);
    const previous = sameCompany[idx + 1];
    if (!previous) {
      toast.error(`No earlier saved report for ${note.symbol} to compare against.`);
      return;
    }
    setCompareNotes([previous, note]);
    setCompareOpen(true);
  };

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const selectedNotes = filtered.filter((n) => selected.has(n.id));
  const canCompare = selectedNotes.length >= 2 && new Set(selectedNotes.map((n) => n.symbol)).size === 1;

  if (authed === false) return null; // signed-out: hide silently

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Saved AI research notes{symbol ? ` — ${symbol}` : ""}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              </Button>
              <Button size="sm" variant={canCompare ? "default" : "outline"} disabled={!canCompare}
                onClick={() => { setCompareNotes(selectedNotes); setCompareOpen(true); }}>
                <GitCompare className="h-3 w-3 mr-1" /> Compare ({selectedNotes.length})
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes…" className="h-9 pl-7" aria-label="Search saved research notes" />
            </div>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Company" /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All companies</SelectItem>{options.companies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Period" /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All periods</SelectItem>{options.periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Analysis type" /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All types</SelectItem>{options.types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Tag" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All tags</SelectItem>
                {options.tags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {all.length > 0 && (
            <p className="text-[11px] text-muted-foreground">{filtered.length} of {all.length} notes shown</p>
          )}

          {notes && notes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No saved notes yet. Run "AI Analyze" on a filing or an earnings call to save a research note here.
            </p>
          )}
          {notes && notes.length > 0 && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No notes match the current search and filters.</p>
          )}

          {filtered.map((n) => (
            <div key={n.id} className="rounded-md border border-border/60 p-2 transition-colors hover:bg-muted/30">
              <div className="flex items-center gap-3">
                <Checkbox checked={selected.has(n.id)} onCheckedChange={() => toggle(n.id)} aria-label="Select for compare" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{n.symbol}</span>
                    {n.report?.reportType && <Badge variant="secondary" className="text-[10px]">{n.report.reportType}</Badge>}
                    {n.report?.period && <Badge variant="outline" className="text-[10px]">{n.report.period}</Badge>}
                    {n.source_label && <span className="text-xs text-muted-foreground">{n.source_label}</span>}
                    {n.mode === "transcript" && <Badge variant="outline" className="text-[10px]">Call</Badge>}
                    {n.report?.recommendation?.stance && (
                      <Badge variant="outline" className="text-[10px] capitalize">Stance: {n.report.recommendation.stance}</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(n.generated_at).toLocaleString()} {n.focus ? ` · focus: ${n.focus}` : ""}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => onReopen?.(n)}>Open</Button>
                <Button size="sm" variant="ghost" onClick={() => compareWithPrevious(n)} title="Compare with the previous report for this company" aria-label="Compare with previous report">
                  <History className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant={n.share_enabled ? "default" : "ghost"}
                  onClick={() => setShareNote(n)}
                  aria-label="Share note"
                  title={n.share_enabled ? "Manage share link" : "Create share link"}
                >
                  <Share2 className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => del(n.id)} aria-label="Delete note">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1 pl-7">
                {(n.tags ?? []).map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1 text-[10px]">
                    {t}
                    <button type="button" aria-label={`Remove tag ${t}`} onClick={() => saveTags(n, (n.tags ?? []).filter((x) => x !== t))}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
                {tagEditor === n.id ? (
                  <span className="flex items-center gap-1">
                    <Input
                      autoFocus value={tagDraft} onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(n); } if (e.key === "Escape") setTagEditor(null); }}
                      placeholder="tag" className="h-6 w-28 text-xs" aria-label="New tag"
                    />
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => addTag(n)}>Add</Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setTagEditor(null)}>Done</Button>
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
                    onClick={() => { setTagEditor(n.id); setTagDraft(""); }}>
                    <Tag className="h-3 w-3" /><Plus className="h-2.5 w-2.5" /> tag
                  </Button>
                )}
              </div>
            </div>
          ))}

          {selectedNotes.length >= 2 && !canCompare && (
            <p className="text-xs text-warning">Select notes for the same ticker to compare.</p>
          )}
        </CardContent>
      </Card>
      <ResearchCompareDialog open={compareOpen} onOpenChange={setCompareOpen} notes={compareNotes} />
      <ShareResearchDialog
        open={!!shareNote}
        onOpenChange={(v) => { if (!v) setShareNote(null); }}
        note={shareNote}
        onChanged={load}
      />
    </>
  );
}
