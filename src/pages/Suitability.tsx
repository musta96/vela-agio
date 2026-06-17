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
import { Shield, CheckCircle2, RefreshCw, AlertTriangle, Download, FileText, AlertCircle, Info, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  SECTIONS,
  PROFILES,
  MAX_SCORE,
  TOTAL_QUESTIONS,
  computeSuitability,
  sanitizeAnswers,
  type SuitabilityQuestion,
} from "@/lib/suitability";

/**
 * MiFID II / IDD / SFDR-style suitability & appropriateness questionnaire.
 * Scoring lives in `@/lib/suitability` so the Settings summary card and
 * unit tests share the exact same logic.
 */
type Q = SuitabilityQuestion;

// Legacy inline definitions kept for one PR so the diff stays surgical; they
// are immediately overwritten by the imports above. Block kept as a dead
// object literal that TypeScript ignores via assignment to `_LEGACY_SECTIONS`.
const _LEGACY_SECTIONS: { id: string; title: string; description: string; questions: Q[] }[] = [
  {
    id: "knowledge",
    title: "1. Knowledge & Experience",
    description: "MiFID II appropriateness - your familiarity with financial instruments.",
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
  { value: "retail",        label: "Retail (default - highest protection)" },
  { value: "professional",  label: "Professional on request (MiFID II Annex II)" },
  { value: "eligible",      label: "Eligible counterparty (institutional)" },
];

// PROFILES, SECTIONS, MAX_SCORE and TOTAL_QUESTIONS are imported from
// `@/lib/suitability`. Do not redeclare here - the Settings page and unit
// tests must read the same constants for scores to agree.

// Re-assessment cadence - ESMA expects at least annual review for advised clients
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

  // Single source of truth for score / profile / completion. Always clamped.
  const suitability = computeSuitability(ans);
  const { score, maxScore, profile, answeredCount: completed, totalQuestions, completionPct, complete } = suitability;
  const horizonScore = ans["horizon"] ?? 0;
  const horizonYears = [1, 3, 7, 10][horizonScore] ?? 3;

  // Structured real-time validation (ESMA suitability guideline 5 + numeric ranges).
  // severity: "error" blocks save; "warn" allows save with attestation; "info" is advisory.
  type Issue = {
    id: string;
    severity: "error" | "warn" | "info";
    message: string;
    suggestion: string;
    fix?: { label: string; run: () => void };
  };
  const issues: Issue[] = [];

  // --- Numeric range validation (errors block save) ---
  if (lossTolerancePct < 1 || lossTolerancePct > 100) issues.push({
    id: "loss-range", severity: "error",
    message: `Max drawdown ${lossTolerancePct}% is outside the 1–100% range.`,
    suggestion: "Set a realistic drawdown tolerance between 1% and 100%.",
    fix: { label: "Set to 20%", run: () => setLossTolerancePct(20) },
  });
  if (maxSinglePositionPct < 1 || maxSinglePositionPct > 100) issues.push({
    id: "pos-range", severity: "error",
    message: `Max single position ${maxSinglePositionPct}% is outside 1–100%.`,
    suggestion: "Pick a concentration cap between 1% and 100%.",
    fix: { label: "Set to 10%", run: () => setMaxSinglePositionPct(10) },
  });
  if (dependents < 0 || dependents > 20) issues.push({
    id: "dep-range", severity: "error",
    message: "Dependents must be between 0 and 20.",
    suggestion: "Enter how many people rely on your income.",
    fix: { label: "Set to 0", run: () => setDependents(0) },
  });
  if (liquidityNeedMonths < 0 || liquidityNeedMonths > 120) issues.push({
    id: "liq-range", severity: "error",
    message: "Liquidity horizon must be 0–120 months.",
    suggestion: "Enter the months within which you may need this capital.",
    fix: { label: "Set to 6", run: () => setLiquidityNeedMonths(6) },
  });
  if (sfdrSustainableMinPct + sfdrTaxonomyMinPct > 100) issues.push({
    id: "sfdr-sum", severity: "error",
    message: "Taxonomy + Sustainable minimums exceed 100%.",
    suggestion: "Lower one of the SFDR minimums so they sum to ≤ 100%.",
    fix: { label: "Reset to 0/0", run: () => { setSfdrSustainableMinPct(0); setSfdrTaxonomyMinPct(0); } },
  });

  // --- KYC / AML completeness (errors) ---
  if (complete && sourceOfFunds.length === 0) issues.push({
    id: "sof-missing", severity: "error",
    message: "AML requires at least one source of funds.",
    suggestion: "Tick every source that contributed to the capital you plan to invest (Section 6).",
  });
  if (complete && sourceOfWealth.length === 0) issues.push({
    id: "sow-missing", severity: "error",
    message: "AML requires at least one source of overall wealth.",
    suggestion: "Tick every applicable source in Section 6.",
  });
  if (isPep && pepDetails.trim().length < 3) issues.push({
    id: "pep-details", severity: "error",
    message: "PEP status flagged but role/jurisdiction missing.",
    suggestion: "Describe your PEP role and country in Section 6.",
  });

  // --- Coherence (warnings) ---
  if ((ans["horizon"] ?? 0) <= 1 && (ans["goal"] ?? 0) >= 3) issues.push({
    id: "horizon-goal", severity: "warn",
    message: "Aggressive growth with a < 3-year horizon is inconsistent.",
    suggestion: "Either extend the horizon to 3+ years or step the goal down to Balanced growth.",
    fix: { label: "Lower goal to Balanced", run: () => setAns(a => ({ ...a, goal: 2 })) },
  });
  if ((ans["loss"] ?? 0) === 0 && (ans["volatility"] ?? 0) >= 2) issues.push({
    id: "loss-vol", severity: "warn",
    message: "You'd sell everything on a 20% drop yet accept medium/high volatility.",
    suggestion: "Align the two: pick a calmer loss reaction or lower acceptable volatility.",
    fix: { label: "Lower volatility to 5–10%", run: () => setAns(a => ({ ...a, volatility: 1 })) },
  });
  if (leverageAllowed && (ans["knowledge"] ?? 0) < 2) issues.push({
    id: "lev-know", severity: "warn",
    message: "Leverage requested but investment knowledge is basic.",
    suggestion: "MiFID appropriateness would reject this. Disable leverage or raise your knowledge level after demonstrable experience.",
    fix: { label: "Disable leverage", run: () => setLeverageAllowed(false) },
  });
  if ((productKnowledge["options"] ?? 0) >= 2 && (ans["experience"] ?? 0) === 0) issues.push({
    id: "opt-exp", severity: "warn",
    message: "Options experience declared with zero trading history.",
    suggestion: "Reconcile Section 5 with Section 1, or downgrade options knowledge to Aware.",
    fix: { label: "Downgrade options to Aware", run: () => setProductKnowledge(p => ({ ...p, options: 1 })) },
  });
  if (esg.startsWith("Impact") && sfdrSustainableMinPct < 50) issues.push({
    id: "art9-min", severity: "warn",
    message: "Article 9 / impact preference usually implies ≥ 50% sustainable investments.",
    suggestion: "Raise the SFDR sustainable minimum to 50%+ or switch to Article 8 (Strict).",
    fix: { label: "Set sustainable min to 50%", run: () => setSfdrSustainableMinPct(50) },
  });
  if (maxSinglePositionPct > 25) issues.push({
    id: "ucits-25", severity: "warn",
    message: "Single-position cap > 25% breaches UCITS-style diversification.",
    suggestion: "Tighten the cap to ≤ 25% unless you have a documented concentration mandate.",
    fix: { label: "Cap at 25%", run: () => setMaxSinglePositionPct(25) },
  });
  if (liquidityNeedMonths <= 12 && profile.sri >= 5) issues.push({
    id: "liq-risk", severity: "warn",
    message: `${liquidityNeedMonths}-month liquidity need with a ${profile.name} (SRI ${profile.sri}) profile is risky.`,
    suggestion: "Either extend the liquidity horizon or reduce risk by adjusting horizon/goal/loss reaction.",
  });

  // --- Informational ---
  if (complete && clientCategory !== "retail") issues.push({
    id: "non-retail", severity: "info",
    message: `You selected ${clientCategory === "professional" ? "Professional" : "Eligible counterparty"} status.`,
    suggestion: "We assume you meet the MiFID II Annex II tests. You waive certain retail protections.",
  });
  if (sfdrPaiConsidered && !esg.includes("Strict") && !esg.includes("Impact")) issues.push({
    id: "pai-light", severity: "info",
    message: "PAI indicators are considered but ESG preference is Light.",
    suggestion: "Consider upgrading ESG preference to Strict (Art. 8) to reflect PAI consideration.",
  });

  const errors = issues.filter(i => i.severity === "error");
  const warns  = issues.filter(i => i.severity === "warn");
  const infos  = issues.filter(i => i.severity === "info");
  // Backwards-compat string list for the audit payload
  const warnings = [...errors, ...warns].map(i => i.message);

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
        // Only keep numeric values for known core questions - strips legacy
        // `__`-prefixed extension fields that used to inflate score/answered.
        setAns(sanitizeAnswers(a));
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
    if (errors.length) { toast.error(`${errors.length} blocking error${errors.length > 1 ? "s" : ""} - fix them before saving`); return; }
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
      risk_level: profile.sri,
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
    toast.success(`Profile saved: ${profile.name} (SRI ${profile.sri}/7)`);
  };

  const handleReset = () => {
    setAns({}); setObjectives([]); setExcluded([]); setEsg("No preference"); setLossTolerancePct(20); setNotes("");
    setProductKnowledge({}); setSourceOfFunds([]); setSourceOfWealth([]); setIsPep(false); setPepDetails("");
    setUsPerson(false); setCrsResidencies(""); setDependents(0); setLiquidityNeedMonths(6);
    setMaxSinglePositionPct(10); setLeverageAllowed(false); setSfdrSustainableMinPct(0);
    setSfdrTaxonomyMinPct(0); setSfdrPaiConsidered(false); setAttestation(false); setClientCategory("retail");
  };

  const buildAuditPayload = () => {
    const labelFor = (qKey: string, score: number): string => {
      for (const s of SECTIONS) {
        const q = s.questions.find((x) => x.key === qKey);
        if (q) return q.opts.find((o) => o.score === score)?.label ?? String(score);
      }
      return String(score);
    };
    return {
      generated_at: new Date().toISOString(),
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      saved_at: savedAt,
      profile: { name: profile.name, score, max_score: maxScore, sri: profile.sri, sri_scale: "1-7", allocation: profile.allocation, description: profile.desc },
      horizon_years: horizonYears,
      core_answers: SECTIONS.flatMap((s) =>
        s.questions.map((q) => ({
          section: s.title, key: q.key, question: q.q,
          score: ans[q.key] ?? null,
          answer: ans[q.key] != null ? labelFor(q.key, ans[q.key]) : null,
        }))
      ),
      mifid: {
        client_category: clientCategory,
        product_knowledge: productKnowledge,
        source_of_funds: sourceOfFunds,
        source_of_wealth: sourceOfWealth,
        is_pep: isPep, pep_details: pepDetails,
        us_person: usPerson, crs_residencies: crsResidencies,
        dependents, liquidity_need_months: liquidityNeedMonths,
        max_single_position_pct: maxSinglePositionPct,
        leverage_allowed: leverageAllowed,
      },
      sfdr: {
        esg_preference: esg,
        sustainable_min_pct: sfdrSustainableMinPct,
        taxonomy_min_pct: sfdrTaxonomyMinPct,
        pai_considered: sfdrPaiConsidered,
      },
      objectives, excluded_sectors: excluded,
      loss_tolerance_pct: lossTolerancePct,
      notes,
      consistency_warnings: warnings,
      attestation: attestation,
      version: 2,
    };
  };

  const handleExportJson = () => {
    const payload = buildAuditPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `suitability-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("JSON audit exported");
  };

  const handleExportPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const p = buildAuditPayload();
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFontSize(16); doc.text("MiFID II Suitability - Audit Record", 40, 50);
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`Generated ${new Date(p.generated_at).toLocaleString()}`, 40, 66);
    doc.text(`User: ${p.user_email ?? p.user_id ?? "-"}`, 40, 78);
    if (p.saved_at) doc.text(`Profile last saved: ${new Date(p.saved_at).toLocaleString()}`, 40, 90);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 110, theme: "plain",
      head: [["Profile summary", ""]],
      body: [
        ["Risk profile", p.profile.name],
        ["Score", `${p.profile.score} / ${p.profile.max_score}`],
        ["SRI", `${p.profile.sri} / 7`],
        ["Horizon", `${p.horizon_years} years`],
        ["Suggested allocation", p.profile.allocation],
        ["Loss tolerance", `${p.loss_tolerance_pct}%`],
        ["ESG preference", p.sfdr.esg_preference],
        ["Client category", p.mifid.client_category],
        ["Leverage allowed", p.mifid.leverage_allowed ? "Yes" : "No"],
      ],
      styles: { fontSize: 9 }, headStyles: { fontStyle: "bold", fillColor: [240, 240, 240] },
      columnStyles: { 0: { cellWidth: 160, fontStyle: "bold" } },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 14,
      head: [["Section", "Question", "Answer", "Score"]],
      body: p.core_answers.map((a) => [a.section.replace(/^\d+\.\s*/, ""), a.question, a.answer ?? "-", a.score ?? "-"]),
      styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [30, 41, 59] },
    });

    const pk = Object.entries(p.mifid.product_knowledge);
    if (pk.length) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 14,
        head: [["Instrument knowledge", "Level"]],
        body: pk.map(([k, v]) => [k, KNOWLEDGE_LEVELS[v as number]?.label ?? String(v)]),
        styles: { fontSize: 8 }, headStyles: { fillColor: [30, 41, 59] },
      });
    }

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 14,
      head: [["KYC / AML", ""]],
      body: [
        ["Source of funds", p.mifid.source_of_funds.join(", ") || "-"],
        ["Source of wealth", p.mifid.source_of_wealth.join(", ") || "-"],
        ["PEP", p.mifid.is_pep ? `Yes - ${p.mifid.pep_details || "no detail"}` : "No"],
        ["US person (FATCA)", p.mifid.us_person ? "Yes" : "No"],
        ["CRS tax residencies", p.mifid.crs_residencies || "-"],
        ["Dependents", String(p.mifid.dependents)],
        ["Liquidity need (months)", String(p.mifid.liquidity_need_months)],
        ["Max single position", `${p.mifid.max_single_position_pct}%`],
      ],
      styles: { fontSize: 8 }, headStyles: { fillColor: [240, 240, 240], textColor: 20 },
      columnStyles: { 0: { cellWidth: 160, fontStyle: "bold" } },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 14,
      head: [["SFDR sustainability", ""]],
      body: [
        ["Preference", p.sfdr.esg_preference],
        ["Min. sustainable (%)", String(p.sfdr.sustainable_min_pct)],
        ["Min. EU taxonomy (%)", String(p.sfdr.taxonomy_min_pct)],
        ["PAI considered", p.sfdr.pai_considered ? "Yes" : "No"],
        ["Objectives", p.objectives.join(", ") || "-"],
        ["Excluded sectors", p.excluded_sectors.join(", ") || "-"],
      ],
      styles: { fontSize: 8 }, headStyles: { fillColor: [240, 240, 240], textColor: 20 },
      columnStyles: { 0: { cellWidth: 160, fontStyle: "bold" } },
    });

    if (p.consistency_warnings.length) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 14,
        head: [["Consistency warnings (ESMA Guideline 5)"]],
        body: p.consistency_warnings.map((w) => [w]),
        styles: { fontSize: 8, textColor: 120 }, headStyles: { fillColor: [254, 243, 199], textColor: 120 },
      });
    }

    if (p.notes) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 14,
        head: [["Notes"]], body: [[p.notes]], styles: { fontSize: 8 },
        headStyles: { fillColor: [240, 240, 240], textColor: 20 },
      });
    }

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150);
      doc.text(
        `Vela.ai - MiFID II suitability audit · Page ${i}/${pages} · ${p.attestation ? "Attested by user" : "Draft (not attested)"}`,
        40, doc.internal.pageSize.getHeight() - 20,
      );
      doc.text("Informational only - not investment advice.", pageW - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
    }

    doc.save(`suitability-audit-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF audit downloaded");
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
              <p className="text-sm text-muted-foreground">MiFID II · IDD · SFDR - used to tailor AI recommendations</p>
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
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Current profile</div>
                <div className="text-2xl font-bold">{profile.name}</div>
                <div className="text-sm text-muted-foreground">{profile.desc}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm">Score {score}/{maxScore} · SRI {profile.sri}/7</div>
                <div className="text-xs text-muted-foreground">{completed}/{totalQuestions} answered</div>
                <div className="font-mono text-xs mt-1">{profile.allocation}</div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                <span>Completion</span>
                <span className="font-mono">{completionPct}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${completionPct}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <Badge variant={errors.length ? "destructive" : "outline"} className="gap-1">
                <AlertCircle className="h-3 w-3" />{errors.length} error{errors.length === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline" className={`gap-1 ${warns.length ? "border-warning/50 text-warning" : ""}`}>
                <AlertTriangle className="h-3 w-3" />{warns.length} warning{warns.length === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Info className="h-3 w-3" />{infos.length} note{infos.length === 1 ? "" : "s"}
              </Badge>
              {complete && !errors.length && !warns.length && (
                <Badge variant="outline" className="gap-1 border-success/50 text-success">
                  <CheckCircle2 className="h-3 w-3" />All checks passed
                </Badge>
              )}
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

            {/* Product knowledge matrix - MiFID II appropriateness per instrument class */}
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

            {/* AML / KYC - source of funds & wealth, PEP, FATCA/CRS */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">6. AML / KYC - Source of Funds & Tax Status</CardTitle>
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
                  <Label htmlFor="crs" className="text-sm font-medium">CRS - other tax residencies (comma-separated)</Label>
                  <Input id="crs" maxLength={200} value={crsResidencies} onChange={e => setCrsResidencies(e.target.value)} className="mt-2" placeholder="e.g. CH, US" />
                </div>
              </CardContent>
            </Card>

            {/* Capacity to bear losses - quantitative */}
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
                <CardDescription>EU MiFID II amendment 2022/1288 - required since Aug 2022. Three sustainability dimensions.</CardDescription>
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

            {issues.length > 0 && (
              <Card className={errors.length ? "border-destructive/50 bg-destructive/5" : warns.length ? "border-warning/40 bg-warning/5" : "border-primary/30 bg-primary/5"}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {errors.length
                      ? <AlertCircle className="h-5 w-5 text-destructive" />
                      : warns.length
                        ? <AlertTriangle className="h-5 w-5 text-warning" />
                        : <Info className="h-5 w-5 text-primary" />}
                    Validation &amp; consistency
                  </CardTitle>
                  <CardDescription>
                    Real-time checks across MiFID II appropriateness, AML/KYC, SFDR and ESMA Guideline 5.
                    {" "}
                    <span className="font-medium text-foreground">
                      {errors.length} error{errors.length === 1 ? "" : "s"} · {warns.length} warning{warns.length === 1 ? "" : "s"} · {infos.length} note{infos.length === 1 ? "" : "s"}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {issues.map((iss) => {
                    const tone = iss.severity === "error"
                      ? { border: "border-destructive/40", bg: "bg-destructive/5", text: "text-destructive", icon: <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />, badge: "Error" }
                      : iss.severity === "warn"
                        ? { border: "border-warning/40", bg: "bg-warning/5", text: "text-warning", icon: <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />, badge: "Warning" }
                        : { border: "border-primary/30", bg: "bg-primary/5", text: "text-primary", icon: <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />, badge: "Note" };
                    return (
                      <div key={iss.id} className={`rounded-md border ${tone.border} ${tone.bg} p-3 flex items-start gap-3`}>
                        {tone.icon}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${tone.text}`}>{tone.badge}</Badge>
                            <span className="text-sm font-medium">{iss.message}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">Next action:</span> {iss.suggestion}
                          </p>
                          {iss.fix && (
                            <Button size="sm" variant="outline" className="h-7 mt-1" onClick={iss.fix.run}>
                              <Wand2 className="h-3 w-3 mr-1.5" />{iss.fix.label}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">11. Attestation</CardTitle>
                <CardDescription>Required before saving - records date, version and warnings acknowledged.</CardDescription>
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
              <Button onClick={handleSave} disabled={!complete || saving || !attestation || errors.length > 0}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
              <Button variant="outline" onClick={handleReset}><RefreshCw className="h-4 w-4 mr-2" />Reset</Button>
              <Button variant="outline" onClick={handleExportPdf} disabled={completed === 0}>
                <FileText className="h-4 w-4 mr-2" />Download PDF audit
              </Button>
              <Button variant="ghost" onClick={handleExportJson} disabled={completed === 0}>
                <Download className="h-4 w-4 mr-2" />JSON
              </Button>
              {!complete && <span className="text-xs text-muted-foreground">Answer all {totalQuestions} core questions to save.</span>}
              {complete && errors.length > 0 && (
                <span className="text-xs text-destructive font-medium">Fix {errors.length} blocking error{errors.length === 1 ? "" : "s"} above before saving.</span>
              )}
              {complete && !errors.length && !attestation && <span className="text-xs text-muted-foreground">Tick the attestation to enable save.</span>}
            </div>

            <p className="text-xs text-muted-foreground">
              This questionnaire follows ESMA guidelines on the MiFID II suitability assessment and SFDR sustainability preferences. It is informational only and does not constitute investment advice. Your answers are stored privately and used to tailor AI-generated insights inside Vela.ai - they are never shared with brokers or third parties.
            </p>
          </>
        )}
      </main>
    </div>
  );
}