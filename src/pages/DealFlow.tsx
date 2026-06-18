import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, ExternalLink, TrendingUp, Handshake, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { FeedFallback } from "@/components/FeedFallback";
import { Skeleton } from "@/components/ui/skeleton";

type Ipo = { symbol?: string; name?: string; date?: string; exchange?: string; priceRange?: string; shares?: number; value?: number; source?: string };
type Deal = { title?: string; source?: string; url?: string; date?: string; description?: string };

export default function DealFlow() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ ipos?: Ipo[]; ma?: Deal[]; lbo?: Deal[]; summary?: string }>({});
  const [summarizing, setSummarizing] = useState(false);

  const [errored, setErrored] = useState(false);
  const load = async (summarize = false) => {
    setLoading(true); setErrored(false); if (summarize) setSummarizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("deal-flow", { body: { kind: "all", summarize, days: 14 } });
      if (error) throw error;
      setData(data ?? {});
    } catch (e) {
      console.error("[deal-flow] load failed", e);
      setErrored(true);
    } finally { setLoading(false); setSummarizing(false); }
  };

  useEffect(() => { load(false); }, []);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Deal Flow - M&A, IPO, LBO | Vela.ai" description="Track live M&A, IPO and LBO deal flow with AI summaries" path="/dealflow" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Handshake className="h-7 w-7 text-primary" /> Deal Flow</h1>
            <p className="text-sm text-muted-foreground mt-1">Live M&A, IPO and LBO activity. BYO Finnhub / NewsAPI keys in Settings for richer coverage.</p>
          </div>
          <Button onClick={() => load(true)} disabled={summarizing} variant="outline" size="sm">
            {summarizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            AI summary
          </Button>
        </div>

        {data.summary && (
          <Card className="p-4 mb-6 border-primary/30 bg-primary/5">
            <div className="text-xs uppercase tracking-wider text-primary mb-2 flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI Deal-Flow Brief</div>
            <div className="prose prose-sm prose-invert max-w-none"><ReactMarkdown>{data.summary}</ReactMarkdown></div>
          </Card>
        )}

        <Tabs defaultValue="ipo">
          <TabsList>
            <TabsTrigger value="ipo"><TrendingUp className="h-4 w-4 mr-1" /> IPOs ({data.ipos?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="ma"><Handshake className="h-4 w-4 mr-1" /> M&A ({data.ma?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="lbo"><Building2 className="h-4 w-4 mr-1" /> LBO / PE ({data.lbo?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="ipo">
            {loading ? (
              <div className="grid gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}</div>
            ) : errored ? (
              <FeedFallback label="deal flow" onRetry={() => load(false)} />
            ) : (
              <div className="grid gap-2">
                {(data.ipos ?? []).length === 0 && <Card className="p-6 text-sm text-muted-foreground">No upcoming IPOs found. Add a Finnhub key in Settings for full calendar coverage.</Card>}
                {(data.ipos ?? []).map((i, idx) => (
                  (() => {
                    const inner = (
                      <Card className="p-3 flex items-center gap-3 hover:bg-accent/40 transition-colors">
                        <div className="font-mono text-sm font-bold w-16 shrink-0">{i.symbol ?? "-"}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{i.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{i.exchange} · {i.date} {i.priceRange && `· $${i.priceRange}`}</div>
                        </div>
                        {i.value && <Badge variant="outline" className="shrink-0">${(Number(i.value) / 1e6).toFixed(1)}M</Badge>}
                      </Card>
                    );
                    return i.symbol ? (
                      <Link key={idx} to={`/stock/${encodeURIComponent(i.symbol)}`} className="block">{inner}</Link>
                    ) : (
                      <div key={idx}>{inner}</div>
                    );
                  })()
                ))}
              </div>
            )}
          </TabsContent>

          {(["ma", "lbo"] as const).map(k => (
            <TabsContent key={k} value={k}>
              {loading ? (
                <div className="grid gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}</div>
              ) : errored ? (
                <FeedFallback label="deal flow" onRetry={() => load(false)} />
              ) : (
                <div className="grid gap-2">
                  {((data as any)[k] ?? []).length === 0 && <Card className="p-6 text-sm text-muted-foreground">No deals yet. Add a NewsAPI / Marketaux key in Settings for richer feeds.</Card>}
                  {((data as any)[k] ?? []).map((d: Deal, idx: number) => (
                    <a key={idx} href={d.url} target="_blank" rel="noopener noreferrer" className="block">
                      <Card className="p-3 hover:bg-accent/40 transition-colors">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{d.title}</div>
                            {d.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.description}</div>}
                            <div className="text-[11px] text-muted-foreground mt-1">{d.source} · {d.date ? new Date(d.date).toLocaleDateString() : ""}</div>
                          </div>
                          <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                        </div>
                      </Card>
                    </a>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}