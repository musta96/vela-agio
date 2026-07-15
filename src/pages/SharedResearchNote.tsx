import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Sparkles, TrendingUp, Quote, ExternalLink } from "lucide-react";
import { Citation } from "@/components/research/Citation";

interface SharedData {
  symbol: string;
  name?: string;
  mode: "filing" | "transcript";
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  generatedAt: string;
  model?: string | null;
  permissions: {
    showCitations?: boolean;
    showRecommendation?: boolean;
    showRedFlags?: boolean;
    showFollowUps?: boolean;
    showResearchNote?: boolean;
  };
  report: any;
}

const severityColor: Record<string, string> = {
  high: "text-bear",
  medium: "text-warning",
  low: "text-muted-foreground",
};

export default function SharedResearchNote() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<{ status: "loading" | "ok" | "not_found" | "expired" | "error"; data?: SharedData; message?: string }>({ status: "loading" });

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("equity-research-analyst", {
          body: { action: "share_get", token, symbol: "X" },
        });
        if (error) throw error;
        if (data?.error === "not_found") return setState({ status: "not_found" });
        if (data?.error === "expired") return setState({ status: "expired" });
        if (data?.error) return setState({ status: "error", message: data.message || data.error });
        // Update page metadata
        document.title = `${data.symbol} research note`;
        setState({ status: "ok", data });
      } catch (e: any) {
        setState({ status: "error", message: e?.message || "Failed to load shared note" });
      }
    })();
  }, [token]);

  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (state.status === "not_found" || state.status === "expired" || state.status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-bear">
              <AlertTriangle className="h-5 w-5" />
              {state.status === "expired" ? "Share link expired" : state.status === "not_found" ? "Share link not found" : "Something went wrong"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {state.status === "expired"
                ? "This link has expired. Please request a new one from the author."
                : state.status === "not_found"
                  ? "This share link is invalid or has been revoked."
                  : state.message}
            </p>
            <Button asChild variant="outline"><Link to="/">Go home</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data } = state;
  if (!data) return null;
  const r = data.report ?? {};
  const perms = data.permissions ?? {};
  const sourceUrl = data.sourceUrl ?? undefined;

  const renderQuote = (q: any, i: number) => {
    const quoteText = typeof q === "string" ? q : q?.quote;
    const section = typeof q === "string" ? undefined : q?.section;
    if (!quoteText) return null;
    return (
      <div key={i} className="flex gap-2 text-sm italic text-muted-foreground border-l-2 border-primary pl-3 items-start">
        <Quote className="h-3 w-3 shrink-0 mt-1" />
        <div className="flex-1">
          <span>{quoteText}</span>
          {section && perms.showCitations !== false && (
            <span className="not-italic ml-2">
              <Badge variant="outline" className="text-[10px]">{section}</Badge>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/60 bg-card/60 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <span>{data.name || data.symbol}</span>
              <Badge variant="outline">{data.symbol}</Badge>
              {r.reportType && <Badge variant="secondary" className="text-[10px]">{r.reportType}</Badge>}
            </h1>
            <p className="text-xs text-muted-foreground">
              {data.sourceLabel ? `${data.sourceLabel} · ` : ""}
              Shared research note · Generated {new Date(data.generatedAt).toLocaleDateString()}
            </p>
          </div>
          {sourceUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={sourceUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3 mr-1" /> Source</a>
            </Button>
          )}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="text-[11px] text-muted-foreground p-2 rounded bg-muted/30 border border-border/40">
          Read-only view. This is an AI-generated research note shared by a Vela user. Not investment advice.
        </div>

        {perms.showResearchNote !== false && r.executiveSummary && (
          <section>
            <h2 className="text-sm font-semibold mb-2">Executive summary</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line">{r.executiveSummary}</p>
          </section>
        )}
        {perms.showResearchNote !== false && r.businessOverview && (
          <section>
            <h2 className="text-sm font-semibold mb-2">Business overview</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line">{r.businessOverview}</p>
          </section>
        )}
        {r.guidance?.summary && (
          <section>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
              Guidance
              {r.guidance?.direction && r.guidance.direction !== "none" && (
                <Badge variant="outline" className="capitalize">{r.guidance.direction}</Badge>
              )}
            </h2>
            <p className="text-sm leading-relaxed whitespace-pre-line">{r.guidance.summary}</p>
          </section>
        )}

        {Array.isArray(r.keyMetrics) && r.keyMetrics.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-2">Key metrics</h2>
            <div className="grid gap-2">
              {r.keyMetrics.map((m: any, i: number) => (
                <Card key={i}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                          <span>{m.label}</span>
                          {perms.showCitations !== false && <Citation citation={m.citation} sourceUrl={sourceUrl} />}
                        </div>
                        {m.commentary && <div className="text-xs text-muted-foreground mt-1">{m.commentary}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-sm">{m.value}</div>
                        {m.yoyChange && <div className="text-xs text-muted-foreground font-mono">YoY: {m.yoyChange}</div>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {Array.isArray(r.risks) && r.risks.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-2">Risks</h2>
            <div className="space-y-2">
              {r.risks.map((rr: any, i: number) => (
                <Card key={i}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <AlertTriangle className={`h-4 w-4 ${severityColor[rr.severity] ?? ""}`} />
                      <span className="font-medium text-sm">{rr.title}</span>
                      {perms.showCitations !== false && <Citation citation={rr.citation} sourceUrl={sourceUrl} />}
                      <Badge variant="outline" className="ml-auto capitalize">{rr.category}</Badge>
                      {rr.severity && <Badge variant="secondary" className="capitalize">{rr.severity}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{rr.detail}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {Array.isArray(r.opportunities) && r.opportunities.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-2">Opportunities</h2>
            <div className="space-y-2">
              {r.opportunities.map((o: any, i: number) => (
                <Card key={i}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-bull" />
                      <span className="font-medium text-sm">{o.title}</span>
                      {o.horizon && <Badge variant="outline" className="ml-auto capitalize">{o.horizon} term</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{o.detail}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {r.managementTone && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Management tone</h2>
            <div className="flex flex-wrap gap-2">
              <Badge className="capitalize">Sentiment: {String(r.managementTone.sentiment ?? "").replace(/-/g, " ")}</Badge>
              {r.managementTone.confidence && <Badge variant="outline" className="capitalize">Confidence: {r.managementTone.confidence}</Badge>}
            </div>
            {r.managementTone.commentary && <p className="text-sm leading-relaxed">{r.managementTone.commentary}</p>}
            {Array.isArray(r.managementTone.notableQuotes) && r.managementTone.notableQuotes.length > 0 && (
              <div className="space-y-2">{r.managementTone.notableQuotes.map(renderQuote)}</div>
            )}
          </section>
        )}

        {perms.showResearchNote !== false && r.researchNote && (
          <section>
            <h2 className="text-sm font-semibold mb-2">Research note</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line">{r.researchNote}</p>
          </section>
        )}

        {perms.showRecommendation !== false && r.recommendation && (
          <section>
            <h2 className="text-sm font-semibold mb-2">Recommendation</h2>
            <div className="flex flex-wrap gap-2 mb-2">
              <Badge className="capitalize">Stance: {r.recommendation.stance}</Badge>
              {r.recommendation.timeframe && <Badge variant="outline" className="capitalize">{r.recommendation.timeframe} term</Badge>}
            </div>
            <p className="text-sm leading-relaxed">{r.recommendation.rationale}</p>
          </section>
        )}

        {perms.showRedFlags !== false && Array.isArray(r.redFlags) && r.redFlags.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2 text-bear"><AlertTriangle className="h-4 w-4" /> Red flags</h2>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {r.redFlags.map((x: string, i: number) => <li key={i}>{x}</li>)}
            </ul>
          </section>
        )}

        {perms.showFollowUps !== false && Array.isArray(r.followUpQuestions) && r.followUpQuestions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-2">Follow-up questions</h2>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {r.followUpQuestions.map((q: string, i: number) => <li key={i}>{q}</li>)}
            </ul>
          </section>
        )}

        <footer className="pt-6 border-t border-border/60 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>Generated by Vela AI Equity Research{data.model ? ` · ${data.model}` : ""}</span>
          <Link to="/" className="hover:text-primary">vela.ai →</Link>
        </footer>
      </main>
    </div>
  );
}