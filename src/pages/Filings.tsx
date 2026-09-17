import { useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TickerSearch } from "@/components/TickerSearch";
import { supabase } from "@/integrations/supabase/client";
import { FileText, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AIEquityAnalystDialog, type AnalystInput } from "@/components/research/AIEquityAnalystDialog";
import { SavedResearchNotes, type SavedNote } from "@/components/research/SavedResearchNotes";

export default function Filings() {
  const { t } = useTranslation();
  const [symbol, setSymbol] = useState("AAPL");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [analystOpen, setAnalystOpen] = useState(false);
  const [analystInput, setAnalystInput] = useState<AnalystInput | null>(null);
  const [notesRefresh, setNotesRefresh] = useState(0);

  const analyzeFiling = (f: any) => {
    setAnalystInput({
      symbol,
      mode: "filing",
      filingUrl: f.url,
      filingLabel: `${f.form} • ${f.date}`,
    });
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

  const load = async () => {
    setLoading(true); setNote(null);
    const { data } = await supabase.functions.invoke("sec-edgar", { body: { symbol, kind: "filings" } });
    setItems(data?.items ?? []); setNote(data?.note ?? null);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="SEC Filings | Vela.ai" description="10-K, 10-Q, 8-K, 13F filings from SEC EDGAR" path="/filings" />
      <TopNav />
      <main className="container mx-auto px-4 py-5 sm:px-6 sm:py-8 space-y-4 sm:space-y-6 min-w-0">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold">{t("pages.filings.title")}</h1>
        </div>
        <p className="text-muted-foreground">{t("pages.filings.subtitle")}</p>
        <div className="flex gap-2 max-w-md items-end">
          <div className="flex-1"><TickerSearch value={symbol} onValueChange={setSymbol} onSelect={(hit) => setSymbol(hit.symbol.toUpperCase())} placeholder="Search instrument" /></div>
          <Button onClick={load} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("pages.filings.load")}</Button>
        </div>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
        {items.length > 0 && (
          <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1 [-webkit-overflow-scrolling:touch] md:max-h-none md:overflow-visible md:pr-0">
            {items.map((f, i) => (
              <Card key={i} className="min-w-0">
                <CardContent className="p-3 sm:p-4 flex flex-wrap items-center gap-x-3 gap-y-2 justify-between min-w-0">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <Badge variant="secondary" className="shrink-0">{f.form}</Badge>
                    <span className="font-mono text-xs sm:text-sm shrink-0">{f.date}</span>
                    <span className="text-xs sm:text-sm text-muted-foreground truncate">{f.accession}</span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {['10-K','10-Q','8-K','20-F','6-K'].includes(f.form) && (
                      <Button size="sm" onClick={() => analyzeFiling(f)}>
                        <Sparkles className="h-3 w-3 mr-1" /> AI Analyze
                      </Button>
                    )}
                    <Button asChild variant="outline" size="sm"><a href={f.url} target="_blank" rel="noreferrer">Open <ExternalLink className="h-3 w-3 ml-1" /></a></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <SavedResearchNotes symbol={symbol} onReopen={reopenNote} refreshKey={notesRefresh} />
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