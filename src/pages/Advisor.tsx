import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { AiDisclaimerStrip } from "@/components/AiDisclaimerStrip";
import { useAuth } from "@/hooks/useAuth";
import { useFlag } from "@/hooks/useFeatureFlags";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Sparkles, TrendingDown, TrendingUp, AlertTriangle, CloudSun, Scale, Newspaper, Target, RefreshCw, Info } from "lucide-react";
import { Navigate, Link } from "react-router-dom";

type SellSignal = {
  symbol: string;
  action: "sell_all" | "trim" | "hold" | "add";
  trim_pct?: number;
  urgency?: "high" | "medium" | "low";
  target_price?: number;
  stop_price?: number;
  rationale: string;
  catalysts?: string[];
};
type Improvement = { title: string; type: string; detail: string; suggested_trades?: string[] };
type AdvisorResp = {
  sell_signals?: SellSignal[];
  improvements?: Improvement[];
  macro_context?: { politics?: string; regulation?: string; weather?: string };
  portfolio_summary?: { concentration_risk?: string; sector_tilt?: string; goal_fit?: string };
  disclaimer?: string;
  _meta?: { weather: string | null; positions: number; totalValue: number };
  error?: string;
};

const ACTION_STYLE: Record<string, string> = {
  sell_all: "bg-destructive/15 text-destructive border-destructive/30",
  trim: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  hold: "bg-muted text-muted-foreground border-border",
  add: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
};
const URGENCY: Record<string, string> = {
  high: "bg-destructive text-destructive-foreground",
  medium: "bg-amber-500 text-white",
  low: "bg-muted text-muted-foreground",
};

export default function Advisor() {
  const enabled = useFlag("advisor", true);
  const { user, loading: authLoading } = useAuth();
  const [riskProfile, setRiskProfile] = useState("balanced");
  const [goals, setGoals] = useState("Retire in 20 years, prefer income, avoid 30%+ drawdowns.");
  const [weatherCity, setWeatherCity] = useState("");
  const [holdings, setHoldings] = useState<any[]>([]);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [result, setResult] = useState<AdvisorResp | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!user) { setLoadingHoldings(false); return; }
    supabase.from("portfolio_holdings").select("symbol, name, shares, avg_price").eq("user_id", user.id)
      .then(({ data }) => { setHoldings(data ?? []); setLoadingHoldings(false); });
  }, [user]);

  if (!enabled) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <div className="container mx-auto p-6 text-center text-muted-foreground">This feature is currently disabled by the admin.</div>
      </div>
    );
  }
  if (authLoading) return <div className="min-h-screen bg-background"><TopNav /></div>;
  if (!user) return <Navigate to="/auth" replace />;

  const run = async () => {
    if (!holdings.length) { toast.error("Add some holdings to your portfolio first"); return; }
    setRunning(true); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("advisor", {
        body: { holdings, goals: { description: goals }, riskProfile, weatherCity: weatherCity || undefined, lang: "en" },
      });
      if (error) throw error;
      if (data?.error === "rate_limited") { toast.error("Rate limited. Try again in a moment."); return; }
      if (data?.error === "credits_exhausted") { toast.error("AI credits exhausted. Add credits in workspace."); return; }
      setResult(data);
    } catch (e: any) {
      toast.error(e?.message ?? "Advisor failed");
    } finally { setRunning(false); }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Portfolio Coach — Educational Research" description="Educational analysis of your portfolio: concentration, valuation, news, and ideas to research further. Not investment advice." path="/advisor" />
      <TopNav />
      <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-6xl">
        <PageHeader
          icon={Sparkles}
          title="Portfolio Coach"
          description="Educational research on your portfolio: ideas to consider around concentration, valuation, news, regulation, and optional weather signals."
        />
        <AiDisclaimerStrip variant="ai" />

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Your context</CardTitle>
            <CardDescription>The coach uses these inputs together with your live holdings ({loadingHoldings ? "…" : holdings.length}).</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Risk profile</label>
              <Select value={riskProfile} onValueChange={setRiskProfile}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">Conservative</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="growth">Growth</SelectItem>
                  <SelectItem value="aggressive">Aggressive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><CloudSun className="h-3 w-3" /> Weather city (optional)</label>
              <Input placeholder="e.g. Milan, Iowa City, Mumbai…" value={weatherCity} onChange={e => setWeatherCity(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Used for agri / utility / insurance / tourism exposure.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" /> Goals & constraints</label>
              <Textarea rows={3} value={goals} onChange={e => setGoals(e.target.value)} placeholder="e.g. Retire in 15 years, max 20% drawdown, ESG screen, need income…" />
            </div>
            <div className="sm:col-span-2 flex flex-wrap gap-2 items-center">
              <Button onClick={run} disabled={running || loadingHoldings || !holdings.length} className="gap-2">
                {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {running ? "Analyzing…" : "Run analysis"}
              </Button>
              {!loadingHoldings && !holdings.length && (
                <span className="text-xs text-muted-foreground">No holdings yet — <Link to="/portfolio" className="text-primary underline">add some</Link> to get started.</span>
              )}
            </div>
          </CardContent>
        </Card>

        {running && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {result && (
          <>
            {result.portfolio_summary && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Scale className="h-4 w-4 text-primary" /> Portfolio summary</CardTitle></CardHeader>
                <CardContent className="grid sm:grid-cols-3 gap-3 text-sm">
                  <Block label="Concentration risk" value={result.portfolio_summary.concentration_risk} />
                  <Block label="Sector tilt" value={result.portfolio_summary.sector_tilt} />
                  <Block label="Goal fit" value={result.portfolio_summary.goal_fit} />
                </CardContent>
              </Card>
            )}

            <Tabs defaultValue="sell" className="space-y-3">
              <TabsList>
                <TabsTrigger value="sell" className="gap-1.5"><TrendingDown className="h-3.5 w-3.5" /> Sell signals ({result.sell_signals?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="improve" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Improvements ({result.improvements?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="macro" className="gap-1.5"><Newspaper className="h-3.5 w-3.5" /> Macro context</TabsTrigger>
              </TabsList>

              <TabsContent value="sell" className="space-y-3">
                {(result.sell_signals ?? []).map((s, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Link to={`/stock/${s.symbol}`} className="font-bold text-base hover:text-primary">{s.symbol}</Link>
                          <Badge variant="outline" className={ACTION_STYLE[s.action] ?? ""}>
                            {s.action.replace("_", " ")}
                            {s.action === "trim" && s.trim_pct != null ? ` ${s.trim_pct}%` : ""}
                          </Badge>
                          {s.urgency && <Badge className={URGENCY[s.urgency]}>{s.urgency}</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground flex gap-3">
                          {s.target_price != null && <span>Target: <b className="text-foreground">{s.target_price}</b></span>}
                          {s.stop_price != null && <span>Stop: <b className="text-foreground">{s.stop_price}</b></span>}
                        </div>
                      </div>
                      <p className="text-sm">{s.rationale}</p>
                      {!!s.catalysts?.length && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {s.catalysts.map((c, j) => <Badge key={j} variant="secondary" className="text-[10px]">{c}</Badge>)}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {!result.sell_signals?.length && <EmptyMsg msg="No sell signals — your portfolio looks fine for now." />}
              </TabsContent>

              <TabsContent value="improve" className="space-y-3">
                {(result.improvements ?? []).map((m, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{m.title}</span>
                        <Badge variant="outline" className="text-[10px]">{m.type}</Badge>
                      </div>
                      <p className="text-sm">{m.detail}</p>
                      {!!m.suggested_trades?.length && (
                        <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                          {m.suggested_trades.map((t, j) => <li key={j}>{t}</li>)}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {!result.improvements?.length && <EmptyMsg msg="No improvements suggested." />}
              </TabsContent>

              <TabsContent value="macro" className="space-y-3">
                <ContextCard icon={<AlertTriangle className="h-4 w-4 text-primary" />} title="Politics & geopolitics" body={result.macro_context?.politics} />
                <ContextCard icon={<Scale className="h-4 w-4 text-primary" />} title="Regulation (planned & passed)" body={result.macro_context?.regulation} />
                <ContextCard icon={<CloudSun className="h-4 w-4 text-primary" />} title={`Weather signals${result._meta?.weather ? ` — ${result._meta.weather}` : ""}`} body={result.macro_context?.weather} />
              </TabsContent>
            </Tabs>

            {result.disclaimer && (
              <p className="text-xs text-muted-foreground flex items-start gap-1.5 pt-2 border-t">
                <Info className="h-3 w-3 mt-0.5 shrink-0" /> {result.disclaimer}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Block({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-md border border-border p-3 bg-card/40">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm mt-1">{value ?? "—"}</div>
    </div>
  );
}
function ContextCard({ icon, title, body }: { icon: React.ReactNode; title: string; body?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-2 font-medium mb-1">{icon}{title}</div>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{body || "—"}</p>
    </CardContent></Card>
  );
}
function EmptyMsg({ msg }: { msg: string }) {
  return <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{msg}</CardContent></Card>;
}