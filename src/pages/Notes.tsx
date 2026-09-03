import { useCallback, useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { TickerSearch } from "@/components/TickerSearch";
import { FileText, Trash2, Loader2, CloudOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Note {
  id: string;
  created_at: string;
  symbol: string;
  title: string;
  body: string;
  tags: string[];
}

const LEGACY_KEY = "research_notes";
const MIGRATED_KEY = "research_notes:migrated";

export default function Notes() {
  const { user, loading: authLoading } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sym, setSym] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("research_notes")
      .select("id, created_at, symbol, title, body, tags")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Could not load your notes");
      return [];
    }
    const rows = (data ?? []) as Note[];
    setNotes(rows);
    return rows;
  }, []);

  // Load from the backend and migrate any notes still stuck in this browser.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (cancelled) return;

      if (!localStorage.getItem(MIGRATED_KEY)) {
        try {
          const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]") as Array<{
            ts?: number; symbol?: string; title?: string; body?: string; tags?: string[];
          }>;
          const rows = legacy
            .filter((n) => n?.title)
            .map((n) => ({
              user_id: user.id,
              symbol: (n.symbol ?? "").toUpperCase(),
              title: n.title!,
              body: n.body ?? "",
              tags: Array.isArray(n.tags) ? n.tags : [],
              created_at: new Date(n.ts ?? Date.now()).toISOString(),
            }));
          if (rows.length) {
            const { error } = await supabase.from("research_notes").insert(rows);
            if (!error) {
              toast.success(`Synced ${rows.length} note${rows.length > 1 ? "s" : ""} from this device`);
              await load();
            }
          }
          localStorage.setItem(MIGRATED_KEY, "1");
          localStorage.removeItem(LEGACY_KEY);
        } catch { /* ignore malformed legacy payloads */ }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authLoading, user, load]);

  const add = async () => {
    if (!title.trim() || !user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("research_notes")
      .insert({
        user_id: user.id,
        symbol: sym.toUpperCase(),
        title: title.trim(),
        body,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      })
      .select("id, created_at, symbol, title, body, tags")
      .single();
    setSaving(false);
    if (error || !data) { toast.error("Could not save the note"); return; }
    setNotes((prev) => [data as Note, ...prev]);
    setSym(""); setTitle(""); setBody(""); setTags("");
  };

  const remove = async (id: string) => {
    const prev = notes;
    setNotes(notes.filter((n) => n.id !== id));
    const { error } = await supabase.from("research_notes").delete().eq("id", id);
    if (error) { setNotes(prev); toast.error("Could not delete the note"); }
  };

  const filtered = notes.filter(
    (n) => !q || (n.title + n.body + n.symbol + n.tags.join(",")).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Research Notes | Vela.ai" description="Shareable research notes with versioning" path="/notes" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Research Notes</h1>
        </div>

        {!authLoading && !user ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
              <CloudOff className="h-4 w-4" /> Sign in to keep your notes synced across every device.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle>New Note</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <TickerSearch
                    value={sym}
                    onValueChange={setSym}
                    onSelect={(hit) => setSym(hit.symbol.toUpperCase())}
                    placeholder="Search instrument"
                  />
                  <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="md:col-span-2" />
                </div>
                <Input placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
                <Textarea rows={5} placeholder="Body - supports markdown-like text" value={body} onChange={(e) => setBody(e.target.value)} />
                <Button onClick={add} disabled={saving || !title.trim()}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
                </Button>
              </CardContent>
            </Card>

            <Input placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} />

            <div className="grid md:grid-cols-2 gap-3">
              {filtered.map((n) => (
                <Card key={n.id}>
                  <CardHeader className="pb-2 flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{n.title}</CardTitle>
                      <div className="text-xs text-muted-foreground">
                        {n.symbol} · {new Date(n.created_at).toLocaleString()}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" aria-label="Delete note" onClick={() => remove(n.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm whitespace-pre-wrap">{n.body}</div>
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {n.tags.map((t) => <span key={t} className="text-xs bg-muted px-1.5 py-0.5 rounded">{t}</span>)}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {loading && <div className="text-muted-foreground text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading notes…</div>}
              {!loading && !filtered.length && <div className="text-muted-foreground text-sm">No notes yet.</div>}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
