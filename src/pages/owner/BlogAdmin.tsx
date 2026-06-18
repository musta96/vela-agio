import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BlogPostRow, slugify, readingMinutes, INLINE_GATE_MARKER, LeadMagnetFields } from "@/lib/blog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import TiptapEditor from "@/components/owner/TiptapEditor";
import { Pencil, Plus, Trash2, ExternalLink, Lock, FileText, Upload, Scissors, Sparkles, X, Users } from "lucide-react";
import { Link } from "react-router-dom";
import BlogLeads from "./BlogLeads";

type Draft = Partial<BlogPostRow> & { tagsInput?: string };

const DEFAULT_FIELDS: LeadMagnetFields = {
  first_name: true,
  last_name: true,
  company: false,
  role: false,
  country: false,
  consent: true,
};

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
  lead_magnet_enabled: false,
  lead_magnet_layout: "with_article",
  lead_magnet_file_path: null,
  lead_magnet_file_name: null,
  lead_magnet_cta: "Download the whitepaper",
  lead_magnet_fields: DEFAULT_FIELDS,
});

export default function BlogAdmin() {
  const [tab, setTab] = useState<"articles" | "leads">("articles");
  const [posts, setPosts] = useState<BlogPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leadCounts, setLeadCounts] = useState<Record<string, number>>({});
  const [uploadingPdf, setUploadingPdf] = useState(false);

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_blog_posts" as any);
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
    setEditing({
      ...p,
      tagsInput: (p.tags || []).join(", "),
      lead_magnet_fields: (p.lead_magnet_fields as LeadMagnetFields | null) || DEFAULT_FIELDS,
      lead_magnet_cta: p.lead_magnet_cta || "Download the whitepaper",
      lead_magnet_layout: (p.lead_magnet_layout as any) || "with_article",
    });
    setOpen(true);
  }

  async function remove(p: BlogPostRow) {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    if (p.lead_magnet_file_path) {
      await supabase.storage.from("blog-assets").remove([p.lead_magnet_file_path]).catch(() => {});
    }
    const { error } = await supabase.from("blog_posts" as any).delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Article deleted");
    refresh();
  }

  async function uploadPdf(file: File) {
    if (!editing) return;
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are supported");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("PDF must be smaller than 25 MB");
      return;
    }
    setUploadingPdf(true);
    try {
      if (editing.lead_magnet_file_path) {
        await supabase.storage.from("blog-assets").remove([editing.lead_magnet_file_path]).catch(() => {});
      }
      const slug = (editing.slug || slugify(editing.title || "post"));
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const path = `${slug || "post"}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from("blog-assets")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (error) throw error;
      setEditing({
        ...editing,
        lead_magnet_file_path: path,
        lead_magnet_file_name: file.name,
      });
      toast.success("PDF uploaded");
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploadingPdf(false);
    }
  }

  async function removePdf() {
    if (!editing?.lead_magnet_file_path) return;
    if (!window.confirm("Remove the uploaded PDF?")) return;
    await supabase.storage.from("blog-assets").remove([editing.lead_magnet_file_path]).catch(() => {});
    setEditing({ ...editing, lead_magnet_file_path: null, lead_magnet_file_name: null });
  }

  function insertGateMarker() {
    if (!editing) return;
    const current = editing.content_html || "";
    if (current.includes(INLINE_GATE_MARKER)) {
      toast.info("There's already a gate marker in this article.");
      return;
    }
    setEditing({ ...editing, content_html: current + `\n<p>${INLINE_GATE_MARKER}</p>\n` });
    toast.success("Gate marker added at the end. Move it up in the editor to choose the split point.");
  }

  async function save() {
    if (!editing) return;
    const title = (editing.title || "").trim();
    if (!title) { toast.error("Title is required"); return; }
    const slug = (editing.slug || slugify(title)).trim();
    if (!slug) { toast.error("Slug is required"); return; }
    if (editing.lead_magnet_enabled && !editing.lead_magnet_file_path) {
      toast.error("Upload a PDF before enabling the lead magnet."); return;
    }

    const tags = (editing.tagsInput || "")
      .split(",").map(t => t.trim()).filter(Boolean).slice(0, 20);

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
      lead_magnet_enabled: !!editing.lead_magnet_enabled,
      lead_magnet_layout: editing.lead_magnet_layout || "with_article",
      lead_magnet_file_path: editing.lead_magnet_file_path || null,
      lead_magnet_file_name: editing.lead_magnet_file_name || null,
      lead_magnet_cta: editing.lead_magnet_cta || null,
      lead_magnet_fields: editing.lead_magnet_fields || DEFAULT_FIELDS,
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

  const fields = (editing?.lead_magnet_fields as LeadMagnetFields) || DEFAULT_FIELDS;
  function setField(k: keyof LeadMagnetFields, v: boolean) {
    if (!editing) return;
    setEditing({ ...editing, lead_magnet_fields: { ...fields, [k]: v } });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Blog & news
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Write and publish articles. Gate sections, capture emails, or hand out PDF whitepapers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/blog" target="_blank" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            View public blog <ExternalLink className="h-3 w-3" />
          </Link>
          {tab === "articles" && <Button onClick={startNew}><Plus className="h-4 w-4 mr-1.5" /> New article</Button>}
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-md border border-border p-0.5 bg-card w-fit">
        <TabBtn active={tab === "articles"} onClick={() => setTab("articles")} icon={<FileText className="h-3.5 w-3.5" />}>Articles</TabBtn>
        <TabBtn active={tab === "leads"} onClick={() => setTab("leads")} icon={<Users className="h-3.5 w-3.5" />}>Leads ({totalLeads})</TabBtn>
      </div>

      {tab === "leads" ? (
        <BlogLeads />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat label="Total articles" value={posts.length} />
            <Stat label="Published" value={posts.filter(p => p.published).length} />
            <Stat label="Leads captured" value={totalLeads} />
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold truncate">{p.title}</div>
                        {p.published ? <Badge variant="secondary" className="text-[10px]">Published</Badge> : <Badge variant="outline" className="text-[10px]">Draft</Badge>}
                        {(p.gated_html || (p.content_html || "").includes(INLINE_GATE_MARKER)) && (
                          <Badge variant="outline" className="text-[10px] gap-1"><Lock className="h-3 w-3" /> Gated</Badge>
                        )}
                        {p.lead_magnet_enabled && (
                          <Badge variant="default" className="text-[10px] gap-1"><Sparkles className="h-3 w-3" /> Lead magnet</Badge>
                        )}
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
        </>
      )}

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
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <Label>Article content</Label>
                    <p className="text-xs text-muted-foreground">Insert a gate marker mid-article to lock everything after it behind the email form.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={insertGateMarker} className="gap-1.5">
                    <Scissors className="h-3.5 w-3.5" /> Insert gate marker
                  </Button>
                </div>
                <TiptapEditor
                  value={editing.content_html || ""}
                  onChange={(html) => setEditing({ ...editing, content_html: html })}
                  placeholder="Start writing your article…"
                />
                {(editing.content_html || "").includes(INLINE_GATE_MARKER) && (
                  <p className="text-[11px] text-primary">
                    A gate marker is present. Content after <code className="bg-muted px-1 rounded">{INLINE_GATE_MARKER}</code> requires an email to unlock.
                  </p>
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Gated content (legacy, optional)</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Appended after the article once a reader submits their email. Prefer the inline gate marker above for more control. Leave empty if you don't need a separate gated section.
                </p>
                <TiptapEditor
                  value={editing.gated_html || ""}
                  onChange={(html) => setEditing({ ...editing, gated_html: html })}
                  placeholder="Leave empty if this article has no gated portion."
                  minHeight={200}
                />
              </div>

              <div className="space-y-3 rounded-xl border border-dashed border-emerald-400/50 bg-emerald-500/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-600" />
                    <Label className="text-sm font-semibold">Lead magnet</Label>
                  </div>
                  <Switch
                    checked={!!editing.lead_magnet_enabled}
                    onCheckedChange={(v) => setEditing({ ...editing, lead_magnet_enabled: v })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Capture name, email and other details in exchange for a PDF download. The link is signed and expires after 15 minutes.
                </p>

                {editing.lead_magnet_enabled && (
                  <div className="space-y-4 pt-2">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Layout</Label>
                        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 bg-background">
                          <LayoutBtn active={editing.lead_magnet_layout !== "form_only"} onClick={() => setEditing({ ...editing, lead_magnet_layout: "with_article" })}>Article + form</LayoutBtn>
                          <LayoutBtn active={editing.lead_magnet_layout === "form_only"} onClick={() => setEditing({ ...editing, lead_magnet_layout: "form_only" })}>Form only</LayoutBtn>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cta" className="text-xs">Button label</Label>
                        <Input
                          id="cta"
                          value={editing.lead_magnet_cta || ""}
                          onChange={(e) => setEditing({ ...editing, lead_magnet_cta: e.target.value })}
                          placeholder="Download the whitepaper"
                          maxLength={80}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Whitepaper PDF</Label>
                      {editing.lead_magnet_file_path ? (
                        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                          <FileText className="h-5 w-5 text-emerald-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{editing.lead_magnet_file_name || "Uploaded PDF"}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{editing.lead_magnet_file_path}</div>
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={removePdf}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-border bg-card cursor-pointer hover:bg-muted/50 transition-colors">
                          <Upload className="h-5 w-5 text-muted-foreground" />
                          <div className="flex-1 text-sm">
                            <div className="font-medium">{uploadingPdf ? "Uploading…" : "Upload a PDF"}</div>
                            <div className="text-[11px] text-muted-foreground">PDF only, up to 25 MB. Stored privately.</div>
                          </div>
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            disabled={uploadingPdf}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadPdf(f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Form fields to require</Label>
                      <div className="flex flex-wrap gap-3">
                        <FieldToggle label="First name" checked={!!fields.first_name} onChange={(v) => setField("first_name", v)} />
                        <FieldToggle label="Last name" checked={!!fields.last_name} onChange={(v) => setField("last_name", v)} />
                        <FieldToggle label="Company" checked={!!fields.company} onChange={(v) => setField("company", v)} />
                        <FieldToggle label="Role" checked={!!fields.role} onChange={(v) => setField("role", v)} />
                        <FieldToggle label="Country" checked={!!fields.country} onChange={(v) => setField("country", v)} />
                        <FieldToggle label="Consent checkbox" checked={!!fields.consent} onChange={(v) => setField("consent", v)} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">Email is always required.</p>
                    </div>
                  </div>
                )}
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-md font-medium flex items-center gap-1.5 ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {icon}{children}
    </button>
  );
}

function LayoutBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 text-xs rounded-md font-medium ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function FieldToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}