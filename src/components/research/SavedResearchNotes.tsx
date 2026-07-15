import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { BookOpen, Trash2, GitCompare, Loader2, RefreshCw, Share2 } from "lucide-react";
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

export function SavedResearchNotes({ symbol, onReopen, refreshKey }: Props) {
  const [notes, setNotes] = useState<SavedNote[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [shareNote, setShareNote] = useState<SavedNote | null>(null);

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

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const selectedNotes = (notes ?? []).filter((n) => selected.has(n.id));
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
              <Button size="sm" variant={canCompare ? "default" : "outline"} disabled={!canCompare} onClick={() => setCompareOpen(true)}>
                <GitCompare className="h-3 w-3 mr-1" /> Compare ({selectedNotes.length})
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {notes && notes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No saved notes yet. Run "AI Analyze" on a filing or an earnings call to save a research note here.
            </p>
          )}
          {notes && notes.map((n) => (
            <div key={n.id} className="flex items-center gap-3 p-2 rounded-md border border-border/60 hover:bg-muted/30 transition-colors">
              <Checkbox checked={selected.has(n.id)} onCheckedChange={() => toggle(n.id)} aria-label="Select for compare" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{n.symbol}</span>
                  {n.report?.reportType && <Badge variant="secondary" className="text-[10px]">{n.report.reportType}</Badge>}
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
          ))}
          {selectedNotes.length >= 2 && !canCompare && (
            <p className="text-xs text-warning">Select notes for the same ticker to compare.</p>
          )}
        </CardContent>
      </Card>
      <ResearchCompareDialog open={compareOpen} onOpenChange={setCompareOpen} notes={selectedNotes} />
      <ShareResearchDialog
        open={!!shareNote}
        onOpenChange={(v) => { if (!v) setShareNote(null); }}
        note={shareNote}
        onChanged={load}
      />
    </>
  );
}