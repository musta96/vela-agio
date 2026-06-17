import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { BlogPostRow, sanitizeHtml, isUnlocked, markUnlocked } from "@/lib/blog";
import { ArrowLeft, Clock, Lock, Mail } from "lucide-react";
import VelaLogo from "@/components/VelaLogo";
import { toast } from "sonner";
import { z } from "zod";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);

export default function BlogPost() {
  const { slug = "" } = useParams();
  const [post, setPost] = useState<BlogPostRow | null | undefined>(undefined);
  const [unlocked, setUnlocked] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("blog_posts" as any)
        .select("*")
        .eq("slug", slug)
        .eq("published", true)
        .maybeSingle();
      if (!cancel) {
        setPost((data as any) || null);
        setUnlocked(isUnlocked(slug));
      }
    })();
    return () => { cancel = true; };
  }, [slug]);

  const safePublic = useMemo(() => post ? sanitizeHtml(post.content_html) : "", [post]);
  const safeGated = useMemo(() => post?.gated_html ? sanitizeHtml(post.gated_html) : "", [post]);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("blog_leads" as any).insert({
        post_id: post?.id ?? null,
        email: parsed.data,
        source: "blog-gate",
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 240) : null,
      });
      if (error) throw error;
      markUnlocked(slug);
      setUnlocked(true);
      toast.success("Unlocked. Enjoy the article.");
    } catch (err: any) {
      toast.error(err?.message || "Could not submit email");
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

        <div
          className="mt-8 prose prose-lg max-w-none prose-headings:text-[#042C53] prose-a:text-[#185FA5] prose-strong:text-[#042C53] prose-table:text-sm prose-table:border-collapse prose-th:border prose-th:border-[#cbd5e1] prose-th:bg-[#f1f5f9] prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-[#cbd5e1] prose-td:px-3 prose-td:py-2"
          style={{ color: "#1f2d3d" }}
          dangerouslySetInnerHTML={{ __html: safePublic }}
        />

        {post.gated_html && (
          <div className="mt-10">
            {unlocked ? (
              <div
                className="prose prose-lg max-w-none prose-headings:text-[#042C53] prose-a:text-[#185FA5] prose-strong:text-[#042C53] prose-table:text-sm prose-th:border prose-th:border-[#cbd5e1] prose-th:bg-[#f1f5f9] prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-[#cbd5e1] prose-td:px-3 prose-td:py-2"
                style={{ color: "#1f2d3d" }}
                dangerouslySetInnerHTML={{ __html: safeGated }}
              />
            ) : (
              <form
                onSubmit={submitEmail}
                className="relative rounded-2xl border border-[rgba(4,44,83,0.12)] bg-gradient-to-br from-white via-[#f1f7ff] to-[#eafff4] p-7 sm:p-10 text-center overflow-hidden"
              >
                <div className="mx-auto h-12 w-12 rounded-2xl grid place-items-center text-white shadow-lg" style={{ background: "linear-gradient(135deg,#185FA5,#1D9E75)" }}>
                  <Lock className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: "#042C53" }}>
                  Keep reading — it's free
                </h2>
                <p className="mt-2 max-w-md mx-auto text-sm sm:text-base" style={{ color: "#3d4f66" }}>
                  Drop your email to unlock the rest of this article and get the occasional research note from Vela.
                </p>
                <div className="mt-6 flex flex-col sm:flex-row max-w-md mx-auto gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#3d4f66]" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full h-11 pl-9 pr-3 rounded-full bg-white border border-[rgba(4,44,83,0.15)] text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]/30"
                      maxLength={255}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="h-11 px-5 rounded-full text-sm font-semibold text-white shadow-lg disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#042C53,#185FA5,#1D9E75)" }}
                  >
                    {submitting ? "Unlocking…" : "Unlock article"}
                  </button>
                </div>
                <p className="mt-3 text-[11px]" style={{ color: "#3d4f66" }}>
                  No spam. Unsubscribe anytime. By continuing you agree to our <Link to="/privacy" className="underline">privacy policy</Link>.
                </p>
              </form>
            )}
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