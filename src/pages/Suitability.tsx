import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * MiFID II / IDD / SFDR-style suitability & appropriateness questionnaire.
 * Categories follow ESMA Guidelines on suitability assessment (2022/2023).
 */
type Q = { key: string; q: string; help?: string; opts: { label: string; score: number }[] };

const SECTIONS: { id: string; title: string; description: string; questions: Q[] }[] = [
  {
    id: "knowledge",
    title: "1. Knowledge & Experience",
    description: "MiFID II appropriateness — your familiarity with financial instruments.",
    questions: [
      { key: "edu", q: "Highest finance/economics education", opts: [
        { label: "None", score: 0 },
        { label: "Self-taught / books & courses", score: 1 },
        { label: "University-level economics or finance", score: 2 },
        { label: "Postgraduate / professional (CFA, ACCA, etc.)", score: 3 },
      ]},
      { key: "knowledge", q: "Overall investment knowledge", opts: [
        { label: "None", score: 0 },
        { label: "Basic (savings, term deposits)", score: 1 },
        { label: "Good (stocks, ETFs, bonds)", score: 2 },
        { label: "Expert (derivatives, structured products)", score: 3 },
      ]},
      { key: "experience", q: "How long have you actively invested?", opts: [
        { label: "Never", score: 0 },
        { label: "< 2 years", score: 1 },
        { label: "2-5 years", score: 2 },
        { label: "5+ years", score: 3 },
      ]},
      { key: "frequency", q: "Average number of trades per year", opts: [
        { label: "0", score: 0 },
        { label: "1-10", score: 1 },
        { label: "11-50", score: 2 },
        { label: "50+", score: 3 },
      ]},
    ],
  },
  {
    id: "financial",
    title: "2. Financial Situation",
    description: "Your capacity to bear losses (MiFID II Art. 25).",
    questions: [
      { key: "income", q: "Liquid savings vs annual income", opts: [
        { label: "< 3 months", score: 0 },
        { label: "3-6 months", score: 1 },
        { label: "6-12 months", score: 2 },
        { label: "12+ months", score: 3 },
      ]},
      { key: "debt", q: "Debt-to-income ratio", opts: [
        { label: "> 50%", score: 0 },
        { label: "30-50%", score: 1 },
        { label: "10-30%", score: 2 },
        { label: "< 10% or none", score: 3 },
      ]},
      { key: "share", q: "% of net worth you can invest at risk", opts: [
        { label: "< 10%", score: 0 },
        { label: "10-25%", score: 1 },
        { label: "25-50%", score: 2 },
        { label: "> 50%", score: 3 },
      ]},
    ],
  },
  {
    id: "objectives",
    title: "3. Investment Objectives & Horizon",
    description: "What you want from your portfolio.",
    questions: [
      { key: "horizon", q: "Investment horizon", opts: [
        { label: "< 1 year", score: 0 },
        { label: "1-3 years", score: 1 },
        { label: "3-7 years", score: 2 },
        { label: "7+ years", score: 3 },
      ]},
      { key: "goal", q: "Primary objective", opts: [
        { label: "Capital preservation", score: 0 },
        { label: "Regular income", score: 1 },
        { label: "Balanced growth", score: 2 },
        { label: "Aggressive growth", score: 3 },
      ]},
    ],
  },
  {
    id: "risk",
    title: "4. Risk Tolerance",
    description: "Behavioural reaction to losses.",
    questions: [
      { key: "loss", q: "If your portfolio dropped 20% in a month you would…", opts: [
        { label: "Sell everything", score: 0 },
        { label: "Sell part, worry", score: 1 },
        { label: "Hold calmly", score: 2 },
        { label: "Buy more", score: 3 },
      ]},
      { key: "volatility", q: "Acceptable annual volatility", opts: [
        { label: "Very low (< 5%)", score: 0 },
        { label: "Low (5-10%)", score: 1 },
        { label: "Medium (10-20%)", score: 2 },
        { label: "High (> 20%)", score: 3 },
      ]},
    ],
  },
];

const OBJECTIVE_TAGS = ["Retirement", "House purchase", "Education", "Wealth growth", "Income", "Speculation", "Tax efficiency"];
const EXCLUDE_TAGS = ["Tobacco", "Weapons", "Fossil fuels", "Gambling", "Adult content", "Animal testing", "Nuclear"];
const ESG_OPTIONS = ["No preference", "Light (ESG-aware)", "Strict (SFDR Art. 8)", "Impact-only (SFDR Art. 9)"];

// MiFID II product-knowledge matrix (appropriateness per instrument class)
const INSTRUMENT_CLASSES = [
  { key: "cash",        label: "Cash / money market",           complex: false },
  { key: "gov_bonds",   label: "Government bonds (UCITS/ETF)",  complex: false },
  { key: "corp_bonds",  label: "Corporate bonds",               complex: false },
  { key: "equities",    label: "Listed equities & equity ETFs", complex: false },
  { key: "funds",       label: "UCITS funds",                   complex: false },
  { key: "etc",         label: "ETCs / commodities ETFs",       complex: false },
  { key: "options",     label: "Options & warrants",            complex: true  },
  { key: "futures",     label: "Futures / CFDs (leverage)",     complex: true  },
  { key: "structured",  label: "Structured / certificates",     complex: true  },
  { key: "crypto",      label: "Crypto assets (MiCA)",          complex: true  },
  { key: "private",     label: "Private markets / illiquid",    complex: true  },
] as const;
const KNOWLEDGE_LEVELS = [
  { label: "None",       score: 0 },
  { label: "Aware",      score: 1 },
  { label: "Some trades",score: 2 },
  { label: "Experienced",score: 3 },
];

const SOURCE_OF_FUNDS = ["Salary / employment", "Business income", "Inheritance", "Sale of property", "Sale of business", "Investment proceeds", "Gift", "Other"];
const SOURCE_OF_WEALTH = ["Employment", "Business ownership", "Inheritance", "Real estate", "Investments", "Other"];
const CLIENT_CATEGORIES = [
  { value: "retail",        label: "Retail (default — highest protection)" },
  { value: "professional",  label: "Professional on request (MiFID II Annex II)" },
  { value: "eligible",      label: "Eligible counterparty (institutional)" },
];

const PROFILES = [
  { min: 0, max: 8, name: "Conservative", risk: 2, allocation: "20% equities / 70% bonds / 10% cash", desc: "Capital preservation, low volatility." },
  { min: 9, max: 15, name: "Moderate", risk: 3, allocation: "50% / 45% / 5%", desc: "Balanced growth with controlled risk." },
  { min: 16, max: 22, name: "Growth", risk: 5, allocation: "70% / 25% / 5%", desc: "Long-term capital appreciation." },
  { min: 23, max: 30, name: "Aggressive", risk: 7, allocation: "90% / 8% / 2% + thematic tilts", desc: "Maximum growth, high volatility tolerance." },
];

// Re-assessment cadence — ESMA expects at least annual review for advised clients
const REASSESS_MONTHS = 12;

export default function Suitability() {
  const { user } = useAuth();
  const [ans, setAns] = useState<Record<string, number>>({});
  const [objectives, setObjectives] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [esg, setEsg] = useState<string>("No preference");
  const [lossTolerancePct, setLossTolerancePct] = useState<number>(20);
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Extended MiFID / IDD / SFDR fields stored inside answers JSON
  const [clientCategory, setClientCategory] = useState<string>("retail");
  const [productKnowledge, setProductKnowledge] = useState<Record<string, number>>({});
  const [sourceOfFunds, setSourceOfFunds] = useState<string[]>([]);
  const [sourceOfWealth, setSourceOfWealth] = useState<string[]>([]);
  const [isPep, setIsPep] = useState<boolean>(false);
  const [pepDetails, setPepDetails] = useState<string>("");
  const [usPerson, setUsPerson] = useState<boolean>(false);
  const [crsResidencies, setCrsResidencies] = useState<string>("");
  const [dependents, setDependents] = useState<number>(0);
  const [liquidityNeedMonths, setLiquidityNeedMonths] = useState<number>(6);
  const [maxSinglePositionPct, setMaxSinglePositionPct] = useState<number>(10);
  const [leverageAllowed, setLeverageAllowed] = useState<boolean>(false);
  const [sfdrSustainableMinPct, setSfdrSustainableMinPct] = useState<number>(0);
  const [sfdrTaxonomyMinPct, setSfdrTaxonomyMinPct] = useState<number>(0);
  const [sfdrPaiConsidered, setSfdrPaiConsidered] = useState<boolean>(false);
  const [attestation, setAttestation] = useState<boolean>(false);

  const totalQuestions = SECTIONS.reduce((n, s) => n + s.questions.length, 0);
  const score = Object.values(ans).reduce((a, b) => a + b, 0);
  const profile = PROFILES.find(p => score >= p.min && score <= p.max) ?? PROFILES[0];
  const horizonScore = ans["horizon"] ?? 0;
  const horizonYears = [1, 3, 7, 10][horizonScore] ?? 3;
  const completed = Object.keys(ans).length;
  const complete = completed === totalQuestions;

  // Consistency / coherence warnings (ESMA suitability guideline 5)
  const warnings: string[] = [];
  if ((ans["horizon"] ?? 0) <= 1 && (ans["goal"] ?? 0) >= 3) warnings.push("Aggressive growth goal with a < 3-year horizon is inconsistent — extend horizon or lower the goal.");
  if ((ans["loss"] ?? 0) === 0 && (ans["volatility"] ?? 0) >= 2) warnings.push("You say you'd sell on a 20% drop yet accept medium/high volatility — these conflict.");
  if (leverageAllowed && (ans["knowledge"] ?? 0) < 2) warnings.push("Leverage allowed but knowledge is basic — MiFID appropriateness would flag this.");
  if ((productKnowledge["options"] ?? 0) >= 2 && (ans["experience"] ?? 0) === 0) warnings.push("Options experience declared without any trading history — please reconcile.");
  if (esg.startsWith("Impact") && sfdrSustainableMinPct < 50) warnings.push("Article 9 / impact preference usually implies ≥ 50% sustainable investments.");
  if (maxSinglePositionPct > 25) warnings.push("Concentration > 25% in a single position breaches UCITS-style diversification.");

  // Re-assessment due
  const reassessmentDue = (() => {
    if (!savedAt) return false;
    const d = new Date(savedAt).getTime();
    return Date.now() - d > REASSESS_MONTHS * 30 * 24 * 3600 * 1000;
  })();

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from("investor_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        const a = (data.answers as Record<string, any>) ?? {};
        // Core scored answers are numeric; extended fields live alongside
        const core: Record<string, number> = {};
        for (const k of Object.keys(a)) {
          if (typeof a[k] === "number") core[k] = a[k];
        }
        setAns(core);
        setClientCategory(a.__clientCategory ?? "retail");
        setProductKnowledge(a.__productKnowledge ?? {});
        setSourceOfFunds(a.__sourceOfFunds ?? []);
        setSourceOfWealth(a.__sourceOfWealth ?? []);
        setIsPep(!!a.__isPep);
        setPepDetails(a.__pepDetails ?? "");
        setUsPerson(!!a.__usPerson);
        setCrsResidencies(a.__crsResidencies ?? "");
        setDependents(a.__dependents ?? 0);
        setLiquidityNeedMonths(a.__liquidityNeedMonths ?? 6);
        setMaxSinglePositionPct(a.__maxSinglePositionPct ?? 10);
        setLeverageAllowed(!!a.__leverageAllowed);
        setSfdrSustainableMinPct(a.__sfdrSustainableMinPct ?? 0);
        setSfdrTaxonomyMinPct(a.__sfdrTaxonomyMinPct ?? 0);
        setSfdrPaiConsidered(!!a.__sfdrPaiConsidered);
        setObjectives(data.objectives ?? []);
        setExcluded(data.excluded_sectors ?? []);
        setEsg(data.esg_preference ?? "No preference");
        setLossTolerancePct(data.loss_tolerance_pct ?? 20);
        setNotes(data.notes ?? "");
        setSavedAt(data.completed_at ?? data.updated_at ?? null);
        setAttestation(!!data.completed_at);
      }
      setLoading(false);
    })();
  }, [user]);

  const toggle = (list: string[], setter: (v: string[]) => void, value: string) => {
    setter(list.includes(value) ? list.filter(x => x !== value) : [...list, value]);
  };

  const handleSave = async () => {
    if (!user) { toast.error("Please sign in"); return; }
    if (!complete) { toast.error("Please answer all questions"); return; }
    if (!attestation) { toast.error("Please confirm the accuracy attestation"); return; }
    setSaving(true);
    const extendedAnswers = {
      ...ans,
      __clientCategory: clientCategory,
      __productKnowledge: productKnowledge,
      __sourceOfFunds: sourceOfFunds,
      __sourceOfWealth: sourceOfWealth,
      __isPep: isPep,
      __pepDetails: pepDetails,
      __usPerson: usPerson,
      __crsResidencies: crsResidencies,
      __dependents: dependents,
      __liquidityNeedMonths: liquidityNeedMonths,
      __maxSinglePositionPct: maxSinglePositionPct,
      __leverageAllowed: leverageAllowed,
      __sfdrSustainableMinPct: sfdrSustainableMinPct,
      __sfdrTaxonomyMinPct: sfdrTaxonomyMinPct,
      __sfdrPaiConsidered: sfdrPaiConsidered,
      __version: 2,
      __warnings: warnings,
    };
    const row = {
      user_id: user.id,
      answers: extendedAnswers,
      score,
      profile_name: profile.name,
      risk_level: profile.risk,
      horizon_years: horizonYears,
      esg_preference: esg,
      loss_tolerance_pct: lossTolerancePct,
      objectives,
      excluded_sectors: excluded,
      notes,
      completed_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("investor_profiles").upsert(row, { onConflict: "user_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setSavedAt(row.completed_at);
    toast.success(`Profile saved: ${profile.name} (SRI ${profile.risk}/7)`);
  };

  const handleReset = () => {
    setAns({}); setObjectives([]); setExcluded([]); setEsg("No preference"); setLossTolerancePct(20); setNotes("");
    setProductKnowledge({}); setSourceOfFunds([]); setSourceOfWealth([]); setIsPep(false); setPepDetails("");
    setUsPerson(false); setCrsResidencies(""); setDependents(0); setLiquidityNeedMonths(6);
    setMaxSinglePositionPct(10); setLeverageAllowed(false); setSfdrSustainableMinPct(0);
    setSfdrTaxonomyMinPct(0); setSfdrPaiConsidered(false); setAttestation(false); setClientCategory("retail");
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="MiFID II Suitability Questionnaire | Vela.ai" description="MiFID II / IDD / SFDR-style investor suitability assessment. Tailors AI recommendations to your risk, knowledge, goals and ESG preferences." path="/suitability" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Investor Suitability Profile</h1>
              <p className="text-sm text-muted-foreground">MiFID II · IDD · SFDR — used to tailor AI recommendations</p>
            </div>
          </div>
          {savedAt && (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Saved {new Date(savedAt).toLocaleDateString()}
            </Badge>
          )}
        </div>

      {reassessmentDue && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold">Annual review due</div>
              <div className="text-muted-foreground">ESMA suitability guidelines recommend reviewing your profile at least every 12 months. Please confirm or update your answers.</div>
            </div>
          </CardContent>
        </Card>
      )}

        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="pt-6 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Current profile</div>
              <div className="text-2xl font-bold">{profile.name}</div>
              <div className="text-sm text-muted-foreground">{profile.desc}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm">Score {score}/30 · SRI {profile.risk}/7</div>
              <div className="text-xs text-muted-foreground">{completed}/{totalQuestions} answered</div>
              <div className="font-mono text-xs mt-1">{profile.allocation}</div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card><CardContent className="pt-6 text-muted-foreground">Loading…</CardContent></Card>
        ) : (
          <>
            {SECTIONS.map(section => (
              <Card key={section.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {section.questions.map(qq => (
                    <div key={qq.key}>
                      <Label className="text-sm font-medium">{qq.q}</Label>
                      {qq.help && <p className="text-xs text-muted-foreground mt-0.5">{qq.help}</p>}
                      <RadioGroup
                        className="mt-2"
                        value={ans[qq.key] !== undefined ? String(ans[qq.key]) : ""}
                        onValueChange={(v) => setAns({ ...ans, [qq.key]: Number(v) })}
                      >
                        {qq.opts.map((o, i) => (
                          <div key={i} className="flex items-center gap-2 py-0.5">
                            <RadioGroupItem id={`${qq.key}-${i}`} value={String(o.score)} />
                            <Label htmlFor={`${qq.key}-${i}`} className="cursor-pointer font-normal">{o.label}</Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}

            {/* Product knowledge matrix — MiFID II appropriateness per instrument class */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">5. Product Knowledge & Experience</CardTitle>
                <CardDescription>MiFID II appropriateness test, per instrument class. Complex instruments require demonstrated knowledge.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b">
                        <th className="py-2 pr-2 font-medium">Instrument</th>
                        {KNOWLEDGE_LEVELS.map(l => <th key={l.label} className="py-2 px-2 font-medium text-center">{l.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {INSTRUMENT_CLASSES.map(inst => (
                        <tr key={inst.key} className="border-b last:border-0">
                          <td className="py-2 pr-2">
                            {inst.label}
                            {inst.complex && <Badge variant="outline" className="ml-2 text-[10px]">Complex</Badge>}
                          </td>
                          {KNOWLEDGE_LEVELS.map(l => (
                            <td key={l.label} className="py-2 px-2 text-center">
                              <input
                                type="radio"
                                name={`pk-${inst.key}`}
                                checked={(productKnowledge[inst.key] ?? -1) === l.score}
                                onChange={() => setProductKnowledge({ ...productKnowledge, [inst.key]: l.score })}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* AML / KYC — source of funds & wealth, PEP, FATCA/CRS */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">6. AML / KYC — Source of Funds & Tax Status</CardTitle>
                <CardDescription>EU AMLD5/6 · FATCA · CRS · 4MLD PEP screening.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Source of funds to invest</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                    {SOURCE_OF_FUNDS.map(t => (
                      <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={sourceOfFunds.includes(t)} onCheckedChange={() => toggle(sourceOfFunds, setSourceOfFunds, t)} />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Source of overall wealth</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                    {SOURCE_OF_WEALTH.map(t => (
                      <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={sourceOfWealth.includes(t)} onCheckedChange={() => toggle(sourceOfWealth, setSourceOfWealth, t)} />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={isPep} onCheckedChange={(v) => setIsPep(!!v)} />
                    I am a Politically Exposed Person (or close family / associate)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={usPerson} onCheckedChange={(v) => setUsPerson(!!v)} />
                    US person for FATCA purposes
                  </label>
                </div>
                {isPep && (
                  <div>
                    <Label htmlFor="pep-details" className="text-sm font-medium">PEP details (role, jurisdiction)</Label>
                    <Input id="pep-details" maxLength={200} value={pepDetails} onChange={e => setPepDetails(e.target.value)} className="mt-2" />
                  </div>
                )}
                <div>
                  <Label htmlFor="crs" className="text-sm font-medium">CRS — other tax residencies (comma-separated)</Label>
                  <Input id="crs" maxLength={200} value={crsResidencies} onChange={e => setCrsResidencies(e.target.value)} className="mt-2" placeholder="e.g. CH, US" />
                </div>
              </CardContent>
            </Card>

            {/* Capacity to bear losses — quantitative */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">7. Capacity, Liquidity & Concentration</CardTitle>
                <CardDescription>Quantitative limits used by the portfolio engine.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Dependents (people relying on you)</Label>
                  <Input type="number" min={0} max={20} value={dependents} onChange={e => setDependents(Number(e.target.value) || 0)} className="mt-2" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Liquidity needed within (months)</Label>
                  <Input type="number" min={0} max={120} value={liquidityNeedMonths} onChange={e => setLiquidityNeedMonths(Number(e.target.value) || 0)} className="mt-2" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Max single position (% of portfolio)</Label>
                  <Input type="number" min={1} max={100} value={maxSinglePositionPct} onChange={e => setMaxSinglePositionPct(Number(e.target.value) || 0)} className="mt-2" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={leverageAllowed} onCheckedChange={(v) => setLeverageAllowed(!!v)} />
                    Allow leverage / margin / short selling
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Client classification */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">8. MiFID Client Classification</CardTitle>
                <CardDescription>Defaults to Retail. Professional / Eligible requires meeting the Annex II quantitative & qualitative tests.</CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup value={clientCategory} onValueChange={setClientCategory}>
                  {CLIENT_CATEGORIES.map(c => (
                    <div key={c.value} className="flex items-center gap-2 py-0.5">
                      <RadioGroupItem id={`cc-${c.value}`} value={c.value} />
                      <Label htmlFor={`cc-${c.value}`} className="cursor-pointer font-normal">{c.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">9. Sustainability Preferences (SFDR)</CardTitle>
                <CardDescription>EU MiFID II amendment 2022/1288 — required since Aug 2022. Three sustainability dimensions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">ESG preference</Label>
                  <RadioGroup className="mt-2" value={esg} onValueChange={setEsg}>
                    {ESG_OPTIONS.map(o => (
                      <div key={o} className="flex items-center gap-2 py-0.5">
                        <RadioGroupItem id={`esg-${o}`} value={o} />
                        <Label htmlFor={`esg-${o}`} className="cursor-pointer font-normal">{o}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Min. % Taxonomy-aligned (Reg. 2020/852)</Label>
                    <Input type="number" min={0} max={100} value={sfdrTaxonomyMinPct} onChange={e => setSfdrTaxonomyMinPct(Number(e.target.value) || 0)} className="mt-2" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Min. % Sustainable Investments (SFDR Art. 2(17))</Label>
                    <Input type="number" min={0} max={100} value={sfdrSustainableMinPct} onChange={e => setSfdrSustainableMinPct(Number(e.target.value) || 0)} className="mt-2" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={sfdrPaiConsidered} onCheckedChange={(v) => setSfdrPaiConsidered(!!v)} />
                  Consider Principal Adverse Impact (PAI) indicators
                </label>
                <div>
                  <Label className="text-sm font-medium">Excluded sectors</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                    {EXCLUDE_TAGS.map(tag => (
                      <label key={tag} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={excluded.includes(tag)} onCheckedChange={() => toggle(excluded, setExcluded, tag)} />
                        {tag}
                      </label>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">10. Personal Goals & Constraints</CardTitle>
                <CardDescription>Used to ground AI recommendations in your real-life objectives.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Goals</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                    {OBJECTIVE_TAGS.map(tag => (
                      <label key={tag} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={objectives.includes(tag)} onCheckedChange={() => toggle(objectives, setObjectives, tag)} />
                        {tag}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="loss" className="text-sm font-medium">Maximum acceptable drawdown (%)</Label>
                  <Input id="loss" type="number" min={1} max={100} value={lossTolerancePct} onChange={e => setLossTolerancePct(Number(e.target.value) || 0)} className="mt-2 w-32" />
                </div>
                <div>
                  <Label htmlFor="notes" className="text-sm font-medium">Additional notes for the AI (optional)</Label>
                  <Textarea id="notes" placeholder="e.g. avoid leverage, prefer European-domiciled UCITS, tax residence Italy…" value={notes} onChange={e => setNotes(e.target.value)} className="mt-2" rows={3} maxLength={1000} />
                </div>
              </CardContent>
            </Card>

            {warnings.length > 0 && (
              <Card className="border-warning/40 bg-warning/5">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning" /> Consistency checks</CardTitle>
                  <CardDescription>ESMA Suitability Guideline 5 — we flag contradictions before saving.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">11. Attestation</CardTitle>
                <CardDescription>Required before saving — records date, version and warnings acknowledged.</CardDescription>
              </CardHeader>
              <CardContent>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox checked={attestation} onCheckedChange={(v) => setAttestation(!!v)} className="mt-0.5" />
                  <span>
                    I confirm the information above is accurate and complete to the best of my knowledge, and I understand it will be used to assess suitability and appropriateness under MiFID II, IDD and SFDR.
                  </span>
                </label>
              </CardContent>
            </Card>

            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={handleSave} disabled={!complete || saving || !attestation}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
              <Button variant="outline" onClick={handleReset}><RefreshCw className="h-4 w-4 mr-2" />Reset</Button>
              {!complete && <span className="text-xs text-muted-foreground">Answer all {totalQuestions} core questions to save.</span>}
              {complete && !attestation && <span className="text-xs text-muted-foreground">Tick the attestation to enable save.</span>}
            </div>

            <p className="text-xs text-muted-foreground">
              This questionnaire follows ESMA guidelines on the MiFID II suitability assessment and SFDR sustainability preferences. It is informational only and does not constitute investment advice. Your answers are stored privately and used to tailor AI-generated insights inside Vela.ai — they are never shared with brokers or third parties.
            </p>
          </>
        )}
      </main>
    </div>
  );
}