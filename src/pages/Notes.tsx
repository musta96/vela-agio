import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FileText, Trash2 } from "lucide-react";

interface Note { id: string; ts: number; symbol: string; title: string; body: string; tags: string[] }
const KEY = "research_notes";

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [sym, setSym] = useState(""); const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [tags, setTags] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => { try { setNotes(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { /* ignore */ } }, []);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(notes)); }, [notes]);

  const add = () => {
    if (!title) return;
    setNotes([{ id: crypto.randomUUID(), ts: Date.now(), symbol: sym.toUpperCase(), title, body, tags: tags.split(",").map(t => t.trim()).filter(Boolean) }, ...notes]);
    setSym(""); setTitle(""); setBody(""); setTags("");
  };

  const filtered = notes.filter(n => !q || (n.title + n.body + n.symbol + n.tags.join(",")).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Research Notes | FTSE MIB Analytics" description="Shareable research notes with versioning" path="/notes" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><FileText className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Research Notes</h1></div>
        <Card>
          <CardHeader><CardTitle>New Note</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Symbol" value={sym} onChange={(e) => setSym(e.target.value)} />
              <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="col-span-2" />
            </div>
            <Input placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
            <Textarea rows={5} placeholder="Body — supports markdown-like text" value={body} onChange={(e) => setBody(e.target.value)} />
            <Button onClick={add}>Save</Button>
          </CardContent>
        </Card>
        <Input placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid md:grid-cols-2 gap-3">
          {filtered.map(n => (
            <Card key={n.id}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-base">{n.title}</CardTitle>
                  <div className="text-xs text-muted-foreground">{n.symbol} · {new Date(n.ts).toLocaleString()}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setNotes(notes.filter(x => x.id !== n.id))}><Trash2 className="h-4 w-4" /></Button>
              </CardHeader>
              <CardContent>
                <div className="text-sm whitespace-pre-wrap">{n.body}</div>
                <div className="mt-2 flex gap-1 flex-wrap">{n.tags.map(t => <span key={t} className="text-xs bg-muted px-1.5 py-0.5 rounded">{t}</span>)}</div>
              </CardContent>
            </Card>
          ))}
          {!filtered.length && <div className="text-muted-foreground text-sm">No notes yet.</div>}
        </div>
      </main>
    </div>
  );
}