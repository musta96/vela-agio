import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, AlertTriangle, TrendingUp, Quote, ClipboardCopy, RefreshCw, FileDown, Printer, Zap } from "lucide-react";
import { toast } from "sonner";
import { RiskChecklistCard } from "./RiskChecklistCard";
import { Citation } from "./Citation";
import { downloadMarkdown, openPrintable } from "@/lib/research/export";

export interface AnalystInput {
  symbol: string;
  name?: string;
  mode: "filing" | "transcript";
  filingUrl?: string;
  filingLabel?: string; // "10-K • 2024-11-01"
  transcript?: string;
  // Optional: hydrate directly from a saved note (skips the "run" prompt).
  initialReport?: any;
  initialGeneratedAt?: string;
  initialModel?: string;
  initialSourceLabel?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  input: AnalystInput | null;
  onSaved?: () => void; // fired after a successful analysis (list can refresh)
}

const severityColor: Record<string, string> = {
  high: "text-bear",
  medium: "text-warning",
  low: "text-muted-foreground",
};

export function AIEquityAnalystDialog({ open, onOpenChange, input, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState("");
  const [report, setReport] = useState<any | null>(null);
  const [meta, setMeta] = useState<{ sourceNote?: string; model?: string; generatedAt?: string; cached?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from a saved note when opened via "Open" from the saved list.
  useEffect(() => {
    if (open && input?.initialReport) {
      setReport(input.initialReport);
      setMeta({
        model: input.initialModel,
        generatedAt: input.initialGeneratedAt,
        cached: true,
      });
      setError(null);
    }
  }, [open, input]);

  const run = async (force = false) => {
    if (!input) return;
    setLoading(true); setError(null); setReport(null);
    try {
      const { data, error } = await supabase.functions.invoke("equity-research-analyst", {
        body: {
          action: "analyze",
          symbol: input.symbol,
          name: input.name,
          mode: input.mode,
          filingUrl: input.filingUrl,
          filingLabel: input.filingLabel,
          transcript: input.transcript,
          focus: focus.trim() || undefined,
          force,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setReport(data?.report ?? null);
      setMeta({ sourceNote: data?.sourceNote, model: data?.model, generatedAt: data?.generatedAt, cached: !!data?.cached });
      onSaved?.();
    } catch (e: any) {
      setError(e?.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const copyJson = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    toast.success("Research note copied to clipboard");
  };

  const exportCtx = () => ({
    symbol: input?.symbol ?? "",
    name: input?.name,
    mode: input?.mode ?? "filing",
    sourceUrl: input?.filingUrl,
    sourceLabel: input?.filingLabel ?? input?.initialSourceLabel,
    generatedAt: meta?.generatedAt,
    model: meta?.model,
    report,
  }) as const;

  const reset = () => {
    setReport(null); setError(null); setMeta(null);
  };

  const renderQuote = (q: any, i: number) => {
    const quoteText = typeof q === "string" ? q : q?.quote;
    const section = typeof q === "string" ? undefined : q?.section;
    if (!quoteText) return null;
    return (
      <div key={i} className="flex gap-2 text-sm italic text-muted-foreground border-l-2 border-primary pl-3 items-start">
        <Quote className="h-3 w-3 shrink-0 mt-1" />
        <div className="flex-1">
          <span>{quoteText}</span>
          {section && (
            <span className="not-italic ml-2">
              <Badge variant="outline" className="text-[10px]">{section}</Badge>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { reset(); setFocus(""); } }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Equity Research Analyst — {input?.symbol}
          </DialogTitle>
          <DialogDescription>
            {input?.mode === "filing"
              ? <>Summarizing filing {input?.filingLabel ? <span className="font-mono">{input.filingLabel}</span> : "from SEC EDGAR"}. Extracts key metrics, risks, guidance and generates a research note.</>
              : "Paste an earnings call transcript to extract key metrics, management tone, risks and a research note."}
          </DialogDescription>
        </DialogHeader>

        {!report && !loading && (
          <div className="space-y-3">
            <label className="text-sm font-medium">Focus (optional)</label>
            <Input
              placeholder="e.g. margin trajectory, guidance credibility, capex plans"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
            />
            {error && <p className="text-sm text-bear">{error}</p>}
            <Button onClick={() => run(false)} className="w-full" disabled={!input}>
              <Sparkles className="h-4 w-4 mr-2" /> Run AI analysis
            </Button>
            <p className="text-xs text-muted-foreground">
              The AI reads the source document, extracts figures/risks with inline SEC section citations, and drafts a portfolio-manager style research note. Repeat runs on the same filing are served from your saved cache within 7 days.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Reading document and generating research note…</p>
          </div>
        )}

        {report && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {report.reportType && <Badge variant="secondary">{report.reportType}</Badge>}
              {report.period && <Badge variant="outline">{report.period}</Badge>}
              {report.managementTone?.sentiment && (
                <Badge className="capitalize">{String(report.managementTone.sentiment).replace(/-/g, " ")}</Badge>
              )}
              {report.recommendation?.stance && (
                <Badge variant="outline" className="capitalize">Stance: {report.recommendation.stance}</Badge>
              )}
              {meta?.cached && <Badge variant="outline" className="gap-1"><Zap className="h-3 w-3" /> Cached</Badge>}
              <div className="ml-auto flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" onClick={() => openPrintable(exportCtx())}><Printer className="h-3 w-3 mr-1" /> PDF</Button>
                <Button size="sm" variant="ghost" onClick={() => downloadMarkdown(exportCtx())}><FileDown className="h-3 w-3 mr-1" /> Markdown</Button>
                <Button size="sm" variant="ghost" onClick={copyJson}><ClipboardCopy className="h-3 w-3 mr-1" /> JSON</Button>
                {meta?.cached && input && !input.initialReport && (
                  <Button size="sm" variant="ghost" onClick={() => run(true)} title="Force fresh AI analysis (bills a new run)">
                    <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => { reset(); }}><RefreshCw className="h-3 w-3 mr-1" /> New run</Button>
              </div>
            </div>
            {meta?.sourceNote && <p className="text-xs text-muted-foreground">{meta.sourceNote}</p>}

            <Tabs defaultValue="summary" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="justify-start flex-wrap h-auto">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="metrics">Key Metrics</TabsTrigger>
                <TabsTrigger value="risks">Risks</TabsTrigger>
                <TabsTrigger value="opps">Opportunities</TabsTrigger>
                <TabsTrigger value="tone">Tone</TabsTrigger>
                <TabsTrigger value="note">Research Note</TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1 mt-3">
                <TabsContent value="summary" className="space-y-3 mt-0">
                  {report.executiveSummary && (
                    <div>
                      <h4 className="font-semibold mb-1">Executive summary</h4>
                      <p className="text-sm leading-relaxed whitespace-pre-line">{report.executiveSummary}</p>
                    </div>
                  )}
                  {report.businessOverview && (
                    <div>
                      <h4 className="font-semibold mb-1">Business overview</h4>
                      <p className="text-sm leading-relaxed whitespace-pre-line">{report.businessOverview}</p>
                    </div>
                  )}
                  {report.guidance?.summary && (
                    <div>
                      <h4 className="font-semibold mb-1 flex items-center gap-2">
                        Guidance
                        {report.guidance?.direction && report.guidance.direction !== "none" && (
                          <Badge variant="outline" className="capitalize">{report.guidance.direction}</Badge>
                        )}
                      </h4>
                      <p className="text-sm leading-relaxed whitespace-pre-line">{report.guidance.summary}</p>
                    </div>
                  )}
                  {report.capitalAllocation && (
                    <div>
                      <h4 className="font-semibold mb-1">Capital allocation</h4>
                      <p className="text-sm leading-relaxed whitespace-pre-line">{report.capitalAllocation}</p>
                    </div>
                  )}
                  {Array.isArray(report.redFlags) && report.redFlags.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-1 flex items-center gap-2 text-bear"><AlertTriangle className="h-4 w-4" /> Red flags</h4>
                      <ul className="list-disc pl-5 text-sm space-y-1">
                        {report.redFlags.map((r: string, i: number) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="metrics" className="mt-0">
                  <div className="grid gap-2">
                    {(report.keyMetrics ?? []).map((m: any, i: number) => (
                      <Card key={i}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                                <span>{m.label}</span>
                                <Citation citation={m.citation} sourceUrl={input?.filingUrl} />
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
                    {(!report.keyMetrics || report.keyMetrics.length === 0) && <p className="text-sm text-muted-foreground">No metrics extracted.</p>}
                  </div>
                </TabsContent>

                <TabsContent value="risks" className="mt-0 space-y-2">
                  <RiskChecklistCard
                    risks={report.risks}
                    sourceUrl={input?.filingUrl}
                    noteKey={savedId ?? input?.filingUrl ?? `${input?.symbol ?? "note"}-${report.period ?? ""}`}
                  />
                </TabsContent>

                <TabsContent value="opps" className="mt-0 space-y-2">
                  {(report.opportunities ?? []).map((o: any, i: number) => (
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
                  {(!report.opportunities || report.opportunities.length === 0) && <p className="text-sm text-muted-foreground">No opportunities extracted.</p>}
                </TabsContent>

                <TabsContent value="tone" className="mt-0 space-y-3">
                  {report.managementTone && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Badge className="capitalize">Sentiment: {String(report.managementTone.sentiment ?? "").replace(/-/g, " ")}</Badge>
                        {report.managementTone.confidence && <Badge variant="outline" className="capitalize">Confidence: {report.managementTone.confidence}</Badge>}
                      </div>
                      {report.managementTone.commentary && <p className="text-sm leading-relaxed">{report.managementTone.commentary}</p>}
                      {Array.isArray(report.managementTone.notableQuotes) && report.managementTone.notableQuotes.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm">Notable quotes</h4>
                          {report.managementTone.notableQuotes.map(renderQuote)}
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="note" className="mt-0 space-y-3">
                  {report.researchNote && (
                    <div>
                      <h4 className="font-semibold mb-1">Research note</h4>
                      <p className="text-sm leading-relaxed whitespace-pre-line">{report.researchNote}</p>
                    </div>
                  )}
                  {report.recommendation && (
                    <div>
                      <h4 className="font-semibold mb-1">Recommendation</h4>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <Badge className="capitalize">Stance: {report.recommendation.stance}</Badge>
                        {report.recommendation.timeframe && <Badge variant="outline" className="capitalize">{report.recommendation.timeframe} term</Badge>}
                      </div>
                      <p className="text-sm leading-relaxed">{report.recommendation.rationale}</p>
                    </div>
                  )}
                  {Array.isArray(report.followUpQuestions) && report.followUpQuestions.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-1">Follow-up questions for management</h4>
                      <ul className="list-disc pl-5 text-sm space-y-1">
                        {report.followUpQuestions.map((q: string, i: number) => <li key={i}>{q}</li>)}
                      </ul>
                    </div>
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>

            {meta?.model && (
              <p className="text-[10px] text-muted-foreground text-right">
                Generated {meta.generatedAt ? new Date(meta.generatedAt).toLocaleString() : ""} · {meta.model}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}