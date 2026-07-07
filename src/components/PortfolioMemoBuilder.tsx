import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Loader2, FileText, Trash2, Save, X, Plus, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  generatePortfolioMemo,
  type GeneratePortfolioMemoOptions,
  type RiskProfile,
} from "@/lib/generatePortfolioMemo";
import { requestMemoPdf } from "@/lib/memo/client";
import { legacyPortfolioToMemoInput, type InstrumentDeepDive } from "@/lib/memo/adapter";
import { supabase } from "@/integrations/supabase/client";
import {
  listThesisVersions,
  saveThesisVersion,
  deleteThesisVersion,
  downloadMemoCsvBundle,
  type ThesisVersion,
} from "@/lib/portfolioMemoData";

const RISK_PROFILES: RiskProfile[] = ["conservative", "moderate", "balanced", "growth", "aggressive"];

export interface PortfolioMemoBuilderProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-fill allocation (e.g. derived from current holdings weights). */
  initialAllocation?: Record<string, number>;
  defaultPortfolioName?: string;
  defaultCurrency?: string;
  /** Optional simulation block (equity series + MC config) passed straight through. */
  simulation?: GeneratePortfolioMemoOptions["simulation"];
}

export function PortfolioMemoBuilder({
  open, onOpenChange, initialAllocation, defaultPortfolioName, defaultCurrency, simulation,
}: PortfolioMemoBuilderProps) {
  const { toast } = useToast();
  const [portfolioName, setPortfolioName] = useState(defaultPortfolioName ?? "Portfolio Strategy");
  const [currency, setCurrency] = useState(defaultCurrency ?? "EUR");
  const [thesis, setThesis] = useState("");
  const [goalsInput, setGoalsInput] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [riskProfile, setRiskProfile] = useState<string>("balanced");
  const [allocationRows, setAllocationRows] = useState<Array<{ symbol: string; weight: string }>>(() => {
    const entries = Object.entries(initialAllocation ?? {});
    return entries.length
      ? entries.map(([symbol, w]) => ({ symbol, weight: String(Number(w).toFixed(4)) }))
      : [{ symbol: "", weight: "" }];
  });
  const [customExec, setCustomExec] = useState("");
  const [customRisk, setCustomRisk] = useState("");
  const [customCatalysts, setCustomCatalysts] = useState("");
  const [versions, setVersions] = useState<ThesisVersion[]>([]);
  const [versionName, setVersionName] = useState("");
  const [strictAllocation, setStrictAllocation] = useState(false);
  const [exportData, setExportData] = useState(false);
  const [includeDeepDive, setIncludeDeepDive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setVersions(listThesisVersions()); }, [open]);
  useEffect(() => {
    if (!open) return;
    setPortfolioName(defaultPortfolioName ?? "Portfolio Strategy");
    setCurrency(defaultCurrency ?? "EUR");
    if (initialAllocation && Object.keys(initialAllocation).length) {
      setAllocationRows(Object.entries(initialAllocation).map(([s, w]) => ({ symbol: s, weight: String(Number(w).toFixed(4)) })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parsedAllocation = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of allocationRows) {
      const sym = r.symbol.trim().toUpperCase();
      const w = Number(r.weight);
      if (sym && Number.isFinite(w) && w > 0) out[sym] = (out[sym] ?? 0) + w;
    }
    return out;
  }, [allocationRows]);

  const sumWeights = useMemo(() => Object.values(parsedAllocation).reduce((s, w) => s + w, 0), [parsedAllocation]);
  const sumOff = Math.abs(sumWeights - 1) > 0.01;

  const addGoal = () => {
    const g = goalsInput.trim();
    if (!g) return;
    setGoals((prev) => prev.includes(g) ? prev : [...prev, g]);
    setGoalsInput("");
  };

  const updateRow = (idx: number, field: "symbol" | "weight", value: string) => {
    setAllocationRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };
  const addRow = () => setAllocationRows((prev) => [...prev, { symbol: "", weight: "" }]);
  const removeRow = (idx: number) => setAllocationRows((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const loadVersion = (v: ThesisVersion) => {
    setThesis(v.strategyThesis);
    setGoals(v.goals);
    setRiskProfile(v.riskProfile);
    if (v.portfolioName) setPortfolioName(v.portfolioName);
    setAllocationRows(Object.entries(v.allocation).map(([s, w]) => ({ symbol: s, weight: String(Number(w).toFixed(4)) })));
    setCustomExec(v.customSections?.executiveSummary ?? "");
    setCustomRisk(v.customSections?.riskAssessment ?? "");
    setCustomCatalysts(v.customSections?.catalystsAndRisks ?? "");
    setVersionName(v.name);
    toast({ title: "Thesis version loaded", description: v.name });
  };

  const saveCurrentAsVersion = () => {
    const name = (versionName.trim() || `${portfolioName} v${versions.length + 1}`).slice(0, 80);
    const v = saveThesisVersion({
      name,
      portfolioName,
      strategyThesis: thesis,
      goals,
      riskProfile,
      allocation: parsedAllocation,
      customSections: {
        executiveSummary: customExec || undefined,
        riskAssessment: customRisk || undefined,
        catalystsAndRisks: customCatalysts || undefined,
      },
    });
    setVersions(listThesisVersions());
    setVersionName(v.name);
    toast({ title: "Thesis version saved", description: name });
  };

  const handleDelete = (id: string) => {
    deleteThesisVersion(id);
    setVersions(listThesisVersions());
  };

  const generate = async () => {
    if (!Object.keys(parsedAllocation).length) {
      toast({ title: "Allocation required", description: "Add at least one symbol + weight.", variant: "destructive" });
      return;
    }
    if (strictAllocation && sumOff) {
      toast({
        title: "Allocation does not sum to 1",
        description: `Current total is ${(sumWeights * 100).toFixed(2)}%. Disable strict mode to normalise automatically.`,
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const savedVersion = versionName.trim() ? saveThesisVersion({
        id: versions.find((x) => x.name === versionName.trim())?.id,
        name: versionName.trim(),
        portfolioName,
        strategyThesis: thesis,
        goals,
        riskProfile,
        allocation: parsedAllocation,
        customSections: {
          executiveSummary: customExec || undefined,
          riskAssessment: customRisk || undefined,
          catalystsAndRisks: customCatalysts || undefined,
        },
      }) : undefined;
      if (savedVersion) setVersions(listThesisVersions());

      const res = generatePortfolioMemo({
        allocation: parsedAllocation,
        strategyThesis: thesis,
        goals,
        riskProfile,
        portfolioName,
        currency,
        simulation,
        customSections: {
          executiveSummary: customExec || undefined,
          riskAssessment: customRisk || undefined,
          catalystsAndRisks: customCatalysts || undefined,
        },
        allocationStrict: strictAllocation,
        thesisVersion: savedVersion
          ? { id: savedVersion.id, label: savedVersion.name, savedAt: savedVersion.savedAt }
          : undefined,
        download: false,
      });

      // Optional per-instrument deep-dive: fetch fundamentals + valuation +
      // AI thesis for every ticker in parallel, then embed them in the same PDF.
      let deepDives: Record<string, InstrumentDeepDive> | undefined;
      if (includeDeepDive) {
        const symbols = Object.keys(parsedAllocation);
        toast({
          title: "Fetching instrument analysis",
          description: `Pulling deep-dive for ${symbols.length} ticker${symbols.length === 1 ? "" : "s"}…`,
        });
        const settled = await Promise.allSettled(
          symbols.map((sym) =>
            supabase.functions
              .invoke<InstrumentDeepDive>("deep-analysis", { body: { symbol: sym } })
              .then((r) => {
                if (r.error) throw r.error;
                return { sym, data: r.data as InstrumentDeepDive | null };
              }),
          ),
        );
        deepDives = {};
        for (const s of settled) {
          if (s.status === "fulfilled" && s.value.data) {
            deepDives[s.value.sym] = s.value.data;
          }
        }
      }

      // Render the polished PDF server-side from the structured analysis object.
      await requestMemoPdf(
        legacyPortfolioToMemoInput({
          allocation: parsedAllocation,
          strategyThesis: thesis,
          goals,
          riskProfile,
          portfolioName,
          currency,
          customSections: {
            executiveSummary: customExec || undefined,
            riskAssessment: customRisk || undefined,
            catalystsAndRisks: customCatalysts || undefined,
          },
        }, deepDives),
      );
      if (exportData) downloadMemoCsvBundle(res.data);
      toast({
        title: "Portfolio memo generated",
        description: res.normalisationNote ?? "PDF saved to your downloads.",
      });
      onOpenChange(false);
    } catch (err) {
      console.error("[PortfolioMemoBuilder] failed", err);
      toast({
        title: "Memo generation failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Generate Portfolio Memo
          </DialogTitle>
          <DialogDescription>
            Compose a single comprehensive investment memo PDF from a target allocation, thesis, goals
            and risk profile. Customise individual chapters and save the exact thesis as a version so
            you can regenerate the same memo later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Portfolio name</Label>
              <Input value={portfolioName} onChange={(e) => setPortfolioName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 4))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Risk profile</Label>
                <Select value={riskProfile} onValueChange={setRiskProfile}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RISK_PROFILES.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Strategy thesis</Label>
            <Textarea
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="Executive narrative: what the strategy is, why it should work, regime assumptions, key bets…"
              rows={5}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Investor goals</Label>
            <div className="flex gap-2">
              <Input
                value={goalsInput}
                onChange={(e) => setGoalsInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addGoal())}
                placeholder="e.g. capital preservation, retire by 60, inflation hedge"
              />
              <Button type="button" size="sm" variant="outline" onClick={addGoal}>Add</Button>
            </div>
            {goals.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {goals.map((g) => (
                  <Badge key={g} variant="secondary" className="gap-1">
                    {g}
                    <button onClick={() => setGoals((p) => p.filter((x) => x !== g))} aria-label={`Remove ${g}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Allocation</Label>
              <div className="flex items-center gap-3 text-[11px]">
                <span className={sumOff ? "text-warning" : "text-success"}>
                  Sum: {(sumWeights * 100).toFixed(2)}%
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox checked={strictAllocation} onCheckedChange={(v) => setStrictAllocation(Boolean(v))} />
                  <span>Reject if not 100%</span>
                </label>
              </div>
            </div>
            <Card className="p-2 space-y-1.5">
              {allocationRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={row.symbol}
                    onChange={(e) => updateRow(i, "symbol", e.target.value.toUpperCase())}
                    placeholder="SWDA.MI"
                    className="h-8 font-mono uppercase"
                  />
                  <Input
                    value={row.weight}
                    onChange={(e) => updateRow(i, "weight", e.target.value)}
                    placeholder="0.30"
                    inputMode="decimal"
                    className="h-8 w-24 text-right font-mono"
                  />
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeRow(i)} aria-label="Remove">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" className="gap-1 h-8" onClick={addRow}>
                <Plus className="h-3.5 w-3.5" /> Add row
              </Button>
            </Card>
            {sumOff && !strictAllocation && (
              <div className="text-[11px] text-muted-foreground">
                Weights will be normalised to 100% and a note will be added to the PDF cover.
              </div>
            )}
          </div>

          <details className="rounded border border-border p-3">
            <summary className="cursor-pointer text-xs font-medium">Editable chapter wording (optional)</summary>
            <div className="space-y-3 pt-3">
              <div className="space-y-1">
                <Label className="text-xs">Executive Summary override</Label>
                <Textarea value={customExec} onChange={(e) => setCustomExec(e.target.value)} rows={3}
                  placeholder="Leave blank to use the strategy thesis above." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Risk Assessment addendum</Label>
                <Textarea value={customRisk} onChange={(e) => setCustomRisk(e.target.value)} rows={3}
                  placeholder="Appended to the auto-generated risk metrics." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Catalysts & Risks preface</Label>
                <Textarea value={customCatalysts} onChange={(e) => setCustomCatalysts(e.target.value)} rows={3}
                  placeholder="Rendered above the bullet lists." />
              </div>
            </div>
          </details>

          <div className="rounded border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Thesis versions</Label>
              <div className="flex items-center gap-2">
                <Input value={versionName} onChange={(e) => setVersionName(e.target.value)} placeholder="Version label" className="h-7 text-xs w-44" />
                <Button type="button" size="sm" variant="outline" className="gap-1 h-7" onClick={saveCurrentAsVersion}>
                  <Save className="h-3 w-3" /> Save version
                </Button>
              </div>
            </div>
            {versions.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No saved versions yet. Save one to regenerate the exact memo later.</p>
            ) : (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 text-xs hover:bg-muted/40 rounded px-1.5 py-1">
                    <button onClick={() => loadVersion(v)} className="flex-1 text-left">
                      <span className="font-medium">{v.name}</span>
                      <span className="text-muted-foreground"> · {new Date(v.savedAt).toLocaleString()}</span>
                    </button>
                    <button onClick={() => handleDelete(v.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete version">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <Checkbox checked={exportData} onCheckedChange={(v) => setExportData(Boolean(v))} />
            <FileDown className="h-3.5 w-3.5" />
            Also export underlying data as CSV (allocation, correlation matrix, simulation percentiles, scenarios)
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <Checkbox checked={includeDeepDive} onCheckedChange={(v) => setIncludeDeepDive(Boolean(v))} />
            <FileText className="h-3.5 w-3.5" />
            Advanced: append per-instrument deep-dive appendix (off by default — the memo is a single holistic strategy document)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={generate} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Generate PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PortfolioMemoBuilder;