import { Link } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LegalLayoutProps {
  title: string;
  updated: string;
  children: React.ReactNode;
}

export function LegalLayout({ title, updated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <nav className="mb-8 flex items-center gap-4 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">← Back to Vela.ai</Link>
          <span className="opacity-30">·</span>
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/disclaimer" className="hover:text-foreground">Disclaimer</Link>
          <Link to="/cookies" className="hover:text-foreground">Cookies</Link>
        </nav>
        <header className="mb-8 pb-6 border-b border-border">
          <h1 className="text-3xl font-semibold text-foreground mb-2">{title}</h1>
          <p className="text-xs text-muted-foreground">Last updated: {updated}</p>
        </header>
        <article className="prose prose-invert prose-sm max-w-none
          prose-headings:text-foreground prose-headings:font-semibold
          prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-3
          prose-p:text-muted-foreground prose-p:leading-relaxed
          prose-li:text-muted-foreground
          prose-strong:text-foreground
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
          {children}
        </article>
      </div>
    </div>
  );
}