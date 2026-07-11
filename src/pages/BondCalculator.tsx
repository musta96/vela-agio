import { useEffect, useMemo, useState } from "react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Calculator, TrendingDown, TrendingUp, Download, Save, Trash2, Plus, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, Legend,
} from "recharts";
import {
  bondMetrics, priceAtYield, yieldToMaturity, estimatePriceChange,
  type DayCount, type BondType,
} from "@/lib/bonds/pricing";
import { curveRate, priceFromCurve, bondMetricsFromCurve, type YieldCurve } from "@/lib/bonds/curve";
import { binomialBondPrice, binomialMetrics, solveOAS, type CallPutSchedule } from "@/lib/bonds/binomial";
import { TEXTBOOK_CASES, validateTextbook, scanConventionGrid, type ValidationRow, type ConventionGridResult } from "@/lib/bonds/validation";
import { listSavedBonds, insertSavedBond, deleteSavedBond, type SavedBondRow } from "@/lib/bonds/savedBonds";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { downloadCsv } from "@/lib/csvUtil";

const FREQ_OPTIONS = [
  { label: "Annual", value: 1 },
  { label: "Semi-annual", value: 2 },
  { label: "Quarterly", value: 4 },
  { label: "Monthly", value: 12 },
];
const DAYCOUNTS: DayCount[] = ["ACT/360", "ACT/365", "30/360"];
const BOND_TYPES: { value: BondType; label: string; note?: string }[] = [
  { value: "fixed", label: "Fixed-rate bullet" },
  { value: "zero", label: "Zero-coupon" },
  { value: "callable", label: "Callable (binomial tree)", note: "Prices via a log-normal short-rate tree with your call schedule." },
  { value: "putable", label: "Putable (binomial tree)", note: "Prices via a log-normal short-rate tree with your put schedule." },
];

const DEFAULT_CURVE: YieldCurve = [
  { t: 0.25, rate: 0.045 },
  { t: 0.5, rate: 0.045 },
  { t: 1, rate: 0.044 },
  { t: 2, rate: 0.042 },
  { t: 5, rate: 0.041 },
  { t: 10, rate: 0.043 },
  { t: 30, rate: 0.045 },
];
const PALETTE = ["hsl(var(--primary))", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4"];

function fmt(n: number, d = 2) {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function pct(n: number, d = 2) {
  return `${fmt(n * 100, d)}%`;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

interface SavedBond {
  id: string;
  name: string;
  color: string;
  face: number;
  couponRate: number;
  years: number;
  frequency: number;
  yieldRate: number;
  dayCount: DayCount;
  bondType: BondType;
  settlement: string;
  accruedFraction: number;
  volatility?: number;
  calls?: CallPutSchedule;
  puts?: CallPutSchedule;
  curve?: YieldCurve;
  oasBps?: number;
  useCurve?: boolean;
  /** Cloud row id when persisted; otherwise undefined (local-only). */
  cloudId?: string;
}

export default function BondCalculator() {
  const [face, setFace] = useState(1000);
  const [couponRate, setCouponRate] = useState(0.05); // 5%
  const [years, setYears] = useState(10);
  const [frequency, setFrequency] = useState(2);
  const [yieldRate, setYieldRate] = useState(0.05);
  const [dayCount, setDayCount] = useState<DayCount>("ACT/365");
  const [bondType, setBondType] = useState<BondType>("fixed");
  const [settlement, setSettlement] = useState<string>(today());
  const [priceMode, setPriceMode] = useState<"clean" | "dirty">("clean");

  // Embedded option model
  const [volatility, setVolatility] = useState(0.15); // 15% short-rate vol
  const [calls, setCalls] = useState<CallPutSchedule>([{ time: 3, price: 102 }]);
  const [puts, setPuts] = useState<CallPutSchedule>([{ time: 5, price: 100 }]);

  // Yield-curve overlay
  const [useCurve, setUseCurve] = useState(false);
  const [curve, setCurve] = useState<YieldCurve>(DEFAULT_CURVE);
  const [oasBps, setOasBps] = useState(0);

  // Validation
  const [selectedCase, setSelectedCase] = useState<string>(TEXTBOOK_CASES[0].id);
  const [refPrice, setRefPrice] = useState<number>(100);
  const [refDuration, setRefDuration] = useState<number>(0);

  const { user } = useAuth();
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Solve-for-yield inputs
  const [targetPrice, setTargetPrice] = useState(1000);

  // Compute the fraction of the current coupon period elapsed at settlement.
  // We approximate the previous coupon date as (settlement - 1 period) so the
  // user only needs to pick a settlement date rather than a schedule.
  const accruedFraction = useMemo(() => {
    if (bondType === "zero") return 0;
    const periodDays = 365 / frequency;
    const s = new Date(settlement + "T00:00:00Z");
    if (Number.isNaN(s.getTime())) return 0;
    // Days since a synthetic previous coupon date one period back.
    // Using midnight UTC keeps the fraction stable across DST boundaries.
    const now = new Date(today() + "T00:00:00Z");
    const diffDays = (s.getTime() - now.getTime()) / 86_400_000;
    // Wrap into [0, periodDays) so any settlement date maps to a valid fraction.
    const wrapped = ((diffDays % periodDays) + periodDays) % periodDays;
    return wrapped / periodDays;
  }, [settlement, frequency, bondType]);

  const inp = { face, couponRate, yearsToMaturity: years, frequency, dayCount, bondType, accruedFraction };
  const bulletMetrics = useMemo(
    () => bondMetrics({ ...inp, yieldRate }),
    [face, couponRate, years, frequency, yieldRate, dayCount, bondType, accruedFraction],
  );

  const isOptionBond = bondType === "callable" || bondType === "putable";
  const activeSchedule: CallPutSchedule | undefined = isOptionBond
    ? (bondType === "callable" ? calls : puts)
    : undefined;

  // Curve overlay metrics — always computable so users can toggle without lag.
  const curveMetrics = useMemo(
    () => bondMetricsFromCurve(inp, curve, oasBps),
    [face, couponRate, years, frequency, dayCount, bondType, accruedFraction, curve, oasBps],
  );

  // Binomial (callable/putable) metrics.
  const treeMetrics = useMemo(() => {
    if (!isOptionBond) return null;
    return binomialMetrics({
      ...inp, shortRate: yieldRate, volatility,
      calls: bondType === "callable" ? calls : undefined,
      puts: bondType === "putable" ? puts : undefined,
    });
  }, [isOptionBond, bondType, face, couponRate, years, frequency, dayCount, accruedFraction, yieldRate, volatility, calls, puts]);

  // The "primary" metrics view: curve > tree > bullet.
  const metrics = useMemo(() => {
    const ai = bulletMetrics.accruedInterest;
    if (useCurve) {
      return {
        price: curveMetrics.dirtyPrice,
        cleanPrice: curveMetrics.cleanPrice,
        dirtyPrice: curveMetrics.dirtyPrice,
        accruedInterest: ai,
        cashflows: bulletMetrics.cashflows,
        macaulayDuration: curveMetrics.effectiveDuration,
        modifiedDuration: curveMetrics.effectiveDuration,
        convexity: curveMetrics.effectiveConvexity,
        currentYield: curveMetrics.cleanPrice > 0 ? (couponRate * face) / curveMetrics.cleanPrice : 0,
        dv01: curveMetrics.dv01,
        engine: "curve" as const,
      };
    }
    if (treeMetrics) {
      return {
        price: treeMetrics.price,
        cleanPrice: treeMetrics.price - ai,
        dirtyPrice: treeMetrics.price,
        accruedInterest: ai,
        cashflows: bulletMetrics.cashflows,
        macaulayDuration: treeMetrics.effectiveDuration,
        modifiedDuration: treeMetrics.effectiveDuration,
        convexity: treeMetrics.effectiveConvexity,
        currentYield: treeMetrics.price > 0 ? (couponRate * face) / (treeMetrics.price - ai) : 0,
        dv01: treeMetrics.dv01,
        engine: "tree" as const,
      };
    }
    return { ...bulletMetrics, engine: "bullet" as const };
  }, [useCurve, curveMetrics, treeMetrics, bulletMetrics, face, couponRate]);
  // If user quotes clean, add back accrued before solving so YTM reprices dirty.
  const solverTarget = priceMode === "clean" ? targetPrice + metrics.accruedInterest : targetPrice;
  const solvedYtm = useMemo(
    () => yieldToMaturity(inp, solverTarget, yieldRate),
    [face, couponRate, years, frequency, solverTarget, yieldRate, dayCount, bondType, accruedFraction],
  );

  // Solve OAS (bps) when user gives a market price for an option bond.
  const solvedOas = useMemo(() => {
    if (!isOptionBond) return null;
    return solveOAS({
      ...inp, shortRate: yieldRate, volatility,
      calls: bondType === "callable" ? calls : undefined,
      puts: bondType === "putable" ? puts : undefined,
    }, solverTarget);
  }, [isOptionBond, bondType, face, couponRate, years, frequency, dayCount, accruedFraction, yieldRate, volatility, calls, puts, solverTarget]);

  // ── Comparison panel ──────────────────────────────────────────────────────
  const [saved, setSaved] = useState<SavedBond[]>([]);

  // Hydrate saved bonds from Lovable Cloud when signed in.
  useEffect(() => {
    let cancelled = false;
    if (!user) { setSaved([]); return; }
    setLoadingSaved(true);
    listSavedBonds()
      .then((rows) => {
        if (cancelled) return;
        setSaved(rows.map((r: SavedBondRow, i) => ({
          id: r.id, cloudId: r.id, name: r.name,
          color: r.color || PALETTE[i % PALETTE.length],
          face: r.face, couponRate: r.couponRate, years: r.years, frequency: r.frequency,
          yieldRate: r.yieldRate, dayCount: r.dayCount as DayCount, bondType: r.bondType as BondType,
          settlement: r.settlement, accruedFraction: r.accruedFraction,
          volatility: r.volatility, calls: r.calls, puts: r.puts,
          curve: r.curve, oasBps: r.oasBps, useCurve: r.useCurve,
        })));
      })
      .catch((e) => toast({ title: "Couldn't load saved bonds", description: String(e?.message ?? e), variant: "destructive" }))
      .finally(() => { if (!cancelled) setLoadingSaved(false); });
    return () => { cancelled = true; };
  }, [user]);

  const saveCurrent = async () => {
    const color = PALETTE[saved.length % PALETTE.length];
    const name = `${bondType === "zero" ? "Zero" : `${(couponRate * 100).toFixed(2)}%`} · ${years}y · YTM ${(yieldRate * 100).toFixed(2)}%${useCurve ? " · curve" : ""}`;
    const payload = {
      face, couponRate, years, frequency, yieldRate, dayCount, bondType, settlement, accruedFraction,
      color, volatility, calls, puts, curve, oasBps, useCurve,
    };
    if (!user) {
      // Local-only fallback (in-memory) for signed-out users.
      setSaved((prev) => [...prev, { id: crypto.randomUUID(), name, ...payload }]);
      toast({ title: "Saved locally", description: "Sign in to sync bonds across devices." });
      return;
    }
    try {
      const row = await insertSavedBond(name, payload);
      setSaved((prev) => [...prev, {
        id: row.id, cloudId: row.id, name: row.name,
        color, face, couponRate, years, frequency, yieldRate, dayCount, bondType, settlement, accruedFraction,
        volatility, calls, puts, curve, oasBps, useCurve,
      }]);
      toast({ title: "Bond saved" });
    } catch (e) {
      toast({ title: "Save failed", description: String((e as Error).message), variant: "destructive" });
    }
  };

  const removeSaved = async (id: string) => {
    const row = saved.find((s) => s.id === id);
    setSaved((s) => s.filter((x) => x.id !== id));
    if (row?.cloudId) {
      try { await deleteSavedBond(row.cloudId); }
      catch (e) { toast({ title: "Delete failed", description: String((e as Error).message), variant: "destructive" }); }
    }
  };

  const clearAllSaved = async () => {
    const ids = saved.map((s) => s.cloudId).filter(Boolean) as string[];
    setSaved([]);
    for (const id of ids) { try { await deleteSavedBond(id); } catch { /* swallow */ } }
  };

  const priceYieldData = useMemo(() => {
    const min = Math.max(0.0025, yieldRate - 0.06);
    const max = yieldRate + 0.06;
    const step = (max - min) / 60;
    const points: Record<string, number>[] = [];
    for (let y = min; y <= max + 1e-9; y += step) {
      const row: Record<string, number> = { yPct: +(y * 100).toFixed(3) };
      row["Current"] = +priceAtYield(inp, y).toFixed(4);
      for (const s of saved) {
        row[s.name] = +priceAtYield(
          { face: s.face, couponRate: s.couponRate, yearsToMaturity: s.years, frequency: s.frequency, dayCount: s.dayCount, bondType: s.bondType, accruedFraction: s.accruedFraction },
          y,
        ).toFixed(4);
      }
      points.push(row);
    }
    return points;
  }, [face, couponRate, years, frequency, yieldRate, dayCount, bondType, accruedFraction, saved]);

  const cashflowData = useMemo(
    () => metrics.cashflows.map(cf => ({
      period: `P${cf.period}`,
      t: +cf.t.toFixed(3),
      Cashflow: +cf.amount.toFixed(2),
      "Present value": +cf.pv.toFixed(2),
    })),
    [metrics],
  );

  // Overlaid cashflow PVs across current + saved bonds, keyed by period index.
  const overlayCashflows = useMemo(() => {
    const maxN = Math.max(metrics.cashflows.length, ...saved.map((s) => {
      const n = s.bondType === "zero" ? 1 : Math.round(s.years * s.frequency);
      return n;
    }));
    const rows: Record<string, number | string>[] = [];
    for (let k = 1; k <= maxN; k++) {
      const row: Record<string, number | string> = { period: `P${k}` };
      const curr = metrics.cashflows.find((c) => c.period === k);
      if (curr) row["Current"] = +curr.pv.toFixed(2);
      for (const s of saved) {
        const m = bondMetrics({
          face: s.face, couponRate: s.couponRate, yearsToMaturity: s.years, frequency: s.frequency,
          yieldRate: s.yieldRate, dayCount: s.dayCount, bondType: s.bondType, accruedFraction: s.accruedFraction,
        });
        const cf = m.cashflows.find((c) => c.period === k);
        if (cf) row[s.name] = +cf.pv.toFixed(2);
      }
      rows.push(row);
    }
    return rows;
  }, [metrics, saved]);

  const shocks = [-200, -100, -50, -25, 25, 50, 100, 200];
  const shockRows = shocks.map(bp => {
    const est = estimatePriceChange(metrics, bp);
    const exact = priceAtYield(inp, yieldRate + bp / 10000);
    return {
      bp,
      est: est.pct,
      estPrice: metrics.price + est.dollar,
      exact,
      exactPct: metrics.price > 0 ? (exact - metrics.price) / metrics.price : 0,
    };
  });

  const premiumDiscount = metrics.price > face
    ? { label: "Premium", tone: "default" as const, icon: TrendingUp }
    : metrics.price < face
    ? { label: "Discount", tone: "secondary" as const, icon: TrendingDown }
    : { label: "Par", tone: "outline" as const, icon: TrendingUp };

  // ── Exports ───────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ["Bond Yield & Pricing Calculator — export"],
      ["Generated", new Date().toISOString()],
      [],
      ["Assumptions"],
      ["Face value", face],
      ["Coupon rate", couponRate],
      ["Years to maturity", years],
      ["Frequency (per yr)", frequency],
      ["Yield to maturity", yieldRate],
      ["Day count", dayCount],
      ["Bond type", bondType],
      ["Settlement", settlement],
      ["Accrued fraction", accruedFraction.toFixed(6)],
      ["Price mode", priceMode],
      [],
      ["KPIs"],
      ["Dirty price", metrics.dirtyPrice],
      ["Clean price", metrics.cleanPrice],
      ["Accrued interest", metrics.accruedInterest],
      ["Macaulay duration (y)", metrics.macaulayDuration],
      ["Modified duration (y)", metrics.modifiedDuration],
      ["Convexity", metrics.convexity],
      ["DV01", metrics.dv01],
      ["Current yield", metrics.currentYield],
      [],
      ["Cashflows"],
      ["Period", "t (yrs)", "Amount", "Present value"],
      ...metrics.cashflows.map((c) => [c.period, c.t, c.amount, c.pv]),
      [],
      ["Rate shocks"],
      ["bps", "Est Δ%", "Est price", "Exact Δ%", "Exact price"],
      ...shockRows.map((r) => [r.bp, r.est, r.estPrice, r.exactPct, r.exact]),
    ];
    if (saved.length) {
      rows.push([], ["Saved comparisons"], ["Name", "Coupon", "Years", "Freq", "YTM", "Day count", "Type"]);
      for (const s of saved) rows.push([s.name, s.couponRate, s.years, s.frequency, s.yieldRate, s.dayCount, s.bondType]);
    }
    downloadCsv(`bond-calc-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const exportPdf = () => {
    // Lightweight print-to-PDF: open a print window rendering the same summary.
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) return;
    const line = (l: string, v: string) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${l}</td><td style="padding:4px 0;font-family:monospace">${v}</td></tr>`;
    const rows = metrics.cashflows.map((c) =>
      `<tr><td>P${c.period}</td><td>${c.t.toFixed(3)}</td><td style="text-align:right">${fmt(c.amount)}</td><td style="text-align:right">${fmt(c.pv)}</td></tr>`,
    ).join("");
    const shockHtml = shockRows.map((r) =>
      `<tr><td>${r.bp > 0 ? "+" : ""}${r.bp} bps</td><td style="text-align:right">${pct(r.est, 3)}</td><td style="text-align:right">${fmt(r.estPrice, 4)}</td><td style="text-align:right">${pct(r.exactPct, 3)}</td><td style="text-align:right">${fmt(r.exact, 4)}</td></tr>`,
    ).join("");
    const savedHtml = saved.length
      ? `<h3>Saved comparisons</h3><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th align="left">Name</th><th>Coupon</th><th>Years</th><th>YTM</th><th>Type</th></tr></thead><tbody>${saved.map((s) => `<tr><td>${s.name}</td><td align="right">${pct(s.couponRate)}</td><td align="right">${s.years}</td><td align="right">${pct(s.yieldRate)}</td><td align="right">${s.bondType}</td></tr>`).join("")}</tbody></table>`
      : "";
    w.document.write(`<!doctype html><html><head><title>Bond calc export</title>
      <style>body{font-family:system-ui,-apple-system,sans-serif;padding:32px;color:#111}h1{font-size:20px;margin:0 0 4px}h3{margin:24px 0 8px;font-size:14px}table{width:100%;font-size:12px;border-collapse:collapse}th,td{padding:4px 8px;border-bottom:1px solid #eee}</style>
    </head><body>
      <h1>Bond Yield & Pricing Calculator</h1>
      <p style="color:#666;font-size:12px">Generated ${new Date().toLocaleString()}</p>
      <h3>Assumptions</h3>
      <table>${line("Face value", fmt(face))}${line("Coupon rate", pct(couponRate))}${line("Years to maturity", String(years))}${line("Frequency", `${frequency}/yr`)}${line("YTM", pct(yieldRate, 3))}${line("Day count", dayCount)}${line("Bond type", bondType)}${line("Settlement", settlement)}${line("Price quote", priceMode)}</table>
      <h3>Key metrics</h3>
      <table>${line("Dirty price", fmt(metrics.dirtyPrice, 4))}${line("Clean price", fmt(metrics.cleanPrice, 4))}${line("Accrued interest", fmt(metrics.accruedInterest, 4))}${line("Modified duration", `${fmt(metrics.modifiedDuration)} y`)}${line("Macaulay duration", `${fmt(metrics.macaulayDuration)} y`)}${line("Convexity", fmt(metrics.convexity, 3))}${line("DV01", fmt(metrics.dv01, 4))}${line("Current yield", pct(metrics.currentYield, 3))}</table>
      <h3>Cashflows</h3>
      <table><thead><tr><th align="left">Period</th><th align="left">t</th><th align="right">Amount</th><th align="right">PV</th></tr></thead><tbody>${rows}</tbody></table>
      <h3>Rate shocks</h3>
      <table><thead><tr><th align="left">Shock</th><th align="right">Est Δ%</th><th align="right">Est price</th><th align="right">Exact Δ%</th><th align="right">Exact price</th></tr></thead><tbody>${shockHtml}</tbody></table>
      ${savedHtml}
      <script>window.onload=()=>{setTimeout(()=>window.print(),200)}</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO
        title="Bond Yield & Pricing Calculator | Vela.ai"
        description="Compute bond price, yield to maturity, Macaulay & modified duration, convexity and DV01 with interactive price-yield curve and cashflow charts."
        path="/bonds"
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          icon={Calculator}
          title="Bond Yield & Pricing Calculator"
          description="Model fixed-coupon bonds: price, YTM, duration, convexity and interest-rate sensitivity."
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={saveCurrent}>
            <Save className="h-4 w-4 mr-1.5" /> Save to compare
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm"><Download className="h-4 w-4 mr-1.5" /> Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCsv}>Download CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={exportPdf}>Download PDF (print)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* Inputs */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Bond inputs</CardTitle>
            <CardDescription>Day-count conventions, settlement and price mode drive clean vs dirty results.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>Bond type</Label>
              <Select value={bondType} onValueChange={(v) => setBondType(v as BondType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BOND_TYPES.map((b) => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {BOND_TYPES.find((b) => b.value === bondType)?.note && (
                <p className="text-[11px] text-muted-foreground">{BOND_TYPES.find((b) => b.value === bondType)?.note}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="face">Face value</Label>
              <Input id="face" type="number" min={1} value={face}
                onChange={e => setFace(Math.max(1, Number(e.target.value) || 0))} />
            </div>
            {bondType !== "zero" && (
              <div className="space-y-1.5">
                <Label>Coupon rate — {pct(couponRate, 2)}</Label>
                <Slider min={0} max={15} step={0.05}
                  value={[couponRate * 100]}
                  onValueChange={([v]) => setCouponRate(v / 100)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Years to maturity — {years}</Label>
              <Slider min={0.25} max={40} step={0.25}
                value={[years]}
                onValueChange={([v]) => setYears(v)} />
            </div>
            {bondType !== "zero" && (
              <div className="space-y-1.5">
                <Label>Coupon frequency (compounding)</Label>
                <Select value={String(frequency)} onValueChange={(v) => setFrequency(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQ_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Day count</Label>
                <Select value={dayCount} onValueChange={(v) => setDayCount(v as DayCount)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYCOUNTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settle">Settlement</Label>
                <Input id="settle" type="date" value={settlement} onChange={(e) => setSettlement(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Yield to maturity — {pct(yieldRate, 3)}</Label>
              <Slider min={0.1} max={20} step={0.05}
                value={[yieldRate * 100]}
                onValueChange={([v]) => setYieldRate(v / 100)} />
            </div>
            <div className="space-y-1.5">
              <Label>Price quotation</Label>
              <ToggleGroup type="single" value={priceMode} onValueChange={(v) => v && setPriceMode(v as "clean" | "dirty")} className="justify-start">
                <ToggleGroupItem value="clean" size="sm">Clean</ToggleGroupItem>
                <ToggleGroupItem value="dirty" size="sm">Dirty</ToggleGroupItem>
              </ToggleGroup>
              <p className="text-[11px] text-muted-foreground">
                Accrued: {fmt(metrics.accruedInterest, 4)} · {(accruedFraction * 100).toFixed(2)}% of period
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Results + charts */}
        <div className="space-y-6 min-w-0">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label={priceMode === "clean" ? "Clean price" : "Dirty price"}
              value={fmt(priceMode === "clean" ? metrics.cleanPrice : metrics.dirtyPrice, 4)}
              badge={<Badge variant={premiumDiscount.tone} className="text-[10px] gap-1"><premiumDiscount.icon className="h-3 w-3" />{premiumDiscount.label}</Badge>} />
            <Kpi label="Accrued interest" value={fmt(metrics.accruedInterest, 4)} />
            <Kpi label="Modified duration" value={`${fmt(metrics.modifiedDuration)} y`} />
            <Kpi label="Convexity" value={fmt(metrics.convexity, 3)} />
            <Kpi label="DV01 (per 1bp)" value={fmt(metrics.dv01, 4)} />
            <Kpi label="Macaulay duration" value={`${fmt(metrics.macaulayDuration)} y`} />
            <Kpi label="Current yield" value={pct(metrics.currentYield, 3)} />
            <Kpi label="Coupon payment" value={bondType === "zero" ? "—" : fmt((couponRate * face) / frequency, 2)} />
          </div>

          {saved.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Saved comparisons</span>
                  <Button variant="ghost" size="sm" onClick={() => setSaved([])}><Trash2 className="h-4 w-4 mr-1" /> Clear all</Button>
                </CardTitle>
                <CardDescription>These overlay on the price-yield and cashflow charts below.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {saved.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground">{s.dayCount} · {s.bondType}</span>
                    <button className="text-muted-foreground hover:text-destructive" onClick={() => removeSaved(s.id)} aria-label="Remove">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="curve">
            <TabsList>
              <TabsTrigger value="curve">Price / Yield curve</TabsTrigger>
              <TabsTrigger value="cashflows">Cashflows</TabsTrigger>
              <TabsTrigger value="shocks">Rate shocks</TabsTrigger>
              <TabsTrigger value="solver">Solve for YTM</TabsTrigger>
            </TabsList>

            <TabsContent value="curve">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Price sensitivity to yield</CardTitle>
                  <CardDescription>Vertical line marks the current YTM. Saved bonds overlay for comparison.</CardDescription>
                </CardHeader>
                <CardContent className="h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={priceYieldData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="yPct" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => Number(v).toFixed(0)} />
                      <Tooltip
                        formatter={(v: number) => fmt(v, 4)}
                        labelFormatter={(l) => `Yield ${l}%`}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine x={+(yieldRate * 100).toFixed(3)} stroke="hsl(var(--primary))" strokeDasharray="4 3" />
                      <ReferenceLine y={face} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 4" label={{ value: "Par", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Line type="monotone" dataKey="Current" stroke="hsl(var(--primary))" dot={false} strokeWidth={1.8} />
                      {saved.map((s) => (
                        <Line key={s.id} type="monotone" dataKey={s.name} stroke={s.color} dot={false} strokeWidth={1.4} strokeDasharray="4 3" />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cashflows">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Coupon & principal cashflows</CardTitle>
                  <CardDescription>Present-value cashflows at the current YTM, overlaid with any saved bonds.</CardDescription>
                </CardHeader>
                <CardContent className="h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={saved.length ? overlayCashflows : cashflowData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="period" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(v: number) => fmt(v, 2)}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {saved.length === 0 && <Bar dataKey="Cashflow" fill="hsl(var(--muted-foreground))" opacity={0.5} />}
                      {saved.length === 0
                        ? <Bar dataKey="Present value" fill="hsl(var(--primary))" />
                        : <>
                            <Bar dataKey="Current" fill="hsl(var(--primary))" />
                            {saved.map((s) => <Bar key={s.id} dataKey={s.name} fill={s.color} />)}
                          </>}
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="shocks">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Interest-rate shock table</CardTitle>
                  <CardDescription>Duration+convexity estimate vs. exact repricing.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="text-left py-2 font-medium">Shock</th>
                        <th className="text-right py-2 font-medium">Est. Δ%</th>
                        <th className="text-right py-2 font-medium">Est. price</th>
                        <th className="text-right py-2 font-medium">Exact Δ%</th>
                        <th className="text-right py-2 font-medium">Exact price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shockRows.map(r => (
                        <tr key={r.bp} className="border-b last:border-0">
                          <td className="py-2">{r.bp > 0 ? `+${r.bp}` : r.bp} bps</td>
                          <td className={`text-right font-mono ${r.est >= 0 ? "text-success" : "text-destructive"}`}>{pct(r.est, 3)}</td>
                          <td className="text-right font-mono">{fmt(r.estPrice, 4)}</td>
                          <td className={`text-right font-mono ${r.exactPct >= 0 ? "text-success" : "text-destructive"}`}>{pct(r.exactPct, 3)}</td>
                          <td className="text-right font-mono">{fmt(r.exact, 4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="solver">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Solve YTM from market price</CardTitle>
                  <CardDescription>Enter a {priceMode} market price; we add back accrued if needed, then solve YTM.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-1.5">
                      <Label htmlFor="tgt">Market {priceMode} price</Label>
                      <Input id="tgt" type="number" min={0.01} step="0.01" value={targetPrice}
                        onChange={e => setTargetPrice(Math.max(0.01, Number(e.target.value) || 0))} />
                    </div>
                    <button
                      type="button"
                      className="self-end h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
                      onClick={() => setYieldRate(solvedYtm)}
                    >
                      Apply YTM to inputs
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Kpi label="Implied YTM" value={pct(solvedYtm, 4)} />
                    <Kpi label="Repriced dirty" value={fmt(priceAtYield(inp, solvedYtm), 4)} />
                    <Kpi label="Coupon vs YTM"
                      value={couponRate > solvedYtm ? "Coupon > YTM" : couponRate < solvedYtm ? "Coupon < YTM" : "Coupon = YTM"} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Educational tool — assumes flat yield curve, no taxes and no credit spread shocks. Callable/putable pricing currently uses bullet cashflows; embedded-option pricing is planned.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, badge }: { label: string; value: string; badge?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardDescription className="text-[11px] uppercase tracking-wide">{label}</CardDescription>
        <CardTitle className="text-xl font-mono flex items-center gap-2">
          {value}{badge}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}