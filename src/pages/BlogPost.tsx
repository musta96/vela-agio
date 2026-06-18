import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { BlogPostRow, sanitizeHtml, isUnlocked, markUnlocked, splitByInlineGate } from "@/lib/blog";
import { ArrowLeft, Clock, Lock, Mail, Download, FileText } from "lucide-react";
import VelaLogo from "@/components/VelaLogo";
import { toast } from "sonner";
import { z } from "zod";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);

const PUBLIC_SELECT =
  "id,slug,title,excerpt,cover_image_url,content_html,category,tags,author_name,reading_minutes,seo_title,seo_description,published,published_at,created_at,updated_at,has_gated,lead_magnet_enabled,lead_magnet_layout,lead_magnet_cta,lead_magnet_fields,lead_magnet_file_name";

interface LeadForm {
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  role: string;
  country: string;
  consent: boolean;
}

const emptyForm = (): LeadForm => ({
  email: "",
  first_name: "",
  last_name: "",
  company: "",
  role: "",
  country: "",
  consent: false,
});

export default function BlogPost() {
  const { slug = "" } = useParams();
  const [post, setPost] = useState<BlogPostRow | null | undefined>(undefined);
  const [unlocked, setUnlocked] = useState(false);
  const [gatedHtml, setGatedHtml] = useState<string>("");
  const [form, setForm] = useState<LeadForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("blog_posts" as any)
        .select(PUBLIC_SELECT)
        .eq("slug", slug)
        .eq("published", true)
        .maybeSingle();
      if (!cancel) {
        // gated_html is not selectable via column-level grant; surface presence via the alias.
        const row = data as any;
        if (row) {
          row.gated_html = null;
          row.has_gated = !!row.has_gated;
        }
        setPost(row || null);
        setUnlocked(isUnlocked(slug));
      }
    })();
    return () => { cancel = true; };
  }, [slug]);

  // Three gating modes:
  //   - lead_magnet form_only: hide all article body, show only the form/download
  //   - inline marker in content_html: split content before/after the marker
  //   - legacy gated_html column: append after public content once unlocked
  const isLeadMagnet = !!post?.lead_magnet_enabled;
  const isFormOnly = isLeadMagnet && post?.lead_magnet_layout === "form_only";
  const isWithArticle = isLeadMagnet && post?.lead_magnet_layout !== "form_only";

  const split = useMemo(() => splitByInlineGate(post?.content_html || ""), [post]);
  const hasInlineGate = split.after !== null;

  const safeBefore = useMemo(
    () => (isFormOnly ? "" : sanitizeHtml(split.before)),
    [split.before, isFormOnly],
  );
  const safeInlineAfter = useMemo(
    () => (split.after ? sanitizeHtml(split.after) : ""),
    [split.after],
  );
  const safeGated = useMemo(() => (gatedHtml ? sanitizeHtml(gatedHtml) : ""), [gatedHtml]);

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(form.email);
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }

    // Validate required lead-magnet fields client-side too
    const cfg = (post?.lead_magnet_fields as Record<string, boolean> | null | undefined) || {};
    if (isLeadMagnet) {
      if (cfg.first_name && !form.first_name.trim()) return toast.error("First name is required");
      if (cfg.last_name && !form.last_name.trim()) return toast.error("Last name is required");
      if (cfg.company && !form.company.trim()) return toast.error("Company is required");
      if (cfg.role && !form.role.trim()) return toast.error("Role is required");
      if (cfg.country && !form.country.trim()) return toast.error("Country is required");
      if (cfg.consent && !form.consent) return toast.error("Please accept the consent");
    }

    setSubmitting(true);
    try {
      const kind = isLeadMagnet ? "lead_magnet" : "gate";
      const { data, error } = await supabase.functions.invoke("claim-blog-lead", {
        body: {
          slug,
          email: parsed.data,
          first_name: form.first_name.trim() || null,
          last_name: form.last_name.trim() || null,
          company: form.company.trim() || null,
          role: form.role.trim() || null,
          country: form.country.trim() || null,
          consent: !!form.consent,
          kind,
        },
      });
      if (error) throw error;
      const payload = (data || {}) as { gated_html?: string; download_url?: string };
      if (payload.gated_html) setGatedHtml(payload.gated_html);
      if (payload.download_url) setDownloadUrl(payload.download_url);
      markUnlocked(slug);
      setUnlocked(true);
      toast.success(isLeadMagnet ? "Thanks. Your download is ready below." : "Unlocked. Enjoy the article.");
    } catch (err: any) {
      toast.error(err?.message || "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (post === undefined) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (post === null) return (
    <div className="min-h-screen grid place-items-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">Article not found</h1>
        <Link to="/blog" className="mt-3 inline-block text-primary underline">Back to the blog</Link>
      </div>
    </div>
  );

  const fieldsCfg = (post.lead_magnet_fields as Record<string, boolean> | null | undefined) || {};

  const renderLeadForm = (mode: "gate" | "lead_magnet") => {
    const ctaText = mode === "lead_magnet"
      ? (post.lead_magnet_cta || "Download the whitepaper")
      : "Unlock article";
    const title = mode === "lead_magnet"
      ? (post.lead_magnet_cta || "Download the whitepaper")
      : "Keep reading — it's free";
    const subtitle = mode === "lead_magnet"
      ? "Tell us a bit about yourself and your PDF will be ready to download."
      : "Drop your email to unlock the rest of this article and get the occasional research note from Vela.";
    const Icon = mode === "lead_magnet" ? FileText : Lock;

    return (
      <form
        onSubmit={submitForm}
        className="relative rounded-2xl border border-[rgba(4,44,83,0.12)] bg-gradient-to-br from-white via-[#f1f7ff] to-[#eafff4] p-7 sm:p-10 overflow-hidden"
      >
        <div className="mx-auto h-12 w-12 rounded-2xl grid place-items-center text-white shadow-lg" style={{ background: "linear-gradient(135deg,#185FA5,#1D9E75)" }}>
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight text-center" style={{ color: "#042C53" }}>
          {title}
        </h2>
        <p className="mt-2 max-w-md mx-auto text-sm sm:text-base text-center" style={{ color: "#3d4f66" }}>
          {subtitle}
        </p>

        <div className="mt-6 max-w-md mx-auto grid gap-2">
          {mode === "lead_magnet" && fieldsCfg.first_name && (
            <FieldInput placeholder="First name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} maxLength={120} />
          )}
          {mode === "lead_magnet" && fieldsCfg.last_name && (
            <FieldInput placeholder="Last name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} maxLength={120} />
          )}
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#3d4f66]" />
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              className="w-full h-11 pl-9 pr-3 rounded-full bg-white border border-[rgba(4,44,83,0.15)] text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]/30"
              maxLength={255}
            />
          </div>
          {mode === "lead_magnet" && fieldsCfg.company && (
            <FieldInput placeholder="Company" value={form.company} onChange={(v) => setForm({ ...form, company: v })} maxLength={200} />
          )}
          {mode === "lead_magnet" && fieldsCfg.role && (
            <FieldInput placeholder="Role / job title" value={form.role} onChange={(v) => setForm({ ...form, role: v })} maxLength={120} />
          )}
          {mode === "lead_magnet" && fieldsCfg.country && (
            <FieldInput placeholder="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} maxLength={120} />
          )}

          {mode === "lead_magnet" && fieldsCfg.consent && (
            <label className="mt-1 flex items-start gap-2 text-xs text-left" style={{ color: "#3d4f66" }}>
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                className="mt-0.5"
              />
              <span>I agree to receive occasional emails from Vela and accept the <Link to="/privacy" className="underline">privacy policy</Link>.</span>
            </label>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 h-11 px-5 rounded-full text-sm font-semibold text-white shadow-lg disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#042C53,#185FA5,#1D9E75)" }}
          >
            {submitting ? "Submitting…" : ctaText}
          </button>
        </div>

        {mode === "gate" && (
          <p className="mt-3 text-[11px] text-center" style={{ color: "#3d4f66" }}>
            No spam. Unsubscribe anytime. By continuing you agree to our <Link to="/privacy" className="underline">privacy policy</Link>.
          </p>
        )}
      </form>
    );
  };

  const renderDownloadCard = () => (
    <div className="rounded-2xl border border-[rgba(4,44,83,0.12)] bg-gradient-to-br from-white via-[#f1f7ff] to-[#eafff4] p-7 sm:p-10 text-center">
      <div className="mx-auto h-12 w-12 rounded-2xl grid place-items-center text-white shadow-lg" style={{ background: "linear-gradient(135deg,#1D9E75,#185FA5)" }}>
        <FileText className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: "#042C53" }}>
        Your download is ready
      </h2>
      <p className="mt-2 max-w-md mx-auto text-sm" style={{ color: "#3d4f66" }}>
        {post.lead_magnet_file_name ? `File: ${post.lead_magnet_file_name}` : "Click below to download your PDF."} This link expires in 15 minutes.
      </p>
      {downloadUrl ? (
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 h-11 px-6 rounded-full text-sm font-semibold text-white shadow-lg"
          style={{ background: "linear-gradient(135deg,#042C53,#185FA5,#1D9E75)" }}
        >
          <Download className="h-4 w-4" /> Download PDF
        </a>
      ) : (
        <p className="mt-4 text-xs text-[#3d4f66]">Reload the page if you need a fresh link.</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#ffffff", color: "#042C53" }}>
      <Helmet>
        <title>{(post.seo_title || post.title) + " | Vela"}</title>
        <meta name="description" content={post.seo_description || post.excerpt || `${post.title} — read on the Vela blog.`} />
        <link rel="canonical" href={`/blog/${post.slug}`} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt || ""} />
        {post.cover_image_url && <meta property="og:image" content={post.cover_image_url} />}
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.excerpt || undefined,
          image: post.cover_image_url || undefined,
          datePublished: post.published_at || post.created_at,
          dateModified: post.updated_at,
          author: post.author_name ? { "@type": "Person", name: post.author_name } : { "@type": "Organization", name: "Vela" },
        })}</script>
      </Helmet>

      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/70 border-b border-[rgba(4,44,83,0.08)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3"><VelaLogo size={28} /></Link>
          <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#3d4f66" }}>
            <ArrowLeft className="h-4 w-4" /> All articles
          </Link>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="text-[11px] font-bold tracking-[0.22em] uppercase" style={{ color: "#185FA5" }}>
          {post.category || "Article"}
        </div>
        <h1 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight" style={{ color: "#042C53" }}>
          {post.title}
        </h1>
        {post.excerpt && <p className="mt-4 text-lg sm:text-xl" style={{ color: "#3d4f66" }}>{post.excerpt}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-4 text-xs" style={{ color: "#3d4f66" }}>
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {post.reading_minutes} min read</span>
          {post.author_name && <span>By {post.author_name}</span>}
          {post.published_at && <span>{new Date(post.published_at).toLocaleDateString()}</span>}
        </div>

        {post.cover_image_url && (
          <img
            src={post.cover_image_url}
            alt={post.title}
            className="mt-8 rounded-2xl w-full aspect-[16/9] object-cover border border-[rgba(4,44,83,0.08)]"
            loading="lazy"
          />
        )}

        {/* Body */}
        {!isFormOnly && (
          <div
            className="mt-8 prose prose-lg max-w-none prose-headings:text-[#042C53] prose-a:text-[#185FA5] prose-strong:text-[#042C53] prose-table:text-sm prose-table:border-collapse prose-th:border prose-th:border-[#cbd5e1] prose-th:bg-[#f1f5f9] prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-[#cbd5e1] prose-td:px-3 prose-td:py-2"
            style={{ color: "#1f2d3d" }}
            dangerouslySetInnerHTML={{ __html: safeBefore }}
          />
        )}

        {/* Inline gate (split content_html) */}
        {!isLeadMagnet && hasInlineGate && (
          <div className="mt-10">
            {unlocked ? (
              <div
                className="prose prose-lg max-w-none prose-headings:text-[#042C53] prose-a:text-[#185FA5] prose-strong:text-[#042C53]"
                style={{ color: "#1f2d3d" }}
                dangerouslySetInnerHTML={{ __html: safeInlineAfter }}
              />
            ) : (
              renderLeadForm("gate")
            )}
          </div>
        )}

        {/* Legacy gated_html field (only used when no inline marker) */}
        {!isLeadMagnet && !hasInlineGate && (post as any).has_gated && (
          <div className="mt-10">
            {unlocked ? (
              <div
                className="prose prose-lg max-w-none prose-headings:text-[#042C53] prose-a:text-[#185FA5] prose-strong:text-[#042C53] prose-table:text-sm prose-th:border prose-th:border-[#cbd5e1] prose-th:bg-[#f1f5f9] prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-[#cbd5e1] prose-td:px-3 prose-td:py-2"
                style={{ color: "#1f2d3d" }}
                dangerouslySetInnerHTML={{ __html: safeGated }}
              />
            ) : (
              renderLeadForm("gate")
            )}
          </div>
        )}

        {/* Lead magnet form / download */}
        {isLeadMagnet && (
          <div className={isFormOnly ? "mt-8" : "mt-12"}>
            {downloadUrl ? renderDownloadCard() : renderLeadForm("lead_magnet")}
          </div>
        )}

        <div className="mt-12 pt-8 border-t border-[rgba(4,44,83,0.08)] flex items-center justify-between">
          <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#185FA5" }}>
            <ArrowLeft className="h-4 w-4" /> Back to all articles
          </Link>
          <Link to="/auth" className="text-sm font-semibold px-4 py-2 rounded-full text-white" style={{ background: "linear-gradient(135deg,#042C53,#185FA5,#1D9E75)" }}>
            Try Vela free
          </Link>
        </div>
      </article>
    </div>
  );
}

function FieldInput({
  placeholder, value, onChange, maxLength,
}: { placeholder: string; value: string; onChange: (v: string) => void; maxLength?: number }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full h-11 px-3 rounded-full bg-white border border-[rgba(4,44,83,0.15)] text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]/30"
    />
  );
}