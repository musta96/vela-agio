import { useMemo, useRef, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TickerSearch } from "@/components/TickerSearch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Calculator, FileText, Upload, Download, ExternalLink, Trash2, Plus } from "lucide-react";
import jsPDF from "jspdf";

// ---------------------------------------------------------------- helpers
const pct = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`;
const pctRaw = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(d)}%`;
const money = (v: number | null | undefined, cur = "EUR") => {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const s = abs >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : abs >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : abs >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(2);
  return `${cur} ${s}`;
};

const SECTIONS: Array<{ id: string; label: string }> = [
  { id: "executive_summary", label: "Executive summary" },
  { id: "engagement_scope", label: "Incarico e finalità (scope)" },
  { id: "company_overview", label: "Profilo aziendale" },
  { id: "market_analysis", label: "Mercato e posizionamento" },
  { id: "financial_analysis", label: "Analisi economico-finanziaria" },
  { id: "normalisation_adjustments", label: "Normalizzazioni e rettifiche" },
  { id: "methodology", label: "Metodologie di valutazione" },
  { id: "wacc_buildup", label: "Costruzione del WACC" },
  { id: "dcf_valuation", label: "Valutazione DCF" },
  { id: "market_multiples", label: "Multipli di mercato" },
  { id: "asset_based", label: "Metodo patrimoniale" },
  { id: "discounts_premia", label: "Sconti e premi" },
  { id: "sensitivity", label: "Analisi di sensitività" },
  { id: "valuation_conclusion", label: "Conclusioni di valore" },
  { id: "jurisdiction_requirements", label: "Requisiti normativi locali" },
  { id: "limitations_disclaimer", label: "Limiti e dichiarazioni" },
];

const COUNTRIES = ["IT", "FR", "DE", "ES", "CH", "GB", "US", "NL", "BE", "PT", "AT", "PL", "AE", "SA", "IN", "CN", "JP", "SG", "BR", "MX", "ZA", "AU"];

interface FinRow { year: string; revenue: string; ebitda: string; ebit: string; da: string; netIncome: string; capex: string; nwcChange: string; netDebt: string; equity: string }
const emptyRow = (year: number): FinRow => ({ year: String(year), revenue: "", ebitda: "", ebit: "", da: "", netIncome: "", capex: "", nwcChange: "", netDebt: "", equity: "" });

export default function Valuation() {
  const thisYear = new Date().getFullYear();

  // ---------------- listed ----------------
  const [symbol, setSymbol] = useState("AAPL");
  const [pubLoading, setPubLoading] = useState(false);
  const [pub, setPub] = useState<Record<string, any> | null>(null);
  const [pubAssump, setPubAssump] = useState({ riskFree: 0.035, erp: 0.055, beta: 1, terminalGrowth: 0.02, growth: 0.06, taxRate: 0.24, forecastYears: 5, costOfDebt: 0.05, debtWeight: 0.3 });

  const runPublic = async () => {
    setPubLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("valuation", { body: { mode: "public", symbol, assumptions: pubAssump } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPub(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Valuation failed");
    } finally { setPubLoading(false); }
  };

  // ---------------- private ----------------
  const [profile, setProfile] = useState({ name: "", country: "IT", currency: "EUR", sector: "", description: "", employees: "", founded: "" });
  const [rows, setRows] = useState<FinRow[]>([emptyRow(thisYear - 2), emptyRow(thisYear - 1), emptyRow(thisYear)]);
  const [assump, setAssump] = useState({
    riskFree: 0.035, erp: 0.055, beta: 1.1, sizePremium: 0.03, specificPremium: 0.02, countryPremium: 0.015,
    costOfDebt: 0.055, debtWeight: 0.3, taxRate: 0.24, growth: 0.06, terminalGrowth: 0.015, forecastYears: 5,
    illiquidityDiscount: 0.25, controlPremium: 0, assetRevaluation: 0, hiddenLiabilities: 0, exitMultiple: 0,
  });
  const [selected, setSelected] = useState<string[]>(SECTIONS.map((s) => s.id));
  const [docs, setDocs] = useState<Array<{ name: string; text: string }>>([]);
  const [privLoading, setPrivLoading] = useState(false);
  const [priv, setPriv] = useState<Record<string, any> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleSection = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files).slice(0, 8)) {
      try {
        let text = "";
        if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
          const pdfjs = await import("pdfjs-dist");
          const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
          pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
          const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
          const parts: string[] = [];
          for (let p = 1; p <= Math.min(doc.numPages, 40); p++) {
            const page = await doc.getPage(p);
            const c = await page.getTextContent();
            parts.push(c.items.map((i: any) => i.str).join(" "));
          }
          text = parts.join("\n");
        } else {
          text = await f.text();
        }
        setDocs((d) => [...d, { name: f.name, text: text.slice(0, 120_000) }]);
      } catch {
        toast.error(`Could not read ${f.name}`);
      }
    }
  };

  const runPrivate = async () => {
    if (!profile.name || !profile.description) { toast.error("Add the company name and a business description"); return; }
    setPrivLoading(true);
    try {
      const financials = rows
        .filter((r) => r.year && r.revenue)
        .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "year" ? v : Number(v || 0)])));
      const { data, error } = await supabase.functions.invoke("valuation", {
        body: { mode: "private", profile, description: profile.description, financials, assumptions: assump, sections: selected, documents: docs, language: profile.country === "IT" ? "it" : "en" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPriv(data);
      // When the figures came from the uploaded statements, show them in the
      // grid so the user can see and correct what was read.
      if (data?.financialsSource === "documents" && Array.isArray(data.financials) && data.financials.length) {
        setRows(data.financials.map((r: Record<string, unknown>) => ({
          ...emptyRow(Number(r.year) || thisYear),
          ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? "" : String(v)])),
        })));
        toast.success("Appraisal generated from the uploaded documents");
      } else {
        toast.success("Appraisal generated");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Appraisal failed");
    } finally { setPrivLoading(false); }
  };

  const exportPdf = () => {
    if (!priv) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = 595, M = 48;
    let y = 64;
    const line = (t: string, size = 10, bold = false) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      for (const l of doc.splitTextToSize(t, W - M * 2)) {
        if (y > 780) { doc.addPage(); y = 64; }
        doc.text(l, M, y); y += size + 4;
      }
    };
    line(`Perizia di valutazione — ${profile.name}`, 16, true);
    line(`${profile.sector || "—"} · ${profile.country} · ${new Date().toLocaleDateString()}`, 9);
    y += 8;
    if (priv.range) line(`Valore economico stimato: ${money(priv.range.low, profile.currency)} – ${money(priv.range.high, profile.currency)} (mid ${money(priv.range.mid, profile.currency)})`, 11, true);
    y += 6;
    for (const s of SECTIONS.filter((s) => selected.includes(s.id))) {
      const body = priv.narrative?.sections?.[s.id];
      if (!body) continue;
      y += 8;
      line(s.label, 12, true);
      line(String(body).replace(/[#*]/g, ""), 10);
    }
    doc.save(`perizia-${(profile.name || "azienda").replace(/\s+/g, "-").toLowerCase()}.pdf`);
  };

  const football = useMemo(() => {
    if (!priv?.conclusions) return [] as Array<{ label: string; value: number }>;
    const map: Record<string, string> = {
      dcf: "DCF", multiplesEvEbitda: "EV/EBITDA peers", multiplesPe: "P/E peers",
      multiplesPs: "P/S peers", adjustedNetAsset: "Patrimoniale rettificato",
    };
    return Object.entries(priv.conclusions)
      .filter(([, v]) => typeof v === "number" && Number.isFinite(v as number))
      .map(([k, v]) => ({ label: map[k] ?? k, value: v as number }));
  }, [priv]);

  const num = (label: string, key: string, obj: Record<string, number>, set: (o: any) => void, step = 0.005) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" step={step} value={obj[key]} onChange={(e) => set({ ...obj, [key]: Number(e.target.value) })} />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Valuation: DCF, DDM & Company Appraisal | Vela.ai" description="Value any listed ticker with DCF, DDM, ROIC/WACC and peer multiples — or build a full private-company appraisal (perizia di valutazione d'azienda) with comparables, WACC build-up and local requirements." path="/valuation" />
      <TopNav />
      <main className="container mx-auto px-4 py-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Calculator className="h-5 w-5" /> Valuation</h1>
          <p className="text-sm text-muted-foreground">DCF, DDM, ROIC/WACC and comparables for listed companies — plus a complete private-company appraisal.</p>
        </header>

        <Tabs defaultValue="listed">
          <TabsList>
            <TabsTrigger value="listed">Listed company</TabsTrigger>
            <TabsTrigger value="private">Private company (perizia)</TabsTrigger>
          </TabsList>

          {/* ------------------------------------------------ LISTED */}
          <TabsContent value="listed" className="space-y-4">
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1"><TickerSearch value={symbol} onValueChange={setSymbol} onSelect={(h) => setSymbol(h.symbol.toUpperCase())} placeholder="Search any listed instrument" /></div>
                  <Button onClick={runPublic} disabled={pubLoading}>
                    {pubLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}Value
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {num("Risk-free", "riskFree", pubAssump as any, setPubAssump)}
                  {num("ERP", "erp", pubAssump as any, setPubAssump)}
                  {num("Beta", "beta", pubAssump as any, setPubAssump, 0.05)}
                  {num("Growth y1", "growth", pubAssump as any, setPubAssump)}
                  {num("Terminal g", "terminalGrowth", pubAssump as any, setPubAssump)}
                </div>
              </CardContent>
            </Card>

            {pub && (
              <div className="grid gap-4 lg:grid-cols-3">
                <Card><CardHeader><CardTitle className="text-base">DCF</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="text-2xl font-semibold">{pub.dcf?.perShare ? `${pub.currency ?? ""} ${pub.dcf.perShare.toFixed(2)}` : "—"}</div>
                    <div className="text-muted-foreground">Upside vs price: {pctRaw(pub.dcf?.upsidePct)}</div>
                    <div className="text-muted-foreground">WACC {pct(pub.wacc?.wacc)} · terminal {pct(pub.dcf?.terminalGrowth)} · {pub.dcf?.method}</div>
                    <div className="text-muted-foreground">EV {money(pub.dcf?.enterpriseValue, pub.currency)} · equity {money(pub.dcf?.equityValue, pub.currency)}</div>
                  </CardContent>
                </Card>
                <Card><CardHeader><CardTitle className="text-base">DDM</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="text-2xl font-semibold">{pub.ddm?.value ? `${pub.currency ?? ""} ${pub.ddm.value.toFixed(2)}` : "n/a"}</div>
                    <div className="text-muted-foreground">DPS {pub.ddm?.dps?.toFixed?.(2) ?? "—"} · g {pct(pub.ddm?.growth)}</div>
                    <div className="text-muted-foreground">Upside: {pctRaw(pub.ddm?.upsidePct)}</div>
                  </CardContent>
                </Card>
                <Card><CardHeader><CardTitle className="text-base">ROIC / WACC</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="text-2xl font-semibold">{pub.roicWacc?.roic != null ? pct(pub.roicWacc.roic) : "—"}</div>
                    <div className="text-muted-foreground">WACC {pct(pub.wacc?.wacc)} · spread {pub.roicWacc?.roic != null && pub.wacc?.wacc != null ? pct(pub.roicWacc.roic - pub.wacc.wacc) : "—"}</div>
                    <div className="text-muted-foreground">Cost of equity {pct(pub.wacc?.costOfEquity)}</div>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-3">
                  <CardHeader><CardTitle className="text-base">Comparable companies</CardTitle></CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Peer</TableHead><TableHead>P/E</TableHead><TableHead>EV/EBITDA</TableHead><TableHead>P/S</TableHead><TableHead>P/B</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(pub.comparables?.peers ?? []).map((p: any) => (
                          <TableRow key={p.symbol}>
                            <TableCell>{p.symbol} <span className="text-muted-foreground">{p.name}</span></TableCell>
                            <TableCell>{p.pe?.toFixed?.(1) ?? "—"}</TableCell>
                            <TableCell>{p.evEbitda?.toFixed?.(1) ?? "—"}</TableCell>
                            <TableCell>{p.ps?.toFixed?.(1) ?? "—"}</TableCell>
                            <TableCell>{p.pb?.toFixed?.(1) ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                        {pub.comparables?.median && (
                          <TableRow className="font-medium">
                            <TableCell>Median</TableCell>
                            <TableCell>{pub.comparables.median.pe?.toFixed?.(1) ?? "—"}</TableCell>
                            <TableCell>{pub.comparables.median.evEbitda?.toFixed?.(1) ?? "—"}</TableCell>
                            <TableCell>{pub.comparables.median.ps?.toFixed?.(1) ?? "—"}</TableCell>
                            <TableCell>{pub.comparables.median.pb?.toFixed?.(1) ?? "—"}</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {Object.entries(pub.impliedPrices ?? {}).map(([k, v]) => (
                        <Badge key={k} variant="outline">{k}: {typeof v === "number" ? v.toFixed(2) : "—"}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ----------------------------------------------- PRIVATE */}
          <TabsContent value="private" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">Company profile</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label className="text-xs" htmlFor="val-name">Name</Label><Input id="val-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs" htmlFor="val-sector">Sector</Label><Input id="val-sector" value={profile.sector} onChange={(e) => setProfile({ ...profile, sector: e.target.value })} /></div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="val-country">Country (drives local requirements)</Label>
                    <select id="val-country" className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={profile.country} onChange={(e) => setProfile({ ...profile, country: e.target.value })}>
                      {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1"><Label className="text-xs" htmlFor="val-currency">Currency</Label><Input id="val-currency" value={profile.currency} onChange={(e) => setProfile({ ...profile, currency: e.target.value.toUpperCase() })} /></div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs" htmlFor="val-desc">Business description (used to find listed comparables)</Label>
                    <Textarea id="val-desc" rows={4} value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} placeholder="What the company does, customers, geography, contracts, competitive edge…" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.txt,.csv,.md,.json" onChange={(e) => onFiles(e.target.files)} />
                  <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Business plan, bilanci, contratti</Button>
                  <ul className="space-y-1 text-xs">
                    {docs.map((d, i) => (
                      <li key={d.name + i} className="flex items-center justify-between gap-2">
                        <span className="truncate flex items-center gap-1"><FileText className="h-3 w-3" />{d.name}</span>
                        <button onClick={() => setDocs(docs.filter((_, j) => j !== i))} aria-label={`Remove ${d.name}`}><Trash2 className="h-3 w-3 text-muted-foreground" /></button>
                      </li>
                    ))}
                    {!docs.length && <li className="text-muted-foreground">PDF and text files are parsed and used as evidence.</li>}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Financial history</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto space-y-3">
                <Table>
                  <TableHeader><TableRow>
                    {["Year", "Revenue", "EBITDA", "EBIT", "D&A", "Net income", "Capex", "ΔNWC", "Net debt", "Equity"].map((h) => <TableHead key={h}>{h}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={i}>
                        {(Object.keys(r) as Array<keyof FinRow>).map((k) => (
                          <TableCell key={k} className="p-1">
                            <Input className="h-8 w-28" value={r[k]} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button variant="outline" size="sm" onClick={() => setRows([...rows, emptyRow(thisYear + rows.length - 2)])}><Plus className="h-4 w-4 mr-1" />Add year</Button>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Assumptions</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {num("Risk-free", "riskFree", assump as any, setAssump)}
                  {num("ERP", "erp", assump as any, setAssump)}
                  {num("Beta", "beta", assump as any, setAssump, 0.05)}
                  {num("Size premium", "sizePremium", assump as any, setAssump)}
                  {num("Specific risk", "specificPremium", assump as any, setAssump)}
                  {num("Country premium", "countryPremium", assump as any, setAssump)}
                  {num("Cost of debt", "costOfDebt", assump as any, setAssump)}
                  {num("Debt weight", "debtWeight", assump as any, setAssump, 0.05)}
                  {num("Tax rate", "taxRate", assump as any, setAssump)}
                  {num("Growth y1", "growth", assump as any, setAssump)}
                  {num("Terminal g", "terminalGrowth", assump as any, setAssump)}
                  {num("Illiquidity disc.", "illiquidityDiscount", assump as any, setAssump, 0.05)}
                  {num("Control premium", "controlPremium", assump as any, setAssump, 0.05)}
                  {num("Asset revaluation", "assetRevaluation", assump as any, setAssump, 1000)}
                  {num("Hidden liabilities", "hiddenLiabilities", assump as any, setAssump, 1000)}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Report sections</CardTitle></CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-2">
                  {SECTIONS.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={selected.includes(s.id)} onCheckedChange={() => toggleSection(s.id)} />
                      {s.label}
                    </label>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="flex gap-2">
              <Button onClick={runPrivate} disabled={privLoading}>
                {privLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}Generate appraisal
              </Button>
              {priv && <Button variant="outline" onClick={exportPdf}><Download className="h-4 w-4 mr-2" />Export PDF</Button>}
            </div>

            {priv && (
              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">Valuation range</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {priv.range && (
                      <div className="text-2xl font-semibold">
                        {money(priv.range.low, profile.currency)} – {money(priv.range.high, profile.currency)}
                        <span className="text-sm text-muted-foreground ml-2">mid {money(priv.range.mid, profile.currency)}</span>
                      </div>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {football.map((f) => (
                        <div key={f.label} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                          <span>{f.label}</span><span className="font-medium">{money(f.value, profile.currency)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      WACC {pct(priv.wacc?.wacc)} · cost of equity {pct(priv.wacc?.costOfEquity)} · illiquidity {pct(priv.discounts?.illiquidityDiscount)} · control {pct(priv.discounts?.controlPremium)}
                    </p>
                  </CardContent>
                </Card>

                {!!priv.comparables?.peers?.length && (
                  <Card>
                    <CardHeader><CardTitle className="text-base">Comparables found</CardTitle></CardHeader>
                    <CardContent className="overflow-x-auto space-y-2">
                      <p className="text-sm text-muted-foreground">{priv.comparables.rationale}</p>
                      <Table>
                        <TableHeader><TableRow><TableHead>Company</TableHead><TableHead>EV/EBITDA</TableHead><TableHead>P/E</TableHead><TableHead>P/S</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {priv.comparables.peers.map((p: any) => (
                            <TableRow key={p.symbol}>
                              <TableCell>{p.symbol} <span className="text-muted-foreground">{p.name}</span></TableCell>
                              <TableCell>{p.evEbitda?.toFixed?.(1) ?? "—"}</TableCell>
                              <TableCell>{p.pe?.toFixed?.(1) ?? "—"}</TableCell>
                              <TableCell>{p.ps?.toFixed?.(1) ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {SECTIONS.filter((s) => selected.includes(s.id) && priv.narrative?.sections?.[s.id]).map((s) => (
                  <Card key={s.id}>
                    <CardHeader><CardTitle className="text-base">{s.label}</CardTitle></CardHeader>
                    <CardContent className="text-sm whitespace-pre-wrap leading-relaxed">{String(priv.narrative.sections[s.id]).replace(/[#*]/g, "")}</CardContent>
                  </Card>
                ))}

                {!!priv.jurisdiction?.sources?.length && (
                  <Card>
                    <CardHeader><CardTitle className="text-base">Local requirements — sources</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {priv.jurisdiction.sources.map((src: any) => (
                        <a key={src.url} href={src.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                          <ExternalLink className="h-3 w-3" />{src.title || src.url}
                        </a>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
