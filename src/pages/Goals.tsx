import { useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Target, Save, Loader2, Check, FileDown, Eye, Download, History } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { generateGoalsPlanReport, buildGoalsPlanFilename } from "@/lib/pdfReports";
import { MonteCarloHistogram } from "@/components/MonteCarloHistogram";
import { quantile } from "@/lib/quantScenarios";

function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function monteCarlo(initial: number, monthlyAdd: number, years: number, mean: number, stdev: number, trials = 1000) {
  const months = years * 12; const mu = mean / 12; const sd = stdev / Math.sqrt(12);
  const finals: number[] = []; const p10: number[] = []; const p50: number[] = []; const p90: number[] = [];
  const paths: number[][] = Array.from({ length: trials }, () => [initial]);
  for (let t = 1; t <= months; t++) {
    for (let i = 0; i < trials; i++) {
      const r = mu + sd * randn();
      paths[i].push(paths[i][t - 1] * (1 + r) + monthlyAdd);
    }
    const col = paths.map(p => p[t]).sort((a, b) => a - b);
    p10.push(col[Math.floor(trials * 0.1)]); p50.push(col[Math.floor(trials * 0.5)]); p90.push(col[Math.floor(trials * 0.9)]);
  }
  for (let i = 0; i < trials; i++) finals.push(paths[i][months]);
  return { p10, p50, p90, finals };
}

export default function Goals() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [goalId, setGoalId] = useState<string | null>(null);
  const [name, setName] = useState("My goal");
  const [initial, setInitial] = useState(20000);
  const [monthly, setMonthly] = useState(500);
  const [years, setYears] = useState(25);
  const [target, setTarget] = useState(500000);
  const [mean, setMean] = useState(0.07);
  const [sd, setSd] = useState(0.15);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [includeAssumptions, setIncludeAssumptions] = useState(true);
  const [includeProbTable, setIncludeProbTable] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string>("");
  const [history, setHistory] = useState<Array<{ id: string; created_at: string; filename: string | null; params: any }>>([]);

  // Load the user's most recent saved plan on mount.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("financial_goals")
      .select("id, name, initial, monthly, years, target, expected_return, volatility")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setGoalId(data.id);
        setName(data.name ?? "My goal");
        setInitial(Number(data.initial) || 0);
        setMonthly(Number(data.monthly) || 0);
        setYears(Number(data.years) || 25);
        setTarget(Number(data.target) || 0);
        setMean(Number(data.expected_return) || 0.07);
        setSd(Number(data.volatility) || 0.15);
      });
  }, [user?.id]);

  // Load export history
  const loadHistory = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("pdf_export_log")
      .select("id, created_at, filename, params")
      .eq("user_id", user.id)
      .eq("report_type", "goals_plan")
      .order("created_at", { ascending: false })
      .limit(10);
    setHistory((data as any) ?? []);
  };
  useEffect(() => { loadHistory(); }, [user?.id]);

  const save = async () => {
    if (!user) {
      toast.error("Sign in to save your plan");
      return;
    }
    setSaving(true);
    try {
      const row = {
        user_id: user.id,
        name,
        initial,
        monthly,
        years,
        target,
        expected_return: mean,
        volatility: sd,
      };
      if (goalId) {
        const { error } = await supabase.from("financial_goals").update(row).eq("id", goalId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("financial_goals").insert(row).select("id").single();
        if (error) throw error;
        setGoalId(data.id);
      }
      setSavedAt(Date.now());
      toast.success("Plan saved");
    } catch (e) {
      toast.error("Could not save", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const sim = useMemo(() => monteCarlo(initial, monthly, years, mean, sd, 800), [initial, monthly, years, mean, sd]);
  const successProb = useMemo(() => sim.finals.filter(v => v >= target).length / sim.finals.length, [sim, target]);
  const data = sim.p50.map((m, i) => ({ year: ((i + 1) / 12).toFixed(1), p10: sim.p10[i], median: m, p90: sim.p90[i] }));

  // Bear / bull alternate regimes for resilience comparison
  const bearSim = useMemo(() => monteCarlo(initial, monthly, years, Math.max(-0.05, mean - 0.03), sd + 0.05, 500), [initial, monthly, years, mean, sd]);
  const bullSim = useMemo(() => monteCarlo(initial, monthly, years, mean + 0.02, Math.max(0.05, sd - 0.03), 500), [initial, monthly, years, mean, sd]);
  const bearProb = useMemo(() => bearSim.finals.filter(v => v >= target).length / bearSim.finals.length, [bearSim, target]);
  const bullProb = useMemo(() => bullSim.finals.filter(v => v >= target).length / bullSim.finals.length, [bullSim, target]);
  const baseStats = useMemo(() => ({
    p05: quantile(sim.finals, 0.05),
    p50: quantile(sim.finals, 0.50),
    p95: quantile(sim.finals, 0.95),
    cvar5: (() => {
      const sorted = [...sim.finals].sort((a, b) => a - b);
      const cut = Math.max(1, Math.floor(sorted.length * 0.05));
      return sorted.slice(0, cut).reduce((s, x) => s + x, 0) / cut;
    })(),
  }), [sim]);

  const buildPdfInput = () => ({
    name, initial, monthly, years, target,
    expectedReturn: mean, volatility: sd, successProb,
    paths: { p10: sim.p10, median: sim.p50, p90: sim.p90 },
  });

  const logExport = async (filename: string, action: "preview" | "download") => {
    if (!user) return;
    await supabase.from("pdf_export_log").insert({
      user_id: user.id,
      report_type: "goals_plan",
      filename,
      params: { name, initial, monthly, years, target, expectedReturn: mean, volatility: sd, includeAssumptions, includeProbTable, action },
    });
    loadHistory();
  };

  const openPreview = () => {
    try {
      const filename = buildGoalsPlanFilename(name);
      const { blobUrl } = generateGoalsPlanReport(buildPdfInput(), {
        includeAssumptions, includeProbabilityTable: includeProbTable, mode: "blob", filename,
      });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(blobUrl ?? null);
      setPreviewFilename(filename);
      setPreviewOpen(true);
      logExport(filename, "preview");
    } catch (e) {
      toast.error("Could not generate preview", { description: (e as Error).message });
    }
  };

  const download = () => {
    try {
      const { filename } = generateGoalsPlanReport(buildPdfInput(), {
        includeAssumptions, includeProbabilityTable: includeProbTable,
      });
      logExport(filename, "download");
    } catch (e) {
      toast.error("Could not export PDF", { description: (e as Error).message });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Goal Planner | Vela.ai" description="Monte Carlo retirement & life-goal planner" path="/goals" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Target className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">{t("pages.goals.title")}</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={save} disabled={saving || !user} size="sm" className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : savedAt && Date.now() - savedAt < 4000 ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {goalId ? "Update plan" : "Save plan"}
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={openPreview}>
              <Eye className="h-4 w-4" /> Preview PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={download}>
              <FileDown className="h-4 w-4" /> Export PDF
            </Button>
          </div>
        </div>

        {/* PDF options */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">PDF options</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2"><Switch checked={includeAssumptions} onCheckedChange={setIncludeAssumptions} /> Include assumptions table</label>
            <label className="flex items-center gap-2"><Switch checked={includeProbTable} onCheckedChange={setIncludeProbTable} /> Include year-by-year probability table</label>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-3 gap-4">
          <Card><CardContent className="p-4 space-y-3">
            <div><Label>Plan name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div><Label>{t("pages.goals.initial")}</Label><Input type="number" value={initial} onChange={e => setInitial(+e.target.value)} /></div>
            <div><Label>{t("pages.goals.monthly")}</Label><Input type="number" value={monthly} onChange={e => setMonthly(+e.target.value)} /></div>
            <div><Label>{t("pages.goals.horizon")}</Label><Input type="number" value={years} onChange={e => setYears(+e.target.value)} /></div>
            <div><Label>{t("pages.goals.target")}</Label><Input type="number" value={target} onChange={e => setTarget(+e.target.value)} /></div>
            <div><Label>{t("pages.goals.expectedReturn")}</Label><Input type="number" step="0.01" value={mean} onChange={e => setMean(+e.target.value)} /></div>
            <div><Label>{t("pages.goals.volatility")}</Label><Input type="number" step="0.01" value={sd} onChange={e => setSd(+e.target.value)} /></div>
          </CardContent></Card>
          <Card className="md:col-span-2"><CardHeader><CardTitle>{t("pages.goals.successProb")}: <span className={successProb >= 0.7 ? "text-bull" : successProb >= 0.4 ? "text-yellow-500" : "text-bear"}>{(successProb * 100).toFixed(0)}%</span></CardTitle></CardHeader><CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="year" /><YAxis tickFormatter={v => `€${(v/1000).toFixed(0)}k`} /><Tooltip formatter={(v: number) => `€${v.toFixed(0)}`} />
                <Line dataKey="p10" stroke="hsl(var(--bear))" dot={false} name="10th pct" />
                <Line dataKey="median" stroke="hsl(var(--primary))" dot={false} name="Median" />
                <Line dataKey="p90" stroke="hsl(var(--bull))" dot={false} name="90th pct" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </div>

        {/* Distribution + macro regime comparison */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="md:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-base">Final value distribution</CardTitle></CardHeader>
            <CardContent>
              <MonteCarloHistogram values={sim.finals} target={target} unit="€" height={260} />
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <DistStat label="P5 (worst 5%)" value={baseStats.p05} tone="bad" />
                <DistStat label="CVaR 5%" value={baseStats.cvar5} tone="bad" hint="Avg of worst 5% of paths" />
                <DistStat label="Median" value={baseStats.p50} />
                <DistStat label="P95 (best 5%)" value={baseStats.p95} tone="good" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Regime resilience</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <RegimeRow label="Bear regime" sub={`μ ${((mean - 0.03) * 100).toFixed(1)}% · σ ${((sd + 0.05) * 100).toFixed(1)}%`} prob={bearProb} tone="bad" />
              <RegimeRow label="Base case" sub={`μ ${(mean * 100).toFixed(1)}% · σ ${(sd * 100).toFixed(1)}%`} prob={successProb} />
              <RegimeRow label="Bull regime" sub={`μ ${((mean + 0.02) * 100).toFixed(1)}% · σ ${(Math.max(0.05, sd - 0.03)) * 100}%`.replace(/(\.\d)\d+%$/, "$1%")} prob={bullProb} tone="good" />
              <p className="text-xs text-muted-foreground pt-2 border-t border-border/40">
                Stress your plan against alternate market regimes — bear assumes lower drift &amp; higher vol, bull assumes the opposite.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Export history */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4" /> Export history</CardTitle></CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-xs text-muted-foreground">No exports yet.</div>
            ) : (
              <div className="divide-y text-sm">
                {history.map((h) => (
                  <div key={h.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{h.filename ?? "goal-plan.pdf"}</div>
                      <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()} · {h.params?.action ?? "download"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">{t("pages.goals.trials")} {t("common.notFinancialAdvice")}</p>

        <Dialog open={previewOpen} onOpenChange={(o) => { setPreviewOpen(o); if (!o && previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}>
          <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle className="text-base">Preview · {previewFilename}</DialogTitle></DialogHeader>
            {previewUrl ? (
              <iframe title="Goals PDF preview" src={previewUrl} className="w-full h-[70vh] rounded border" />
            ) : (
              <div className="text-sm text-muted-foreground">Generating…</div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
              <Button onClick={() => { download(); setPreviewOpen(false); }} className="gap-2"><Download className="h-4 w-4" /> Download</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}