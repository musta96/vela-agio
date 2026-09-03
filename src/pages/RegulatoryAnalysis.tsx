import { useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, BookOpen, Loader2, Scale, Sparkles } from "lucide-react";

type Report = { headline: string; executiveSummary: string; affectedAssets: { asset: string; direction: string; rationale: string }[]; impacts: { dimension: string; severity: string; assessment: string; timeframe: string }[]; scenarios: { name: string; probability: string; outcome: string }[]; assumptions: string[]; confidence: string; sources: { title: string; url: string; relevance: string }[] };

export default function RegulatoryAnalysis() {
  const [focus, setFocus] = useState("European banks and insurers");
  const [jurisdiction, setJurisdiction] = useState("European Union");
  const [topic, setTopic] = useState("Capital requirements and climate-risk disclosure");
  const [horizon, setHorizon] = useState("12–36 months");
  const [stance, setStance] = useState("base");
  const [context, setContext] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);

  const analyze = async () => {
    setLoading(true); setError(null); setReport(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("regulatory-analysis", { body: { focus, jurisdiction, topic, horizon, stance, context } });
      if (invokeError) {
        const status = (invokeError as any).context?.status;
        throw Object.assign(new Error((data as any)?.message ?? invokeError.message), { status });
      }
      if (!data?.report) throw new Error(data?.message ?? "No regulatory report was returned.");
      setReport(data.report);
    } catch (e) {
      const status = (e as any)?.status;
      setError({ message: e instanceof Error ? e.message : "Regulatory analysis failed.", retryable: status === 429 || status >= 500 });
    } finally { setLoading(false); }
  };

  return <div className="min-h-screen bg-background"><SEO title="Predictive Regulatory Analysis | Vela.ai" description="Assess potential regulatory impacts on sectors, companies, and instruments." path="/regulatory-analysis" /><TopNav /><main className="container mx-auto space-y-6 px-6 py-8"><div><div className="flex items-center gap-3"><Scale className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Predictive Regulatory Analysis</h1></div><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Model how proposed rules and regulatory trends could affect investment exposures. This is scenario research, not legal advice or a prediction of policy outcomes.</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Define the policy scenario</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="reg-focus">Company, sector, or instruments</Label><Input id="reg-focus" value={focus} onChange={(e) => setFocus(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="reg-jurisdiction">Jurisdiction</Label><Input id="reg-jurisdiction" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} /></div><div className="space-y-2 md:col-span-2"><Label htmlFor="reg-topic">Proposed rule or regulatory trend</Label><Textarea id="reg-topic" value={topic} onChange={(e) => setTopic(e.target.value)} /></div><div className="space-y-2"><Label>Time horizon</Label><Select value={horizon} onValueChange={setHorizon}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="6–12 months">6–12 months</SelectItem><SelectItem value="12–36 months">12–36 months</SelectItem><SelectItem value="3–5 years">3–5 years</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Scenario stance</Label><Select value={stance} onValueChange={setStance}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="base">Base case</SelectItem><SelectItem value="upside">Favourable implementation</SelectItem><SelectItem value="downside">Adverse implementation</SelectItem></SelectContent></Select></div><div className="space-y-2 md:col-span-2"><Label htmlFor="reg-context">Portfolio context (optional)</Label><Textarea id="reg-context" value={context} onChange={(e) => setContext(e.target.value)} placeholder="Exposure, thesis, or known dependencies" /></div><div className="md:col-span-2 flex justify-end"><Button onClick={analyze} disabled={loading || !focus.trim() || !topic.trim()} className="gap-2">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{loading ? "Analysing…" : "Analyse regulatory impact"}</Button></div></CardContent></Card>
    {error && <div role="alert" className="flex items-start gap-3 border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p>{error.message}</p>{error.retryable && <p className="mt-1 text-xs">This may be temporary. Retry manually when ready; terminal validation, access, and credit errors are not retried automatically.</p>}</div></div>}
    {report && <div className="space-y-4"><Card><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle>{report.headline}</CardTitle><p className="mt-2 text-sm text-muted-foreground">{report.executiveSummary}</p></div><Badge variant="outline">Confidence: {report.confidence}</Badge></CardHeader></Card><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Exposure map</CardTitle></CardHeader><CardContent className="space-y-3">{report.affectedAssets.map((a) => <div key={a.asset} className="border-b border-border/60 pb-3 last:border-0"><div className="flex justify-between gap-3"><span className="font-medium">{a.asset}</span><Badge variant={a.direction === "positive" ? "default" : "secondary"}>{a.direction}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{a.rationale}</p></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Impact channels</CardTitle></CardHeader><CardContent className="space-y-3">{report.impacts.map((i) => <div key={i.dimension} className="border-b border-border/60 pb-3 last:border-0"><div className="flex justify-between gap-3"><span className="font-medium capitalize">{i.dimension}</span><span className="text-xs uppercase text-muted-foreground">{i.severity} · {i.timeframe}</span></div><p className="mt-1 text-sm text-muted-foreground">{i.assessment}</p></div>)}</CardContent></Card></div><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Implementation scenarios</CardTitle></CardHeader><CardContent className="space-y-3">{report.scenarios.map((s) => <div key={s.name} className="border-b border-border/60 pb-3 last:border-0"><div className="flex justify-between gap-3 font-medium"><span>{s.name}</span><span className="text-xs text-muted-foreground">{s.probability}</span></div><p className="mt-1 text-sm text-muted-foreground">{s.outcome}</p></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Assumptions & sources</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><ul className="list-disc space-y-1 pl-5 text-muted-foreground">{report.assumptions.map((a) => <li key={a}>{a}</li>)}</ul><div className="border-t pt-3">{report.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="mb-2 flex items-start gap-2 text-primary hover:underline"><BookOpen className="mt-0.5 h-4 w-4 shrink-0" /><span>{s.title}<span className="block text-xs text-muted-foreground">{s.relevance}</span></span></a>)}</div></CardContent></Card></div><p className="text-xs text-muted-foreground">Regulatory analysis is forward-looking scenario research. Verify proposals, effective dates, applicability, and legal interpretation with primary sources and qualified counsel.</p></div>}
  </main></div>;
}
