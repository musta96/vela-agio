import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone, ShieldCheck, LineChart, Bell, FileText, Users, ArrowRight, Check,
} from "lucide-react";

type Doc = { id: string; kind: string; version: string; title: string; published_at: string | null };

const FEATURES = [
  { icon: LineChart, title: "Markets in your pocket", body: "Portfolios, watchlists, screeners and technical analysis synced with the web app in real time." },
  { icon: Bell, title: "Alerts that reach you", body: "Price, technical and earnings alerts delivered straight to your phone." },
  { icon: ShieldCheck, title: "Transparent by design", body: "Every disclosure and AI-usage policy is published before you pay a cent." },
  { icon: Users, title: "Built for firms", body: "Enterprise seats, team management and white-label client reporting." },
];

export default function IosApp() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("legal_documents")
        .select("id, kind, version, title, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false });
      if (!cancelled) {
        // one (latest) doc per kind
        const seen = new Set<string>();
        const latest = ((data as Doc[] | null) ?? []).filter((d) => {
          if (seen.has(d.kind)) return false;
          seen.add(d.kind);
          return true;
        });
        setDocs(latest);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Vela for iOS - Research, portfolios and alerts on your iPhone"
        description="Vela's iOS app puts portfolio analytics, AI research and alerts on your iPhone. Read every compliance document before you subscribe."
        path="/ios"
      />

      {/* Hero */}
      <header className="relative overflow-hidden border-b border-border/60">
        <div className="max-w-5xl mx-auto px-4 py-16 md:py-24 text-center">
          <Badge variant="secondary" className="mb-4 gap-1"><Smartphone className="h-3.5 w-3.5" /> iOS app</Badge>
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">
            Your research desk, on your iPhone
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            The same account, the same data. Everything you do in the app appears in the web app,
            and everything you do on the web is waiting for you on your phone.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="gap-2">
              <Link to="/auth?tab=signup">Create your free account <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/pricing">See plans &amp; pricing</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Sign up on the web today — your login works in the iOS app the moment it lands on the App Store.
          </p>
        </div>
      </header>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-14">
        <h2 className="text-xl md:text-2xl font-semibold mb-6">What you get on mobile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <Card key={f.title} className="p-5">
              <f.icon className="h-5 w-5 text-primary mb-3" aria-hidden="true" />
              <h3 className="font-medium mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Compliance documents */}
      <section className="max-w-5xl mx-auto px-4 pb-14">
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <h2 className="text-xl md:text-2xl font-semibold">Read this before you buy</h2>
          <Badge variant="outline" className="shrink-0">Published versions</Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
          These are the live documents that govern your subscription — the same versions the app
          links to. Nothing is hidden behind checkout.
        </p>

        {loading && <p className="text-sm text-muted-foreground">Loading documents…</p>}
        {!loading && docs.length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground">No published documents are available right now.</Card>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {docs.map((d) => (
            <Card key={d.id} className="p-4 flex items-start gap-3">
              <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <Link to={`/legal/${d.kind}`} className="font-medium hover:underline">{d.title}</Link>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Version <code className="font-mono">{d.version}</code>
                  {d.published_at && <> · {new Date(d.published_at).toLocaleDateString()}</>}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Enterprise */}
      <section className="border-t border-border/60 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 py-14">
          <h2 className="text-xl md:text-2xl font-semibold mb-2">For advisory firms</h2>
          <p className="text-sm text-muted-foreground max-w-2xl mb-6">
            Enterprise adds team seats, firm-level administration and white-label client reporting.
          </p>
          <Card className="p-6">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-1 mb-4">
              <span className="text-3xl font-semibold">€149</span>
              <span className="text-sm text-muted-foreground">per seat / month</span>
            </div>
            <ul className="space-y-2 text-sm mb-6">
              {["Team management and seat invitations", "White-label client portal with signed document links", "Firm-branded investment memos and reports", "Priority support"].map((x) => (
                <li key={x} className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />{x}</li>
              ))}
            </ul>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild><Link to="/pricing">Buy Enterprise seats</Link></Button>
              <Button asChild variant="outline"><Link to="/contact-sales">Talk to sales</Link></Button>
            </div>
          </Card>
        </div>
      </section>

      <footer className="max-w-5xl mx-auto px-4 py-10 text-center">
        <Button asChild size="lg" className="gap-2">
          <Link to="/auth?tab=signup">Get started free <ArrowRight className="h-4 w-4" /></Link>
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          Vela provides research tools and information, not personalised investment advice.
        </p>
      </footer>
    </div>
  );
}
