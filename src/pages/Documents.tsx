import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface MemoRow {
  id: string;
  title: string;
  base_currency: string | null;
  storage_path: string;
  pdf_bytes: number | null;
  tickers: string[];
  version: number;
  created_at: string;
}

export default function Documents() {
  const [rows, setRows] = useState<MemoRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const { data, error } = await supabase
      .from("generated_memos")
      .select("id,title,base_currency,storage_path,pdf_bytes,tickers,version,created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load memos", description: error.message, variant: "destructive" });
      setRows([]);
      return;
    }
    setRows((data ?? []) as MemoRow[]);
  }

  async function download(row: MemoRow) {
    setBusy(row.id);
    try {
      const { data, error } = await supabase.storage.from("memos").createSignedUrl(row.storage_path, 60);
      if (error || !data?.signedUrl) throw error ?? new Error("no url");
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = `${row.title.replace(/[^\w-]+/g, "_")}_v${row.version}.pdf`;
      a.click();
    } catch (e) {
      toast({ title: "Download failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: MemoRow) {
    if (!confirm(`Delete "${row.title}" (v${row.version})?`)) return;
    setBusy(row.id);
    try {
      await supabase.storage.from("memos").remove([row.storage_path]);
      const { error } = await supabase.from("generated_memos").delete().eq("id", row.id);
      if (error) throw error;
      await refresh();
    } catch (e) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-sm text-muted-foreground">All investment memos you have generated. Preview, re-download, or delete.</p>
      </div>
      {rows === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No memos yet. Generate one from the Portfolio page.
        </div>
      ) : (
        <div className="rounded border border-border divide-y">
          {rows.map((r) => (
            <div key={r.id} className="p-3 flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{r.title} <span className="text-xs text-muted-foreground">v{r.version}</span></div>
                <div className="text-xs text-muted-foreground truncate">
                  {new Date(r.created_at).toLocaleString()} · {r.tickers.length} ticker{r.tickers.length === 1 ? "" : "s"}
                  {r.pdf_bytes ? ` · ${Math.round(r.pdf_bytes / 1024)} KB` : ""}
                  {r.base_currency ? ` · ${r.base_currency}` : ""}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => download(r)} disabled={busy === r.id} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(r)} disabled={busy === r.id} aria-label="Delete">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}