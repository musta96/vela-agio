import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BlogPostRow, slugify, readingMinutes } from "@/lib/blog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import TiptapEditor from "@/components/owner/TiptapEditor";
import { Pencil, Plus, Trash2, ExternalLink, Lock, FileText } from "lucide-react";
import { Link } from "react-router-dom";

type Draft = Partial<BlogPostRow> & { tagsInput?: string };

const emptyDraft = (): Draft => ({
  title: "",
  slug: "",
  excerpt: "",
  cover_image_url: "",
  content_html: "",
  gated_html: "",
  category: "",
  tags: [],
  tagsInput: "",
  author_name: "Vela Team",
  reading_minutes: 5,
  seo_title: "",
  seo_description: "",
  published: false,
});

export default function BlogAdmin() {
  const [posts, setPosts] = useState<BlogPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leadCounts, setLeadCounts] = useState<Record<string, number>>({});

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase
      .from("blog_posts" as any)
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const rows = ((data as any) || []) as BlogPostRow[];
    setPosts(rows);

    if (rows.length) {
      const ids = rows.map(r => r.id);
      const { data: leads } = await supabase
        .from("blog_leads" as any)
        .select("post_id")
        .in("post_id", ids);
      const counts: Record<string, number> = {};
      ((leads as any) || []).forEach((l: any) => { counts[l.post_id] = (counts[l.post_id] || 0) + 1; });
      setLeadCounts(counts);
    }
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  function startNew() {
    setEditing(emptyDraft());
    setOpen(true);
  }

  function startEdit(p: BlogPostRow) {
    setEditing({ ...p, tagsInput: (p.tags || []).join(", ") });
    setOpen(true);
  }

  async function remove(p: BlogPostRow) {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("blog_posts" as any).delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Article deleted");
    refresh();
  }

  async function save() {
    if (!editing) return;
    const title = (editing.title || "").trim();
    if (!title) { toast.error("Title is required"); return; }
    const slug = (editing.slug || slugify(title)).trim();
    if (!slug) { toast.error("Slug is required"); return; }

    const tags = (editing.tagsInput || "")
      .split(",")
      .map(t => t.trim())
      .filter(Boolean)
      .slice(0, 20);

    const payload: Partial<BlogPostRow> = {
      slug,
      title,
      excerpt: editing.excerpt || null,
      cover_image_url: editing.cover_image_url || null,
      content_html: editing.content_html || "",
      gated_html: editing.gated_html || null,
      category: editing.category || null,
      tags,
      author_name: editing.author_name || null,
      reading_minutes: Math.max(1, Number(editing.reading_minutes) || readingMinutes((editing.content_html || "") + (editing.gated_html || ""))),
      seo_title: editing.seo_title || null,
      seo_description: editing.seo_description || null,
      published: !!editing.published,
    };
    if (payload.published && !editing.published_at) {
      (payload as any).published_at = new Date().toISOString();
    }

    setSaving(true);
    try {
      if (editing.id) {
        const { error } = await supabase.from("blog_posts" as any).update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Article updated");
      } else {
        const { error } = await supabase.from("blog_posts" as any).insert(payload as any);
        if (error) throw error;
        toast.success("Article created");
      }
      setOpen(false);
      setEditing(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const totalLeads = useMemo(() => Object.values(leadCounts).reduce((a, b) => a + b, 0), [leadCounts]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Blog & news
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Write and publish articles for the public blog. Add a gated section to capture emails.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/blog" target="_blank" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            View public blog <ExternalLink className="h-3 w-3" />
          </Link>
          <Button onClick={startNew}><Plus className="h-4 w-4 mr-1.5" /> New article</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Total articles</div>
          <div className="text-2xl font-bold mt-1">{posts.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Published</div>
          <div className="text-2xl font-bold mt-1">{posts.filter(p => p.published).length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Leads captured</div>
          <div className="text-2xl font-bold mt-1">{totalLeads}</div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold">Articles</div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : posts.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No articles yet. Click <span className="font-semibold">New article</span> to write your first.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {posts.map(p => (
              <li key={p.id} className="flex items-center gap-4 px-4 py-3">
                <div className="h-10 w-14 rounded-md bg-gradient-to-br from-primary/30 to-accent/30 overflow-hidden shrink-0">
                  {p.cover_image_url && <img src={p.cover_image_url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold truncate">{p.title}</div>
                    {p.published ? <Badge variant="secondary" className="text-[10px]">Published</Badge> : <Badge variant="outline" className="text-[10px]">Draft</Badge>}
                    {p.gated_html && <Badge variant="outline" className="text-[10px] gap-1"><Lock className="h-3 w-3" /> Gated</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    /{p.slug} · {p.reading_minutes} min · {leadCounts[p.id] || 0} leads
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {p.published && (
                    <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" className="h-8 w-8 grid place-items-center rounded hover:bg-muted text-muted-foreground" aria-label="Open">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <button onClick={() => startEdit(p)} className="h-8 w-8 grid place-items-center rounded hover:bg-muted" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => remove(p)} className="h-8 w-8 grid place-items-center rounded hover:bg-destructive/10 text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit article" : "New article"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={editing.title || ""}
                    onChange={(e) => setEditing({
                      ...editing,
                      title: e.target.value,
                      slug: editing.id ? editing.slug : slugify(e.target.value),
                    })}
                    placeholder="An attention-grabbing headline"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="slug">URL slug</Label>
                  <Input
                    id="slug"
                    value={editing.slug || ""}
                    onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })}
                    placeholder="my-article"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="excerpt">Excerpt</Label>
                <Textarea
                  id="excerpt"
                  rows={2}
                  value={editing.excerpt || ""}
                  onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })}
                  placeholder="A short summary shown on the blog index and in search results"
                  maxLength={300}
                />
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="category">Category</Label>
                  <Input id="category" value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="Research" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tags">Tags (comma separated)</Label>
                  <Input id="tags" value={editing.tagsInput || ""} onChange={(e) => setEditing({ ...editing, tagsInput: e.target.value })} placeholder="AI, macro" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="author">Author</Label>
                  <Input id="author" value={editing.author_name || ""} onChange={(e) => setEditing({ ...editing, author_name: e.target.value })} />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cover">Cover image URL</Label>
                  <Input id="cover" value={editing.cover_image_url || ""} onChange={(e) => setEditing({ ...editing, cover_image_url: e.target.value })} placeholder="https://…" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reading">Reading time (minutes)</Label>
                  <Input id="reading" type="number" min={1} value={editing.reading_minutes || 5} onChange={(e) => setEditing({ ...editing, reading_minutes: Number(e.target.value) })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Public content</Label>
                <p className="text-xs text-muted-foreground">Visible to everyone. Supports headings, lists, tables, images, links, quotes.</p>
                <TiptapEditor
                  value={editing.content_html || ""}
                  onChange={(html) => setEditing({ ...editing, content_html: html })}
                  placeholder="Start writing your article…"
                />
              </div>

              <div className="space-y-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Gated content (optional)</Label>
                </div>
                <p className="text-xs text-muted-foreground">Hidden until the reader submits their email. Use for deeper analysis, full tables, or member-only takeaways.</p>
                <TiptapEditor
                  value={editing.gated_html || ""}
                  onChange={(html) => setEditing({ ...editing, gated_html: html })}
                  placeholder="Leave empty if this article has no gated portion."
                  minHeight={200}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="seo-title">SEO title (optional)</Label>
                  <Input id="seo-title" value={editing.seo_title || ""} onChange={(e) => setEditing({ ...editing, seo_title: e.target.value })} maxLength={70} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="seo-desc">SEO description (optional)</Label>
                  <Input id="seo-desc" value={editing.seo_description || ""} onChange={(e) => setEditing({ ...editing, seo_description: e.target.value })} maxLength={170} />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-4">
                <label className="flex items-center gap-3 text-sm font-medium">
                  <Switch checked={!!editing.published} onCheckedChange={(v) => setEditing({ ...editing, published: v })} />
                  Published
                </label>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setOpen(false); setEditing(null); }}>Cancel</Button>
                  <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing.id ? "Save changes" : "Create article"}</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}