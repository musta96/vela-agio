import { useState } from "react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, Trash2, FlaskConical, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PositionRow { symbol: string; weight: string; fx: string; ter: string; borrow: string }

const emptyRow = (): PositionRow => ({ symbol: "", weight: "", fx: "", ter: "", borrow: "" });

const pct = (v: number | undefined | null, digits = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits)}%`;
/** Engine metrics are already expressed in percent. */
const pctRaw = (v: number | undefined | null, digits = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)}%`;
const money = (v: number | undefined | null) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function FullAnalysis() {
  const [rows, setRows] = useState<PositionRow[]>([
    { symbol: "SWDA.MI", weight: "60", fx: "", ter: "0.002", borrow: "" },
    { symbol: "AGGH.MI", weight: "30", fx: "", ter: "0.001", borrow: "" },
    { symbol: "SGLD.MI", weight: "10", fx: "", ter: "0.0012", borrow: "" },
  ]);
  const [objective, setObjective] = useState("Long-term real capital growth with a drawdown ceiling of 30%.");
  const [horizon, setHorizon] = useState("10");
  const [capital, setCapital] = useState("100000");
  const [topics, setTopics] = useState("global macro outlook policy rates inflation 2026\nEU regulation affecting the holdings");
  const [method, setMethod] = useState("block");
  const [taxRate, setTaxRate] = useState("26");

  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, key: keyof PositionRow, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: v } : row)));

  async function run() {
    const positions = rows
      .filter((r) => r.symbol.trim() && Number(r.weight))
      .map((r) => ({
        symbol: r.symbol.trim().toUpperCase(),
        weight: Number(r.weight) / 100,
        fx: r.fx.trim() || undefined,
        ter: r.ter ? Number(r.ter) : undefined,
        borrow_rate: r.borrow ? Number(r.borrow) / 100 : undefined,
      }));
    if (!positions.length) {
      toast.error("Add at least one position with a weight.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setPhase("Fetching evidence, reference data and histories…");
    const t = setTimeout(() => setPhase("Running simulations and synthesising the decision document…"), 12_000);
    try {
      const { data, error: err } = await supabase.functions.invoke("full-analysis", {
        body: {
          positions,
          objective,
          horizon_years: Number(horizon) || 10,
          initial_capital: Number(capital) || 100_000,
          research_topics: topics.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 4),
          method,
          tax_rate: Number(taxRate) / 100 || 0,
        },
      });
      if (err) throw err;
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The analysis run failed.");
    } finally {
      clearTimeout(t);
      setPhase(null);
      setLoading(false);
    }
  }

  const report = result?.report ?? {};
  const sim = result?.simulation;

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO
        title="Full Analysis Workbench | Vela.ai"
        description="One orchestrated institutional run: official-source research, instrument validation, valuation, advanced simulation and a structured decision framework."
        path="/full-analysis"
      />
      <PageHeader
        icon={FlaskConical}
        title="Full Analysis"
        description="Live source research, instrument master validation, valuation, frictions-aware simulation and a decision document — in a single run."
      />

      <div className="grid xl:grid-cols-[380px_1fr] gap-6 items-start">
        <Card className="p-5 rounded-2xl space-y-4">
          <div className="space-y-2">
            <Label>Objective / mandate</Label>
            <Textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={3} />
          </div>

          <div className="space-y-2">
            <Label>Book</Label>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_70px_32px] gap-2 items-center">
                  <Input placeholder="Ticker" value={r.symbol} onChange={(e) => update(i, "symbol", e.target.value)} />
                  <Input placeholder="w %" value={r.weight} onChange={(e) => update(i, "weight", e.target.value)} />
                  <Input placeholder="TER" value={r.ter} onChange={(e) => update(i, "ter", e.target.value)} />
                  <Button variant="ghost" size="icon" aria-label="Remove position"
                    onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setRows((r) => [...r, emptyRow()])}>
              <Plus className="h-4 w-4" /> Add position
            </Button>
            <p className="text-xs text-muted-foreground">Negative weights are treated as short exposure (borrow cost and margin mechanics apply).</p>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Horizon (years)</Label>
              <Input value={horizon} onChange={(e) => setHorizon(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Capital</Label>
              <Input value={capital} onChange={(e) => setCapital(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Return model</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Block bootstrap</SelectItem>
                  <SelectItem value="bootstrap">IID bootstrap</SelectItem>
                  <SelectItem value="student_t">Student-t (fat tails)</SelectItem>
                  <SelectItem value="gbm">Lognormal (GBM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tax on gains %</Label>
              <Input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Evidence questions (one per line)</Label>
            <Textarea value={topics} onChange={(e) => setTopics(e.target.value)} rows={3} />
          </div>

          <Button className="w-full gap-2" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            {loading ? "Running…" : "Run full analysis"}
          </Button>
          {phase && <p className="text-xs text-muted-foreground text-center">{phase}</p>}
        </Card>

        <div className="space-y-4 min-w-0">
          {error && (
            <Card className="p-5 rounded-2xl border-destructive/40">
              <p className="text-sm font-medium text-destructive">The run failed</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={run}>Retry</Button>
            </Card>
          )}

          {!result && !error && !loading && (
            <Card className="p-8 rounded-2xl text-center text-sm text-muted-foreground">
              Configure the book on the left and run the analysis. The assistant can also run this for you — ask it for a full analysis of a portfolio.
            </Card>
          )}

          {result && (
            <Tabs defaultValue="report">
              <TabsList>
                <TabsTrigger value="report">Decision document</TabsTrigger>
                <TabsTrigger value="simulation">Simulation</TabsTrigger>
                <TabsTrigger value="instruments">Instruments</TabsTrigger>
                <TabsTrigger value="sources">Sources</TabsTrigger>
              </TabsList>

              <TabsContent value="report" className="space-y-4 mt-4">
                <Card className="p-5 rounded-2xl">
                  <h2 className="text-sm font-semibold mb-2">Executive summary</h2>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.executive_summary ?? "—"}</p>
                </Card>

                {Array.isArray(report.security_analysis) && report.security_analysis.length > 0 && (
                  <Card className="p-5 rounded-2xl space-y-4">
                    <h2 className="text-sm font-semibold">Security analysis</h2>
                    {report.security_analysis.map((s: any, i: number) => (
                      <div key={i} className="rounded-xl border border-border p-4 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{s.symbol}</Badge>
                        </div>
                        <p className="text-sm">{s.thesis}</p>
                        {s.variant_view && <p className="text-xs text-muted-foreground"><strong>Variant view:</strong> {s.variant_view}</p>}
                        {s.valuation && <p className="text-xs text-muted-foreground"><strong>Valuation:</strong> {s.valuation}</p>}
                        {s.bear_base_bull && <p className="text-xs text-muted-foreground"><strong>Bear / base / bull:</strong> {s.bear_base_bull}</p>}
                        {Array.isArray(s.key_risks) && s.key_risks.length > 0 && (
                          <ul className="text-xs text-muted-foreground list-disc pl-4">
                            {s.key_risks.map((r: string, k: number) => <li key={k}>{r}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </Card>
                )}

                {report.portfolio_construction && (
                  <Card className="p-5 rounded-2xl space-y-2">
                    <h2 className="text-sm font-semibold">Portfolio construction</h2>
                    <p className="text-sm text-muted-foreground">{report.portfolio_construction.rationale}</p>
                    {Array.isArray(report.portfolio_construction.weights) && (
                      <div className="grid sm:grid-cols-2 gap-2 pt-2">
                        {report.portfolio_construction.weights.map((w: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-sm rounded-lg border border-border px-3 py-2">
                            <span className="font-medium">{w.symbol}</span>
                            <span className="text-muted-foreground">{typeof w.weight === "number" ? pct(w.weight > 1 ? w.weight / 100 : w.weight) : w.weight} · {w.role}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {report.portfolio_construction.cost_and_tax && (
                      <p className="text-xs text-muted-foreground pt-2">{report.portfolio_construction.cost_and_tax}</p>
                    )}
                  </Card>
                )}

                {Array.isArray(report.risks) && (
                  <Card className="p-5 rounded-2xl space-y-2">
                    <h2 className="text-sm font-semibold">Risks</h2>
                    {report.risks.map((r: any, i: number) => (
                      <div key={i} className="flex gap-3 text-sm border-b border-border last:border-0 py-2">
                        <Badge variant={r.severity === "high" ? "destructive" : r.severity === "medium" ? "default" : "secondary"}>
                          {r.severity}
                        </Badge>
                        <div>
                          <p>{r.risk}</p>
                          <p className="text-xs text-muted-foreground">{r.mitigation}</p>
                        </div>
                      </div>
                    ))}
                  </Card>
                )}

                {Array.isArray(report.scenarios) && (
                  <Card className="p-5 rounded-2xl space-y-2">
                    <h2 className="text-sm font-semibold">Scenarios</h2>
                    {report.scenarios.map((s: any, i: number) => (
                      <div key={i} className="border-b border-border last:border-0 py-2">
                        <p className="text-sm font-medium">{s.name} · {typeof s.probability === "number" ? `${Math.round(s.probability > 1 ? s.probability : s.probability * 100)}%` : "—"}</p>
                        <p className="text-xs text-muted-foreground">{s.drivers}</p>
                        <p className="text-xs">{s.portfolio_impact}</p>
                      </div>
                    ))}
                  </Card>
                )}

                {report.decision_framework && (
                  <Card className="p-5 rounded-2xl grid sm:grid-cols-2 gap-4">
                    {([
                      ["Buy conditions", report.decision_framework.buy_conditions],
                      ["Sizing rules", report.decision_framework.sizing_rules],
                      ["Exit & stop rules", report.decision_framework.exit_and_stop_rules],
                      ["Monitoring", report.decision_framework.monitoring],
                    ] as const).map(([label, items]) => (
                      <div key={label}>
                        <h3 className="text-sm font-semibold mb-1">{label}</h3>
                        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                          {(Array.isArray(items) ? items : []).map((it: string, i: number) => <li key={i}>{it}</li>)}
                        </ul>
                      </div>
                    ))}
                    {report.decision_framework.review_cadence && (
                      <p className="text-xs text-muted-foreground sm:col-span-2">Review cadence: {report.decision_framework.review_cadence}</p>
                    )}
                  </Card>
                )}

                {Array.isArray(report.evidence_gaps) && report.evidence_gaps.length > 0 && (
                  <Card className="p-5 rounded-2xl">
                    <h2 className="text-sm font-semibold mb-2">What could not be verified</h2>
                    <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                      {report.evidence_gaps.map((g: string, i: number) => <li key={i}>{g}</li>)}
                    </ul>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="simulation" className="mt-4">
                <Card className="p-5 rounded-2xl">
                  {sim ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {([
                          ["Median value", money(sim.medianValue)],
                          ["Median CAGR", pctRaw(sim.cagrMedian)],
                          ["Prob. of loss", pctRaw(sim.probLoss)],
                          ["CVaR 95%", pctRaw(sim.cvar95)],
                          ["VaR 95%", pctRaw(sim.var95)],
                          ["Max DD (p95)", pctRaw(sim.maxDrawdownP95)],
                          ["Liquidation prob.", pctRaw(sim.probLiquidation)],
                          ["Total costs", pctRaw(sim.totalCostsPct)],
                        ] as const).map(([label, value]) => (
                          <div key={label} className="rounded-xl border border-border p-3">
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className="text-sm font-semibold">{value}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">
                        {sim.paths?.toLocaleString()} paths · {sim.method}{sim.regimeSwitching ? " · regime switching" : ""} · {sim.historyDays} aligned trading days
                      </p>
                      {Array.isArray(sim.warnings) && sim.warnings.length > 0 && (
                        <ul className="text-xs text-muted-foreground list-disc pl-4 mt-2">
                          {sim.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No simulation output was returned for this run.</p>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="instruments" className="mt-4">
                <Card className="p-5 rounded-2xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3">Symbol</th><th className="pr-3">ISIN</th><th className="pr-3">Domicile</th>
                        <th className="pr-3">Ccy</th><th className="pr-3">TER</th><th className="pr-3">KID</th><th className="pr-3">US situs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.instruments ?? []).map((r: any) => (
                        <tr key={r.symbol} className="border-t border-border">
                          <td className="py-2 pr-3 font-medium">{r.symbol}</td>
                          <td className="pr-3">{r.isin ?? "—"}</td>
                          <td className="pr-3">{r.domicile ?? "—"}</td>
                          <td className="pr-3">{r.tradingCurrency ?? "—"}</td>
                          <td className="pr-3">{r.ter != null ? pct(r.ter, 2) : "—"}</td>
                          <td className="pr-3">{r.kidAvailable == null ? "—" : r.kidAvailable ? "Yes" : "No"}</td>
                          <td className="pr-3">{r.usSitusEstateTax == null ? "—" : r.usSitusEstateTax ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(result.unverified_instruments ?? []).length > 0 && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Unverified reference data (confirm on the factsheet/KID): {result.unverified_instruments.join(", ")}
                    </p>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="sources" className="mt-4">
                <Card className="p-5 rounded-2xl space-y-2">
                  {(result.sources ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">No external sources were retrieved for this run.</p>
                  )}
                  {(result.sources ?? []).map((s: any, i: number) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-start gap-2 text-sm hover:underline">
                      <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        {s.title || s.url}
                        <span className="text-xs text-muted-foreground"> · {s.domain}{s.primary_source ? " · primary source" : ""}</span>
                      </span>
                    </a>
                  ))}
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
