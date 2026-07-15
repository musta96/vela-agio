import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CalendarDays, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AIEquityAnalystDialog, type AnalystInput } from "@/components/research/AIEquityAnalystDialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export default function Earnings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [analystOpen, setAnalystOpen] = useState(false);
  const [analystInput, setAnalystInput] = useState<AnalystInput | null>(null);
  const [callSymbol, setCallSymbol] = useState("AAPL");
  const [callTranscript, setCallTranscript] = useState("");

  const analyzeCall = () => {
    if (!callTranscript.trim() || !callSymbol.trim()) return;
    setAnalystInput({ symbol: callSymbol.toUpperCase(), mode: "transcript", transcript: callTranscript });
    setAnalystOpen(true);
  };



  useEffect(() => {
    (async () => {
      setLoading(true);
      let symbols: string[] = ["AAPL", "MSFT", "ENI.MI", "ISP.MI", "STLA.MI"];
      if (user) {
        const { data: wl } = await supabase.from("watchlist_items").select("symbol").eq("user_id", user.id);
        if (wl?.length) symbols = wl.map(w => w.symbol);
      }
      const { data } = await supabase.functions.invoke("earnings-calendar", { body: { symbols } });
      setEvents(data?.events ?? []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Earnings Calendar | Vela.ai" description="Upcoming earnings, consensus, surprise history" path="/earnings" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><CalendarDays className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">{t("pages.earnings.title")}</h1></div>
        {loading && <Loader2 className="h-6 w-6 animate-spin" />}
        <div className="grid md:grid-cols-2 gap-4">
          {events.map(e => (
            <Card key={e.symbol}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{e.symbol}</span>
                  {e.nextDate && <Badge>{e.nextDate}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {e.epsEstimate != null && <div>{t("pages.earnings.epsEstimate")}: <span className="font-mono">{e.epsEstimate?.toFixed(2)}</span></div>}
                {e.growth != null && <div>{t("pages.earnings.yoyGrowth")}: <span className="font-mono">{(e.growth * 100).toFixed(1)}%</span></div>}
                {e.history?.length > 0 && (
                  <div className="pt-2 border-t mt-2">
                    <div className="text-xs text-muted-foreground mb-1">{t("pages.earnings.recentSurprises")}</div>
                    {e.history.slice(0, 4).map((h: any, i: number) => (
                      <div key={i} className="flex justify-between font-mono text-xs">
                        <span>{h.period}</span>
                        <span className={h.surprisePct > 0 ? "text-bull" : "text-bear"}>{h.surprisePct != null ? `${(h.surprisePct * 100).toFixed(1)}%` : "-"}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => { setCallSymbol(e.symbol); document.getElementById('ai-call-summarizer')?.scrollIntoView({ behavior: 'smooth' }); }}>
                  <Sparkles className="h-3 w-3 mr-1" /> Summarize call with AI
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card id="ai-call-summarizer" className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> AI Earnings Call Summarizer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste an earnings call transcript. The AI equity research analyst extracts key metrics, guidance direction, risks, management tone, notable quotes, and drafts a research note.
            </p>
            <div className="grid md:grid-cols-4 gap-2">
              <Input value={callSymbol} onChange={(e) => setCallSymbol(e.target.value.toUpperCase())} placeholder="Ticker (e.g. AAPL)" />
              <div className="md:col-span-3" />
            </div>
            <Textarea
              value={callTranscript}
              onChange={(e) => setCallTranscript(e.target.value)}
              placeholder="Paste the full transcript here…"
              className="min-h-[220px] font-mono text-xs"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{callTranscript.length.toLocaleString()} characters</span>
              <Button onClick={analyzeCall} disabled={!callTranscript.trim() || !callSymbol.trim()}>
                <Sparkles className="h-4 w-4 mr-2" /> Generate research note
              </Button>
            </div>
          </CardContent>
        </Card>

        <AIEquityAnalystDialog open={analystOpen} onOpenChange={setAnalystOpen} input={analystInput} />
      </main>
    </div>
  );
}