import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

type Doc = { id: string; kind: string; version: string; title: string; body: string; published_at: string | null };

export default function LegalDoc() {
  const { kind } = useParams<{ kind: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("legal_documents")
        .select("id, kind, version, title, body, published_at")
        .eq("kind", kind!)
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) { setDoc(data as Doc | null); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [kind]);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={doc ? `${doc.title} - Vela.ai` : "Legal - Vela.ai"}
        description={doc?.title || "Legal document"}
        path={`/legal/${kind}`}
      />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Button asChild variant="ghost" size="sm" className="mb-4 gap-1"><Link to="/"><ArrowLeft className="h-3.5 w-3.5" /> Home</Link></Button>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && !doc && (
          <Card className="p-8 text-center">
            <h1 className="text-xl font-semibold mb-2">Document not available</h1>
            <p className="text-sm text-muted-foreground">No published version found for <code className="font-mono">{kind}</code>.</p>
          </Card>
        )}
        {doc && (
          <article className="prose prose-sm dark:prose-invert max-w-none">
            <h1>{doc.title}</h1>
            <p className="text-xs text-muted-foreground">
              Version <code className="font-mono">{doc.version}</code>
              {doc.published_at && <> · Published {new Date(doc.published_at).toLocaleDateString()}</>}
            </p>
            <MarkdownBody body={doc.body} />
          </article>
        )}
      </div>
    </div>
  );
}

function MarkdownBody({ body }: { body: string }) {
  // Lightweight markdown: headings, paragraphs, lists, bold, italic, links.
  // Avoids adding a new dependency for a single page.
  const html = body
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .split(/\n{2,}/).map(b => b.match(/^<(h\d|ul|ol|blockquote)/) ? b : `<p>${b.replace(/\n/g, "<br/>")}</p>`).join("\n");
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}