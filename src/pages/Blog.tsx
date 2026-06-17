import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { BlogPostRow } from "@/lib/blog";
import { ArrowRight, Clock, Lock } from "lucide-react";
import VelaLogo from "@/components/VelaLogo";

export default function Blog() {
  const [posts, setPosts] = useState<BlogPostRow[] | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("blog_posts" as any)
        .select("*")
        .eq("published", true)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (!cancel) setPosts(((data as any) || []) as BlogPostRow[]);
    })();
    return () => { cancel = true; };
  }, []);

  const featured = posts?.[0];
  const rest = posts?.slice(1) || [];

  return (
    <div className="min-h-screen" style={{ background: "#ffffff", color: "#042C53" }}>
      <Helmet>
        <title>Blog & News | Vela</title>
        <meta name="description" content="Research, market commentary, product news and deep-dive guides from the Vela team." />
        <link rel="canonical" href="/blog" />
      </Helmet>

      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/70 border-b border-[rgba(4,44,83,0.08)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3"><VelaLogo size={28} /></Link>
          <nav className="flex items-center gap-5 text-sm font-semibold" style={{ color: "#3d4f66" }}>
            <Link to="/" className="hover:text-[#042C53]">Home</Link>
            <Link to="/blog" className="text-[#042C53]">Blog</Link>
            <Link to="/auth" className="px-4 py-2 rounded-full text-white" style={{ background: "linear-gradient(135deg,#042C53,#185FA5,#1D9E75)" }}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-6">
        <span className="text-[11px] font-bold tracking-[0.22em] uppercase" style={{ color: "#185FA5" }}>The Vela Journal</span>
        <h1 className="mt-3 text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight">
          <span style={{ color: "#042C53" }}>Research, news</span>{" "}
          <span style={{ color: "#1D9E75" }}>and field notes.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base sm:text-lg" style={{ color: "#3d4f66" }}>
          Deep dives on markets, product changes and methodology — written by the team building Vela.
        </p>
      </section>

      {posts === null && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 text-center" style={{ color: "#3d4f66" }}>Loading articles…</div>
      )}
      {posts && posts.length === 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 text-center" style={{ color: "#3d4f66" }}>
          No articles published yet. Check back soon.
        </div>
      )}

      {featured && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <Link to={`/blog/${featured.slug}`} className="block group rounded-3xl overflow-hidden border border-[rgba(4,44,83,0.08)] bg-white/70 backdrop-blur-md hover:shadow-2xl transition-all">
            <div className="grid md:grid-cols-2">
              <div className="aspect-[16/10] md:aspect-auto bg-gradient-to-br from-[#185FA5] via-[#378ADD] to-[#1D9E75] relative overflow-hidden">
                {featured.cover_image_url ? (
                  <img src={featured.cover_image_url} alt={featured.title} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-white/80 text-xs font-bold tracking-[0.3em] uppercase">Featured</div>
                )}
              </div>
              <div className="p-7 sm:p-10 flex flex-col justify-center">
                <div className="flex items-center gap-3 text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: "#185FA5" }}>
                  {featured.category || "Featured"}
                  {featured.gated_html && <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "#1D9E75" }}><Lock className="h-3 w-3" /> Members</span>}
                </div>
                <h2 className="mt-3 text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight group-hover:text-[#185FA5] transition-colors" style={{ color: "#042C53" }}>
                  {featured.title}
                </h2>
                {featured.excerpt && <p className="mt-3 text-base leading-relaxed" style={{ color: "#3d4f66" }}>{featured.excerpt}</p>}
                <div className="mt-5 flex items-center gap-4 text-xs" style={{ color: "#3d4f66" }}>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {featured.reading_minutes} min read</span>
                  {featured.author_name && <span>· By {featured.author_name}</span>}
                </div>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "#185FA5" }}>
                  Read article <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </Link>
        </section>
      )}

      {rest.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {rest.map((p) => (
              <Link
                key={p.id}
                to={`/blog/${p.slug}`}
                className="group flex flex-col rounded-2xl overflow-hidden border border-[rgba(4,44,83,0.08)] bg-white/70 backdrop-blur-md hover:shadow-xl hover:-translate-y-0.5 transition-all"
              >
                <div className="aspect-[16/10] bg-gradient-to-br from-[#042C53] via-[#185FA5] to-[#1D9E75] relative overflow-hidden">
                  {p.cover_image_url ? (
                    <img src={p.cover_image_url} alt={p.title} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-white/70 text-[10px] font-bold tracking-[0.3em] uppercase">
                      {p.category || "Article"}
                    </div>
                  )}
                </div>
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: "#185FA5" }}>
                    <span>{p.category || "Article"}</span>
                    {p.gated_html && <span className="inline-flex items-center gap-1" style={{ color: "#1D9E75" }}><Lock className="h-3 w-3" /> Gated</span>}
                  </div>
                  <h3 className="mt-2 text-lg font-bold leading-snug group-hover:text-[#185FA5] transition-colors" style={{ color: "#042C53" }}>
                    {p.title}
                  </h3>
                  {p.excerpt && <p className="mt-2 text-sm line-clamp-3" style={{ color: "#3d4f66" }}>{p.excerpt}</p>}
                  <div className="mt-auto pt-4 flex items-center gap-2 text-[11px]" style={{ color: "#3d4f66" }}>
                    <Clock className="h-3 w-3" /> {p.reading_minutes} min read
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}