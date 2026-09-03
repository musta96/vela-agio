import { useCallback, useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TickerSearch } from "@/components/TickerSearch";
import { supabase } from "@/integrations/supabase/client";
import { BrainCircuit, Loader2, Sparkles, FileText, ExternalLink } from "lucide-react";
import { AIEquityAnalystDialog, type AnalystInput } from "@/components/research/AIEquityAnalystDialog";
import { SavedResearchNotes, type SavedNote } from "@/components/research/SavedResearchNotes";

interface Filing {
  form: string;
  date: string;
  url: string;
  accession?: string;
}

const ANNUAL = ["10-K", "20-F", "40-F"];
const QUARTERLY = ["10-Q", "6-K"];

export default function ResearchAnalyst() {
  const [symbol, setSymbol] = useState("AAPL");
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [analystOpen, setAnalystOpen] = useState(false);
  const [analystInput, setAnalystInput] = useState<AnalystInput | null>(null);
  const [notesRefresh, setNotesRefresh] = useState(0);

  const loadFilings = useCallback(async (sym: string) => {
    setLoading(true);
    setNote(null);
    const { data } = await supabase.functions.invoke("sec-edgar", { body: { symbol: sym, kind: "filings" } });
    setFilings((data?.items ?? []) as Filing[]);
    setNote(data?.note ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFilings(symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyzeFiling = (f: Filing) => {
    setAnalystInput({ symbol: symbol.toUpperCase(), mode: "filing", filingUrl: f.url, filingLabel: `${f.form} • ${f.date}` });
    setAnalystOpen(true);
  };

  const analyzeLatest = (forms: string[]) => {
    const f = filings.find((x) => forms.includes(x.form));
    if (f) analyzeFiling(f);
  };

  const analyzeTranscript = () => {
    if (!transcript.trim()) return;
    setAnalystInput({ symbol: symbol.toUpperCase(), mode: "transcript", transcript });
    setAnalystOpen(true);
  };

  const reopenNote = (n: SavedNote) => {
    setAnalystInput({
      symbol: n.symbol,
      name: n.name ?? undefined,
      mode: n.mode,
      filingUrl: n.source_url ?? undefined,
      filingLabel: n.source_label ?? undefined,
      initialReport: n.report,
      initialGeneratedAt: n.generated_at,
      initialModel: n.model ?? undefined,
      initialSourceLabel: n.source_label ?? undefined,
    });
    setAnalystOpen(true);
  };

  const latestAnnual = filings.find((f) => ANNUAL.includes(f.form));
  const latestQuarter = filings.find((f) => QUARTERLY.includes(f.form));
  const latest8K = filings.find((f) => f.form === "8-K");

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="AI Equity Research Analyst | Vela.ai"
        description="Summarize annual reports and earnings calls, extract key risks and generate institutional research notes with AI."
        path="/research-analyst"
      />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <BrainCircuit className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">AI Equity Research Analyst</h1>
        </div>
        <p className="text-muted-foreground max-w-3xl">
          One place to summarize annual reports and earnings calls, extract key risks with verbatim citations, and
          generate a portfolio-manager grade research note.
        </p>

        <div className="flex flex-wrap gap-2 items-end max-w-2xl">
          <div className="flex-1 min-w-[240px]">
            <TickerSearch
              value={symbol}
              onValueChange={setSymbol}
              onSelect={(hit) => {
                const s = hit.symbol.toUpperCase();
                setSymbol(s);
                loadFilings(s);
              }}
              placeholder="Search instrument"
            />
          </div>
          <Button variant="outline" onClick={() => loadFilings(symbol)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load filings"}
          </Button>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Button className="justify-start" disabled={!latestAnnual} onClick={() => analyzeLatest(ANNUAL)}>
            <Sparkles className="h-4 w-4 mr-2" />
            {latestAnnual ? `Analyze latest annual (${latestAnnual.form} • ${latestAnnual.date})` : "No annual report found"}
          </Button>
          <Button variant="secondary" className="justify-start" disabled={!latestQuarter} onClick={() => analyzeLatest(QUARTERLY)}>
            <Sparkles className="h-4 w-4 mr-2" />
            {latestQuarter ? `Analyze latest quarterly (${latestQuarter.form} • ${latestQuarter.date})` : "No quarterly found"}
          </Button>
          <Button variant="secondary" className="justify-start" disabled={!latest8K} onClick={() => analyzeLatest(["8-K"])}>
            <Sparkles className="h-4 w-4 mr-2" />
            {latest8K ? `Analyze latest 8-K (${latest8K.date})` : "No 8-K found"}
          </Button>
        </div>

        {note && <p className="text-sm text-muted-foreground">{note}</p>}

        <Tabs defaultValue="filings">
          <TabsList>
            <TabsTrigger value="filings">Filings</TabsTrigger>
            <TabsTrigger value="transcript">Earnings call</TabsTrigger>
          </TabsList>

          <TabsContent value="filings" className="space-y-2 pt-4">
            {!loading && filings.length === 0 && (
              <p className="text-sm text-muted-foreground">No filings available for this instrument.</p>
            )}
            {filings.slice(0, 25).map((f, i) => (
              <Card key={`${f.accession ?? f.url}-${i}`}>
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">{f.form}</Badge>
                    <span className="font-mono text-sm">{f.date}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => analyzeFiling(f)}>
                      <Sparkles className="h-3 w-3 mr-1" /> AI Analyze
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a href={f.url} target="_blank" rel="noreferrer">
                        Open <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="transcript" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" /> Earnings call transcript
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Paste the full earnings call transcript here…"
                  className="min-h-[240px] font-mono text-xs"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{transcript.length.toLocaleString()} characters</span>
                  <Button onClick={analyzeTranscript} disabled={!transcript.trim() || !symbol.trim()}>
                    <Sparkles className="h-4 w-4 mr-2" /> Generate research note
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <SavedResearchNotes symbol={symbol.toUpperCase()} onReopen={reopenNote} refreshKey={notesRefresh} />

        <AIEquityAnalystDialog
          open={analystOpen}
          onOpenChange={setAnalystOpen}
          input={analystInput}
          onSaved={() => setNotesRefresh((n) => n + 1)}
        />
      </main>
    </div>
  );
}
