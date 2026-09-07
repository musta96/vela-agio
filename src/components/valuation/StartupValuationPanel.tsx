import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Rocket, Plus, Trash2, Download } from "lucide-react";
import jsPDF from "jspdf";
import { WebsiteEvidence } from "@/components/valuation/WebsiteEvidence";

const STAGES = [
  { id: "pre_seed", label: "Pre-seed" },
  { id: "seed", label: "Seed" },
  { id: "series_a", label: "Series A" },
  { id: "series_b", label: "Series B" },
  { id: "series_c", label: "Series C" },
  { id: "growth", label: "Growth / pre-IPO" },
];

const SECTORS = ["ai", "software", "saas", "fintech", "insurtech", "marketplace", "ecommerce", "consumer", "gaming",
  "healthtech", "biotech", "medtech", "deeptech", "semiconductors", "hardware", "robotics", "mobility", "energy",
  "climate", "agritech", "proptech", "logistics", "edtech", "cybersecurity", "space", "foodtech", "services", "other"];

const COUNTRIES = ["IT", "FR", "DE", "ES", "CH", "GB", "IE", "NL", "SE", "DK", "FI", "NO", "PL", "PT", "AT", "BE",
  "US", "CA", "AE", "SA", "IL", "TR", "EG", "IN", "SG", "JP", "KR", "CN", "AU", "BR", "MX", "AR", "ZA", "NG", "KE"];

const SCORECARD: Array<{ key: string; label: string; weight: string }> = [
  { key: "team", label: "Team strength", weight: "30%" },
  { key: "opportunity", label: "Size of the opportunity", weight: "25%" },
  { key: "product", label: "Product / technology", weight: "15%" },
  { key: "competition", label: "Competitive environment", weight: "10%" },
  { key: "sales", label: "Sales & marketing channels", weight: "10%" },
  { key: "funding_need", label: "Need for further investment", weight: "5%" },
  { key: "other", label: "Other factors", weight: "5%" },
];

const RISKS = ["management", "stage", "legislation", "manufacturing", "sales", "funding", "competition",
  "technology", "litigation", "international", "reputation", "exit"];

const BERKUS = [
  { key: "idea", label: "Sound idea (basic value)" },
  { key: "prototype", label: "Prototype (technology risk)" },
  { key: "team", label: "Quality management team" },
  { key: "relationships", label: "Strategic relationships" },
  { key: "rollout", label: "Product rollout / sales" },
];

const money = (v: number | null | undefined, cur = "EUR") => {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const s = abs >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : abs >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : abs >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v.toFixed(0);
  return `${cur} ${s}`;
};
const pct = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);

interface PrevRound { stage: string; date: string; amount: string; postMoney: string; investors: string }
const emptyRound = (): PrevRound => ({ stage: "seed", date: "", amount: "", postMoney: "", investors: "" });

export interface StartupPanelProfile { name: string; country: string; currency: string; sector: string; website: string; description: string }

interface StartupPanelProps {
  /** Prefill the profile (used by the startup watchlist). */
  initialProfile?: Partial<StartupPanelProfile>;
  /** Prefill traction / round inputs. */
  initialForm?: Record<string, string>;
  /** Fires whenever a valuation completes, so a parent can save it. */
  onResult?: (result: Record<string, unknown>, profile: StartupPanelProfile) => void;
}

export function StartupValuationPanel({ initialProfile, initialForm, onResult }: StartupPanelProps = {}) {
  const [profile, setProfile] = useState<StartupPanelProfile>({ name: "", country: "IT", currency: "EUR", sector: "software", website: "", description: "", ...initialProfile });
  const [form, setForm] = useState({
    stage: "seed",
    revenue: "", revenueGrowth: "0.8", grossMargin: "0.75", burnRate: "", cashOnHand: "", users: "",
    roundSize: "", targetOwnership: "", optionPool: "0.1",
    requiredIrr: "", yearsToExit: "", exitMultiple: "", exitRevenue: "",
    ...initialForm,
  });

  const [rounds, setRounds] = useState<PrevRound[]>([]);
  const [scorecard, setScorecard] = useState<Record<string, number>>(Object.fromEntries(SCORECARD.map((s) => [s.key, 1])));
  const [risks, setRisks] = useState<Record<string, number>>(Object.fromEntries(RISKS.map((r) => [r, 0])));
  const [berkus, setBerkus] = useState<Record<string, number>>(Object.fromEntries(BERKUS.map((b) => [b.key, 0.5])));
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Record<string, any> | null>(null);

  const numOrUndef = (v: string) => (v.trim() === "" ? undefined : Number(v));

  const run = async () => {
    if (!profile.name) { toast.error("Add the startup name"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("valuation", {
        body: {
          mode: "startup",
          profile,
          description: profile.description,
          startup: {
            stage: form.stage,
            revenue: numOrUndef(form.revenue), revenueGrowth: numOrUndef(form.revenueGrowth),
            grossMargin: numOrUndef(form.grossMargin), burnRate: numOrUndef(form.burnRate),
            cashOnHand: numOrUndef(form.cashOnHand), users: numOrUndef(form.users),
            roundSize: numOrUndef(form.roundSize), targetOwnership: numOrUndef(form.targetOwnership),
            optionPool: numOrUndef(form.optionPool), requiredIrr: numOrUndef(form.requiredIrr),
            yearsToExit: numOrUndef(form.yearsToExit), exitMultiple: numOrUndef(form.exitMultiple),
            exitRevenue: numOrUndef(form.exitRevenue),
            previousRounds: rounds.filter((r) => r.amount || r.postMoney).map((r) => ({
              stage: r.stage, date: r.date, amount: Number(r.amount || 0), postMoney: Number(r.postMoney || 0), investors: r.investors,
            })),
            scorecard, riskFactors: risks, berkus,
          },
          language: profile.country === "IT" ? "it" : "en",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setRes(data);
      onResult?.(data, profile);
      toast.success("Startup valuation ready");

    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Valuation failed");
    } finally { setLoading(false); }
  };

  const exportPdf = () => {
    if (!res) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    let y = 64;
    const line = (t: string, size = 10, bold = false) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      for (const l of doc.splitTextToSize(t, 595 - 96)) {
        if (y > 780) { doc.addPage(); y = 64; }
        doc.text(l, 48, y); y += size + 4;
      }
    };
    line(`Startup valuation — ${profile.name}`, 16, true);
    line(`${form.stage.replace("_", " ")} · ${profile.sector} · ${profile.country} · ${new Date().toLocaleDateString()}`, 9);
    if (res.range) line(`Pre-money range: ${money(res.range.low, profile.currency)} – ${money(res.range.high, profile.currency)} (weighted ${money(res.range.weighted, profile.currency)})`, 11, true);
    for (const m of res.methods ?? []) line(`${m.label}: ${money(m.preMoney, profile.currency)} — ${m.detail}`, 9);
    for (const [id, text] of Object.entries(res.narrative?.sections ?? {})) {
      y += 8; line(String(id).replace(/_/g, " "), 12, true); line(String(text).replace(/[#*]/g, ""), 10);
    }
    doc.save(`startup-valuation-${(profile.name || "startup").replace(/\s+/g, "-").toLowerCase()}.pdf`);
  };

  const field = (label: string, key: keyof typeof form, placeholder = "", step?: string) => (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={`su-${key}`}>{label}</Label>
      <Input id={`su-${key}`} type="number" step={step} value={form[key]} placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Startup profile</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label className="text-xs" htmlFor="su-name">Name</Label>
              <Input id="su-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs" htmlFor="su-site">Website (read by the AI, facts only)</Label>
              <Input id="su-site" value={profile.website} placeholder="www.startup.com" onChange={(e) => setProfile({ ...profile, website: e.target.value })} /></div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="su-stage">Stage</Label>
              <select id="su-stage" className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="su-sector">Sector</Label>
              <select id="su-sector" className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={profile.sector} onChange={(e) => setProfile({ ...profile, sector: e.target.value })}>
                {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="su-country">Country (sets benchmarks and required return)</Label>
              <select id="su-country" className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={profile.country} onChange={(e) => setProfile({ ...profile, country: e.target.value })}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label className="text-xs" htmlFor="su-cur">Currency</Label>
              <Input id="su-cur" value={profile.currency} onChange={(e) => setProfile({ ...profile, currency: e.target.value.toUpperCase() })} /></div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs" htmlFor="su-desc">What the startup does</Label>
              <Textarea id="su-desc" rows={3} value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Traction & round</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {field("Revenue / ARR", "revenue")}
            {field("Growth yoy", "revenueGrowth", "0.8", "0.1")}
            {field("Gross margin", "grossMargin", "0.75", "0.05")}
            {field("Monthly burn", "burnRate")}
            {field("Cash on hand", "cashOnHand")}
            {field("Round size", "roundSize")}
            {field("Investor ownership", "targetOwnership", "0.15", "0.01")}
            {field("Option pool", "optionPool", "0.10", "0.01")}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Exit & required return</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {field("Required IRR (blank = benchmark)", "requiredIrr", "0.45", "0.05")}
            {field("Years to exit", "yearsToExit", "6", "1")}
            {field("Exit EV/revenue multiple", "exitMultiple", "6", "0.5")}
            {field("Planned exit revenue", "exitRevenue")}
            <p className="col-span-2 text-xs text-muted-foreground">
              Left blank, the required return comes from the stage and country benchmarks — a Milan seed round is priced differently from a Bay Area seed round.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Previous rounds & investors</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {rounds.map((r, i) => (
              <div key={i} className="grid grid-cols-5 gap-1 items-center">
                <select className="h-9 rounded-md border border-input bg-background px-2 text-xs" value={r.stage}
                  onChange={(e) => setRounds(rounds.map((x, j) => (j === i ? { ...x, stage: e.target.value } : x)))}>
                  {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <Input className="h-9" placeholder="Year" value={r.date} onChange={(e) => setRounds(rounds.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                <Input className="h-9" placeholder="Raised" value={r.amount} onChange={(e) => setRounds(rounds.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                <Input className="h-9" placeholder="Post-money" value={r.postMoney} onChange={(e) => setRounds(rounds.map((x, j) => (j === i ? { ...x, postMoney: e.target.value } : x)))} />
                <div className="flex gap-1">
                  <Input className="h-9" placeholder="Investors" value={r.investors} onChange={(e) => setRounds(rounds.map((x, j) => (j === i ? { ...x, investors: e.target.value } : x)))} />
                  <button aria-label="Remove round" onClick={() => setRounds(rounds.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-muted-foreground" /></button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setRounds([...rounds, emptyRound()])}><Plus className="h-4 w-4 mr-1" />Add round</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Scorecard factors</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {SCORECARD.map((s) => (
              <div key={s.key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{s.label} <span className="text-muted-foreground">({s.weight})</span></span>
                  <span className="font-medium">{scorecard[s.key].toFixed(2)}x</span>
                </div>
                <Slider min={0.4} max={1.75} step={0.05} value={[scorecard[s.key]]}
                  onValueChange={([v]) => setScorecard({ ...scorecard, [s.key]: v })} aria-label={s.label} />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">1.00x = same as the average funded startup in this market.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Risk factors (−2 to +2)</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {RISKS.map((r) => (
              <div key={r} className="space-y-1">
                <div className="flex justify-between text-xs capitalize"><span>{r}</span><span className="font-medium">{risks[r] > 0 ? `+${risks[r]}` : risks[r]}</span></div>
                <Slider min={-2} max={2} step={1} value={[risks[r]]} onValueChange={([v]) => setRisks({ ...risks, [r]: v })} aria-label={`${r} risk`} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Berkus milestones</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {BERKUS.map((b) => (
              <div key={b.key} className="space-y-1">
                <div className="flex justify-between text-xs"><span>{b.label}</span><span className="font-medium">{pct(berkus[b.key])}</span></div>
                <Slider min={0} max={1} step={0.1} value={[berkus[b.key]]} onValueChange={([v]) => setBerkus({ ...berkus, [b.key]: v })} aria-label={b.label} />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Share of each milestone cap already achieved. Used for pre-revenue rounds.</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button onClick={run} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Rocket className="h-4 w-4 mr-2" />}Value the startup
        </Button>
        {res && <Button variant="outline" onClick={exportPdf}><Download className="h-4 w-4 mr-2" />Export PDF</Button>}
      </div>

      {res && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Pre-money valuation</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {res.range && (
                <div className="text-2xl font-semibold">
                  {money(res.range.low, profile.currency)} – {money(res.range.high, profile.currency)}
                  <span className="text-sm text-muted-foreground ml-2">weighted {money(res.range.weighted, profile.currency)}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Region {res.region}</Badge>
                <Badge variant="outline">Benchmark median {money(res.benchmark?.median, profile.currency)}</Badge>
                <Badge variant="outline">Required return {pct(res.requiredIrr?.irr)}</Badge>
                {res.runwayMonths != null && <Badge variant="outline">Runway {Math.round(res.runwayMonths)} months</Badge>}
                {res.round?.downRound && <Badge variant="destructive">Down round</Badge>}
              </div>
              {!!res.notes?.length && (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {res.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Method by method</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Method</TableHead><TableHead>Pre-money</TableHead><TableHead>Post-money</TableHead><TableHead>Weight</TableHead><TableHead>How it got there</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(res.methods ?? []).map((m: any) => (
                    <TableRow key={m.key} className={m.applicable ? "" : "opacity-50"}>
                      <TableCell className="font-medium">{m.label}</TableCell>
                      <TableCell>{money(m.preMoney, profile.currency)}</TableCell>
                      <TableCell>{money(m.postMoney, profile.currency)}</TableCell>
                      <TableCell>{m.applicable ? m.weight.toFixed(2) : "n/a"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Round mechanics</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
              <div className="flex justify-between rounded-md border border-border px-3 py-2"><span>Pre-money</span><span className="font-medium">{money(res.round?.preMoney, profile.currency)}</span></div>
              <div className="flex justify-between rounded-md border border-border px-3 py-2"><span>Post-money</span><span className="font-medium">{money(res.round?.postMoney, profile.currency)}</span></div>
              <div className="flex justify-between rounded-md border border-border px-3 py-2"><span>Pre-money after pool shuffle</span><span className="font-medium">{money(res.round?.preMoneyAfterPoolShuffle, profile.currency)}</span></div>
              <div className="flex justify-between rounded-md border border-border px-3 py-2"><span>Investor ownership</span><span className="font-medium">{pct(res.round?.targetOwnership, 1)}</span></div>
              <div className="flex justify-between rounded-md border border-border px-3 py-2"><span>Founder dilution this round</span><span className="font-medium">{pct(res.round?.founderDilution, 1)}</span></div>
              <div className="flex justify-between rounded-md border border-border px-3 py-2"><span>Step-up vs last round</span><span className="font-medium">{res.round?.stepUpVsLastRound ? `${res.round.stepUpVsLastRound.toFixed(2)}x` : "—"}</span></div>
            </CardContent>
          </Card>

          {res.websiteResearch && <WebsiteEvidence research={res.websiteResearch} />}

          {!!res.comparables?.peers?.length && (
            <Card>
              <CardHeader><CardTitle className="text-base">Listed comparables (public-market anchor)</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">{res.comparables.rationale}</p>
                <div className="flex flex-wrap gap-2">
                  {res.comparables.peers.map((p: any) => (
                    <Badge key={p.symbol} variant="secondary">{p.symbol} · P/S {p.ps?.toFixed?.(1) ?? "—"}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {Object.entries(res.narrative?.sections ?? {}).map(([id, text]) => (
            <Card key={id}>
              <CardHeader><CardTitle className="text-base capitalize">{id.replace(/_/g, " ")}</CardTitle></CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap leading-relaxed">{String(text).replace(/[#*]/g, "")}</CardContent>
            </Card>
          ))}

          <p className="text-xs text-muted-foreground">
            Benchmarks are market medians by stage, country and sector — they are a starting point for negotiation, not a price. Educational use, not investment advice.
          </p>
        </div>
      )}
    </div>
  );
}
