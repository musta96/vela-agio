import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { requestMemoPdf } from "@/lib/memo/client";
import {
  buildInstrumentSection,
  fingerprintInstrument,
  RefRegistry,
  type InstrumentDeepDive,
} from "@/lib/memo/adapter";
import type { MemoInput } from "@/lib/memo/schema";
import { withRetry } from "@/lib/memo/withRetry";

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

  async function refreshChanged(row: MemoRow) {
    setBusy(row.id);
    try {
      // Load the persisted snapshot + fingerprints for this memo version.
      const { data: full, error } = await supabase
        .from("generated_memos")
        .select("id,version,fingerprints,input_snapshot,base_currency")
        .eq("id", row.id)
        .maybeSingle();
      if (error) throw error;
      const snapshot = full?.input_snapshot as MemoInput | null;
      const oldPrints = (full?.fingerprints ?? {}) as Record<string, string>;
      if (!snapshot?.instruments?.length) {
        toast({ title: "Nothing to refresh", description: "This memo has no instrument sections.", variant: "destructive" });
        return;
      }

      const ccy = full?.base_currency ?? snapshot.meta?.base_currency ?? "EUR";
      const refs = new RefRegistry();
      refs.seed(snapshot.references);

      // Fetch fresh deep-dives in parallel, tolerating individual failures.
      const results = await Promise.all(
        snapshot.instruments.map(async (inst) => {
          try {
            const data = await withRetry<InstrumentDeepDive>(async () => {
              const r = await supabase.functions.invoke<InstrumentDeepDive>("deep-analysis", { body: { symbol: inst.ticker } });
              if (r.error) throw r.error;
              return r.data as InstrumentDeepDive;
            }, { attempts: 2 });
            const weightPct = parseFloat((inst.allocation ?? "").replace(/[^\d.]/g, "")) || 0;
            const rebuilt = buildInstrumentSection(inst.ticker, weightPct, ccy, data, refs);
            const nextPrint = fingerprintInstrument(rebuilt);
            const changed = oldPrints[inst.ticker] !== nextPrint;
            return { rebuilt, changed, ticker: inst.ticker };
          } catch (err) {
            console.warn(`[Documents] refresh ${inst.ticker} failed:`, err);
            return { rebuilt: inst, changed: false, ticker: inst.ticker };
          }
        }),
      );

      const changed = results.filter((r) => r.changed);
      if (!changed.length) {
        toast({ title: "No changes detected", description: "All instrument fingerprints match the persisted memo." });
        return;
      }

      // Merge rebuilt instruments into the snapshot; unchanged ones stay verbatim.
      const nextInstruments = snapshot.instruments.map((inst) => {
        const hit = results.find((r) => r.ticker === inst.ticker);
        return hit?.rebuilt ?? inst;
      });

      const nextInput: MemoInput = {
        ...snapshot,
        instruments: nextInstruments,
        references: refs.all(),
        meta: {
          ...snapshot.meta,
          title: snapshot.meta.title,
          generated_at: new Date().toISOString(),
        },
        parent_id: row.id,
        version: (full?.version ?? row.version) + 1,
      };

      const out = await requestMemoPdf(nextInput);
      toast({
        title: "Refreshed changed instruments",
        description: `${changed.length} of ${results.length} section${changed.length === 1 ? "" : "s"} updated${out.version ? ` · v${out.version}` : ""}.`,
      });
      await refresh();
    } catch (err) {
      toast({
        title: "Refresh failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
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
              <Button size="sm" variant="outline" onClick={() => refreshChanged(r)} disabled={busy === r.id} className="gap-1.5" title="Regenerate only instrument sections whose fingerprints changed">
                {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh changed
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