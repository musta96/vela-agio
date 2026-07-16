import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Gauge, Loader2, TrendingUp, TrendingDown, RefreshCw, BellPlus, Users, ChevronDown, ChevronRight, Download, LineChart as LineChartIcon, SlidersHorizontal, History, AlertTriangle, FileDown, ArrowDown, ArrowUp } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine,
} from "recharts";
import { computeRoic, computeWacc, pct, roicWaccSpread, type WaccInputs } from "@/lib/valuation/roicWacc";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PROXY = "https://api.allorigins.win/raw?url=";

type YearRow = {
  year: string;
  endDate: string;
  roic: number | null;
  nopat: number | null;
  ic: number | null;
  ebit: number | null;
  taxRate: number | null;
  equityBook: number | null;
  ltDebt: number | null;
  stDebt: number | null;
  cash: number | null;
  totalDebt: number | null;
};

interface Snapshot {
  ebit: number | null;
  effTaxRate: number | null;
  equity: number | null;
  ltDebt: number | null;
  stDebt: number | null;
  cash: number | null;
  marketCap: number | null;
  beta: number | null;
}

function num(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v?.raw === "number") return v.raw;
  return null;
}

function fmtB(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "-";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  return v.toLocaleString();
}

async function fetchSnapshot(symbol: string): Promise<{ snap: Snapshot; history: YearRow[]; raw: any } | null> {
  const modules = "incomeStatementHistory,balanceSheetHistory,financialData,summaryDetail,defaultKeyStatistics,price,assetProfile";
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
  const r = await fetch(`${PROXY}${encodeURIComponent(url)}`);
  if (!r.ok) return null;
  const j = await r.json();
  const data = j?.quoteSummary?.result?.[0];
  if (!data) return null;
  const inc = data.incomeStatementHistory?.incomeStatementHistory ?? [];
  const bs = data.balanceSheetHistory?.balanceSheetStatements ?? [];
  const sd = data.summaryDetail ?? {};
  const price = data.price ?? {};
  const b0 = bs[0] ?? {};
  const inc0 = inc[0] ?? {};
  const tax0 = num(inc0.incomeTaxExpense);
  const pretax0 = num(inc0.incomeBeforeTax);
  const effTax = tax0 != null && pretax0 && pretax0 !== 0 ? tax0 / pretax0 : null;
  const snap: Snapshot = {
    ebit: num(inc0.operatingIncome) ?? num(inc0.ebit),
    effTaxRate: effTax,
    equity: num(b0.totalStockholderEquity),
    ltDebt: num(b0.longTermDebt),
    stDebt: num(b0.shortLongTermDebt),
    cash: num(b0.cash),
    marketCap: num(price.marketCap) ?? num(sd.marketCap),
    beta: num(sd.beta) ?? num(data.defaultKeyStatistics?.beta),
  };
  const history: YearRow[] = inc.slice(0, 4).map((row: any, i: number) => {
    const b = bs[i] ?? {};
    const ebit = num(row.operatingIncome) ?? num(row.ebit);
    const tax = num(row.incomeTaxExpense);
    const pretax = num(row.incomeBeforeTax);
    const rate = tax != null && pretax && pretax !== 0 ? tax / pretax : null;
    const equityBook = num(b.totalStockholderEquity);
    const ltDebt = num(b.longTermDebt);
    const stDebt = num(b.shortLongTermDebt);
    const cash = num(b.cash);
    const rr = computeRoic({
      ebit, taxRate: rate,
      totalEquity: equityBook,
      longTermDebt: ltDebt,
      shortLongTermDebt: stDebt,
      cash,
    });
    const totalDebt = (ltDebt ?? 0) + (stDebt ?? 0);
    return {
      year: row.endDate?.fmt?.slice(0, 4) ?? "-",
      endDate: row.endDate?.fmt ?? "-",
      roic: rr.roic, nopat: rr.nopat, ic: rr.investedCapital,
      ebit, taxRate: rate,
      equityBook, ltDebt, stDebt, cash,
      totalDebt: totalDebt > 0 ? totalDebt : null,
    };
  }).reverse();
  return { snap, history, raw: data };
}

function interpretSpread(spread: number | null): string {
  if (spread == null) return "Insufficient data.";
  const pp = (spread * 100).toFixed(1);
  if (spread >= 0.02) return `Value-creating: ROIC exceeds WACC by ${pp} pp.`;
  if (spread >= 0) return `Marginal: ROIC roughly matches WACC (${pp} pp spread).`;
  return `Value-destroying: ROIC below WACC by ${pp} pp.`;
}

export function RoicWaccPanel({ symbol }: { symbol: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<YearRow[]>([]);
  const [showDrilldown, setShowDrilldown] = useState(false);

  // Editable WACC assumptions (percent inputs in the UI, decimal internally).
  const [rfPct, setRfPct] = useState(4.2);
  const [erpPct, setErpPct] = useState(5.0);
  const [taxPct, setTaxPct] = useState<number | "">("");
  const [betaIn, setBetaIn] = useState<number | "">("");
  const [kdPct, setKdPct] = useState(5.0);
  const [assumptionsDirty, setAssumptionsDirty] = useState(false);

  // Peer comparison.
  const [peerInput, setPeerInput] = useState("");
  type PeerRow = {
    sym: string;
    roic: number | null;
    wacc: number | null;
    spread: number | null;
    trend: Array<{ year: string; spread: number | null }>;
    trendPP: number | null; // Δ pp from oldest to newest spread in `trend`.
    loading?: boolean;
    err?: string;
  };
  const [peers, setPeers] = useState<PeerRow[]>([]);
  const [peerSort, setPeerSort] = useState<"spread" | "trend">("spread");

  // Alert config UI toggle.
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertWindowDays, setAlertWindowDays] = useState(30);
  const [alertThresholdBps, setAlertThresholdBps] = useState(100);
  const [alertDirection, setAlertDirection] = useState<"either" | "improve" | "worsen">("either");
  // Minimum bars (years, in the annual backtest) that must elapse between two triggers.
  const [alertMinHoldYears, setAlertMinHoldYears] = useState(0);
  const [alertSaving, setAlertSaving] = useState(false);

  // Sensitivity ranges.
  const [sensOpen, setSensOpen] = useState(false);
  const [sensRf, setSensRf] = useState<[number, number]>([3.5, 5.0]);
  const [sensErp, setSensErp] = useState<[number, number]>([4.0, 6.5]);
  const [sensTax, setSensTax] = useState<[number, number]>([18, 28]);
  const [sensBeta, setSensBeta] = useState<[number, number]>([0.8, 1.4]);

  // Filing-field drilldown toggle.
  const [fieldMapOpen, setFieldMapOpen] = useState(false);

  // Refs used by the PDF export to snapshot the on-screen chart SVG.
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // ------------------------------------------------------------------
  // Per-ticker persistence of rf / ERP / tax / β / kd slider settings.
  // ------------------------------------------------------------------
  const storageKey = useMemo(() => `roic-wacc:${symbol.toUpperCase()}`, [symbol]);
  const hydratedRef = useRef(false);
  useEffect(() => {
    // Reset hydration flag whenever the ticker changes so we re-load its
    // saved sliders (or fall back to filing defaults inside `load`).
    hydratedRef.current = false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw) as {
          rfPct?: number; erpPct?: number; kdPct?: number;
          taxPct?: number | ""; betaIn?: number | "";
        };
        if (typeof s.rfPct === "number") setRfPct(s.rfPct);
        if (typeof s.erpPct === "number") setErpPct(s.erpPct);
        if (typeof s.kdPct === "number") setKdPct(s.kdPct);
        if (s.taxPct === "" || typeof s.taxPct === "number") setTaxPct(s.taxPct);
        if (s.betaIn === "" || typeof s.betaIn === "number") setBetaIn(s.betaIn);
        // Mark dirty so `load` won't stomp the restored values with filing defaults.
        setAssumptionsDirty(true);
      }
      hydratedRef.current = true;
    } catch { hydratedRef.current = true; }
  }, [storageKey]);
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ rfPct, erpPct, kdPct, taxPct, betaIn }));
    } catch { /* quota / private mode */ }
  }, [storageKey, rfPct, erpPct, kdPct, taxPct, betaIn]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const res = await fetchSnapshot(symbol);
    if (!res) { setErr("Not covered for this symbol."); setLoading(false); return; }
    setSnap(res.snap); setHistory(res.history);
    // Seed defaults from filing when not overridden.
    if (!assumptionsDirty) {
      if (res.snap.effTaxRate != null) setTaxPct(+(res.snap.effTaxRate * 100).toFixed(2));
      if (res.snap.beta != null) setBetaIn(+res.snap.beta.toFixed(2));
    }
    setLoading(false);
  }, [symbol, assumptionsDirty]);

  useEffect(() => { if (symbol) load(); }, [symbol, load]);

  const inputs: WaccInputs & { taxRateOverride?: number } | null = useMemo(() => {
    if (!snap) return null;
    const totalDebt = (snap.ltDebt ?? 0) + (snap.stDebt ?? 0);
    return {
      marketCap: snap.marketCap,
      totalDebt,
      beta: betaIn === "" ? snap.beta : Number(betaIn),
      riskFreeRate: rfPct / 100,
      equityRiskPremium: erpPct / 100,
      preTaxCostOfDebt: kdPct / 100,
      taxRate: taxPct === "" ? snap.effTaxRate : Number(taxPct) / 100,
    };
  }, [snap, rfPct, erpPct, kdPct, taxPct, betaIn]);

  const { roicLatest, wacc, spread } = useMemo(() => {
    if (!snap || !inputs) return { roicLatest: null as ReturnType<typeof computeRoic> | null, wacc: null as ReturnType<typeof computeWacc> | null, spread: null as number | null };
    const roic = computeRoic({
      ebit: snap.ebit,
      taxRate: inputs.taxRate,
      totalEquity: snap.equity,
      longTermDebt: snap.ltDebt,
      shortLongTermDebt: snap.stDebt,
      cash: snap.cash,
    });
    const w = computeWacc(inputs);
    return { roicLatest: roic, wacc: w, spread: roicWaccSpread(roic.roic, w.wacc) };
  }, [snap, inputs]);

  // Per-year ROIC / WACC / spread. Historic years use book equity for the
  // equity weight (market caps are not returned for historic snapshots), so
  // the series is capital-structure-adjusted but the beta/rf/erp are held
  // constant at the user's current assumptions.
  const timeSeries = useMemo(() => {
    const rf = rfPct / 100;
    const erp = erpPct / 100;
    const kd = kdPct / 100;
    const beta = betaIn === "" ? (snap?.beta ?? 1) : Number(betaIn);
    return history.map((r) => {
      const tax = taxPct === "" ? (r.taxRate ?? snap?.effTaxRate ?? 0.21) : Number(taxPct) / 100;
      const w = computeWacc({
        marketCap: r.equityBook,
        totalDebt: r.totalDebt,
        beta, riskFreeRate: rf, equityRiskPremium: erp,
        preTaxCostOfDebt: kd, taxRate: tax,
      });
      const spr = roicWaccSpread(r.roic, w.wacc);
      return {
        year: r.year,
        endDate: r.endDate,
        roicPct: r.roic != null ? +(r.roic * 100).toFixed(2) : null,
        waccPct: w.wacc != null ? +(w.wacc * 100).toFixed(2) : null,
        spreadPct: spr != null ? +(spr * 100).toFixed(2) : null,
        spread: spr,
      };
    });
  }, [history, rfPct, erpPct, kdPct, taxPct, betaIn, snap]);

  // Backtest of the alert rule over the annual series.
  const backtest = useMemo(() => {
    const pts = timeSeries.filter((r) => r.spread != null) as Array<{ year: string; endDate: string; spread: number }>;
    if (pts.length < 2) return { count: 0, events: [] as Array<{ year: string; delta: number; direction: "improve" | "worsen" }> };
    const thr = alertThresholdBps / 10000;
    const events: Array<{ year: string; delta: number; direction: "improve" | "worsen" }> = [];
    let lastIdx = -Infinity;
    for (let i = 1; i < pts.length; i++) {
      const d = pts[i].spread - pts[i - 1].spread;
      const dir: "improve" | "worsen" = d >= 0 ? "improve" : "worsen";
      const pass =
        alertDirection === "either" ? Math.abs(d) >= thr :
        alertDirection === "improve" ? d >= thr :
        -d >= thr;
      // Enforce a minimum-hold window: after a trigger, skip further events
      // until at least `alertMinHoldYears` bars have elapsed.
      if (pass && i - lastIdx >= Math.max(1, alertMinHoldYears)) {
        events.push({ year: pts[i].year, delta: d, direction: dir });
        lastIdx = i;
      }
    }
    return { count: events.length, events };
  }, [timeSeries, alertThresholdBps, alertDirection, alertMinHoldYears]);

  // ------------------------------------------------------------------
  // Data-quality scan — flag ticker-years where any input is missing/derived.
  // ------------------------------------------------------------------
  const dataQuality = useMemo(() => {
    const issues: Array<{ year: string; missing: string[]; estimated: string[] }> = [];
    for (const r of history) {
      const missing: string[] = [];
      const estimated: string[] = [];
      if (r.ebit == null) missing.push("EBIT");
      if (r.equityBook == null) missing.push("equity");
      if (r.ltDebt == null && r.stDebt == null) missing.push("debt");
      if (r.cash == null) estimated.push("cash → assumed 0");
      if (r.taxRate == null) estimated.push("tax rate → falls back to statutory");
      if (missing.length || estimated.length) issues.push({ year: r.year, missing, estimated });
    }
    const affectedYears = issues.map((i) => i.year);
    const badBacktestSteps = timeSeries
      .map((r, i) => ({ ...r, i }))
      .filter((r) => r.i > 0 && (r.spread == null || timeSeries[r.i - 1]?.spread == null))
      .map((r) => r.year);
    return { issues, affectedYears, badBacktestSteps };
  }, [history, timeSeries]);

  // Sensitivity: 2^4 corner sweep + one-at-a-time driver sweep.
  const sensitivity = useMemo(() => {
    if (!snap) return null;
    const totalDebt = (snap.ltDebt ?? 0) + (snap.stDebt ?? 0);
    const compute = (rf: number, erp: number, tax: number, beta: number) => {
      const r = computeRoic({
        ebit: snap.ebit, taxRate: tax / 100,
        totalEquity: snap.equity, longTermDebt: snap.ltDebt,
        shortLongTermDebt: snap.stDebt, cash: snap.cash,
      });
      const w = computeWacc({
        marketCap: snap.marketCap, totalDebt, beta,
        riskFreeRate: rf / 100, equityRiskPremium: erp / 100,
        preTaxCostOfDebt: kdPct / 100, taxRate: tax / 100,
      });
      return roicWaccSpread(r.roic, w.wacc);
    };
    const corners: number[] = [];
    for (const rf of sensRf) for (const erp of sensErp) for (const tax of sensTax) for (const beta of sensBeta) {
      const s = compute(rf, erp, tax, beta);
      if (s != null) corners.push(s);
    }
    if (!corners.length) return null;
    const min = Math.min(...corners), max = Math.max(...corners);
    const midRf = (sensRf[0] + sensRf[1]) / 2;
    const midErp = (sensErp[0] + sensErp[1]) / 2;
    const midTax = (sensTax[0] + sensTax[1]) / 2;
    const midBeta = (sensBeta[0] + sensBeta[1]) / 2;
    const sweep = (range: [number, number], fix: (v: number) => number | null) => {
      const steps = 5;
      const [lo, hi] = range;
      return Array.from({ length: steps }, (_, i) => {
        const x = lo + ((hi - lo) * i) / (steps - 1);
        return { x, spread: fix(x) };
      });
    };
    const drivers = {
      rf: sweep(sensRf, (v) => compute(v, midErp, midTax, midBeta)),
      erp: sweep(sensErp, (v) => compute(midRf, v, midTax, midBeta)),
      tax: sweep(sensTax, (v) => compute(midRf, midErp, v, midBeta)),
      beta: sweep(sensBeta, (v) => compute(midRf, midErp, midTax, v)),
    };
    return { min, max, drivers };
  }, [snap, sensRf, sensErp, sensTax, sensBeta, kdPct]);

  const resetAssumptions = () => {
    setRfPct(4.2); setErpPct(5.0); setKdPct(5.0);
    setTaxPct(snap?.effTaxRate != null ? +(snap.effTaxRate * 100).toFixed(2) : "");
    setBetaIn(snap?.beta != null ? +snap.beta.toFixed(2) : "");
    setAssumptionsDirty(false);
  };
  const markDirty = () => setAssumptionsDirty(true);

  const loadPeers = async () => {
    const syms = peerInput.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 8);
    if (!syms.length) { toast({ title: "Enter one or more peer tickers (comma-separated)" }); return; }
    setPeers(syms.map((sym) => ({ sym, roic: null, wacc: null, spread: null, trend: [], trendPP: null, loading: true })));
    const rows = await Promise.all(syms.map(async (sym) => {
      try {
        const res = await fetchSnapshot(sym);
        if (!res) return { sym, roic: null, wacc: null, spread: null, trend: [], trendPP: null, err: "no data" } as PeerRow;
        const totalDebt = (res.snap.ltDebt ?? 0) + (res.snap.stDebt ?? 0);
        const currentTax = taxPct === "" ? res.snap.effTaxRate : Number(taxPct) / 100;
        const currentBeta = res.snap.beta;
        const roic = computeRoic({
          ebit: res.snap.ebit,
          taxRate: currentTax,
          totalEquity: res.snap.equity,
          longTermDebt: res.snap.ltDebt,
          shortLongTermDebt: res.snap.stDebt,
          cash: res.snap.cash,
        });
        const w = computeWacc({
          marketCap: res.snap.marketCap,
          totalDebt,
          beta: currentBeta,
          riskFreeRate: rfPct / 100,
          equityRiskPremium: erpPct / 100,
          preTaxCostOfDebt: kdPct / 100,
          taxRate: currentTax,
        });
        // Per-year trend (spread over the last four filings) using same assumptions.
        const trend = res.history.map((r) => {
          const t = taxPct === "" ? (r.taxRate ?? res.snap.effTaxRate ?? 0.21) : Number(taxPct) / 100;
          const ww = computeWacc({
            marketCap: r.equityBook, totalDebt: r.totalDebt,
            beta: currentBeta ?? 1,
            riskFreeRate: rfPct / 100, equityRiskPremium: erpPct / 100,
            preTaxCostOfDebt: kdPct / 100, taxRate: t,
          });
          return { year: r.year, spread: roicWaccSpread(r.roic, ww.wacc) };
        });
        const spreads = trend.map((p) => p.spread).filter((v): v is number => v != null);
        const trendPP = spreads.length >= 2 ? (spreads[spreads.length - 1] - spreads[0]) * 100 : null;
        return { sym, roic: roic.roic, wacc: w.wacc, spread: roicWaccSpread(roic.roic, w.wacc), trend, trendPP } as PeerRow;
      } catch {
        return { sym, roic: null, wacc: null, spread: null, trend: [], trendPP: null, err: "error" } as PeerRow;
      }
    }));
    setPeers(rows);
  };

  const peerAvg = useMemo(() => {
    const nums = (key: "roic" | "wacc" | "spread") => peers.map((p) => p[key]).filter((v): v is number => v != null && Number.isFinite(v));
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    return { roic: avg(nums("roic")), wacc: avg(nums("wacc")), spread: avg(nums("spread")) };
  }, [peers]);

  // Combined ranking list: `this` ticker + peers, sorted by chosen key.
  const rankedTickers = useMemo(() => {
    const baseTrend = timeSeries.map((r) => ({ year: r.year, spread: r.spread }));
    const baseSpreads = baseTrend.map((p) => p.spread).filter((v): v is number => v != null);
    const baseTrendPP = baseSpreads.length >= 2 ? (baseSpreads[baseSpreads.length - 1] - baseSpreads[0]) * 100 : null;
    const rows: Array<{
      sym: string; roic: number | null; wacc: number | null; spread: number | null;
      trend: Array<{ year: string; spread: number | null }>; trendPP: number | null;
      isBase: boolean; err?: string;
    }> = [
      {
        sym: symbol.toUpperCase(),
        roic: roicLatest?.roic ?? null,
        wacc: wacc?.wacc ?? null,
        spread: spread ?? null,
        trend: baseTrend,
        trendPP: baseTrendPP,
        isBase: true,
      },
      ...peers.map((p) => ({ ...p, isBase: false })),
    ];
    const key: "spread" | "trendPP" = peerSort === "spread" ? "spread" : "trendPP";
    rows.sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    });
    return rows;
  }, [peers, peerSort, symbol, roicLatest, wacc, spread, timeSeries]);

  const downloadCsv = () => {
    const esc = (v: any) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const asDec = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "" : x.toFixed(6));
    const asPct = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "" : (x * 100).toFixed(2));
    const rf = rfPct / 100;
    const erp = erpPct / 100;
    const kd = kdPct / 100;
    const tax = taxPct === "" ? (snap?.effTaxRate ?? null) : Number(taxPct) / 100;
    const beta = betaIn === "" ? (snap?.beta ?? null) : Number(betaIn);
    const lines: string[] = [];
    lines.push("# ROIC / WACC / Peer comparison");
    lines.push(`# Base symbol,${esc(symbol.toUpperCase())}`);
    lines.push(`# Exported at,${esc(new Date().toISOString())}`);
    lines.push("# --- Assumptions ---");
    lines.push("field,decimal,percent");
    lines.push(`risk_free_rate,${asDec(rf)},${asPct(rf)}`);
    lines.push(`equity_risk_premium,${asDec(erp)},${asPct(erp)}`);
    lines.push(`pretax_cost_of_debt,${asDec(kd)},${asPct(kd)}`);
    lines.push(`tax_rate,${asDec(tax)},${asPct(tax)}`);
    lines.push(`beta,${beta != null ? beta.toFixed(4) : ""},`);
    lines.push("");
    lines.push("# --- Comparison table ---");
    lines.push("ticker,role,roic_pct,wacc_pct,spread_pct,spread_vs_base_pp,notes");
    lines.push([
      esc(symbol.toUpperCase()), "base",
      asPct(roicLatest?.roic ?? null), asPct(wacc?.wacc ?? null), asPct(spread),
      "", spreadPositive ? "value-creating" : "value-destroying",
    ].join(","));
    for (const p of peers) {
      const rel = p.spread != null && spread != null ? p.spread - spread : null;
      lines.push([
        esc(p.sym), "peer",
        asPct(p.roic), asPct(p.wacc), asPct(p.spread),
        rel != null ? (rel * 100).toFixed(2) : "",
        esc(p.err ?? ""),
      ].join(","));
    }
    if (peerAvg.spread != null) {
      const rel = spread != null ? spread - peerAvg.spread : null;
      lines.push([
        "PEER_AVG", "aggregate",
        asPct(peerAvg.roic), asPct(peerAvg.wacc), asPct(peerAvg.spread),
        rel != null ? (rel * 100).toFixed(2) : "",
        "unweighted mean across peers",
      ].join(","));
    }
    lines.push("");
    lines.push("# --- Time series (annual, from filings) ---");
    lines.push("year,end_date,roic_pct,wacc_pct,spread_pct");
    for (const r of timeSeries) {
      lines.push([esc(r.year), esc(r.endDate), r.roicPct ?? "", r.waccPct ?? "", r.spreadPct ?? ""].join(","));
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${symbol.toUpperCase()}_roic_wacc_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Rasterize the on-screen Recharts SVG into a PNG data URL.
  const captureChartPng = async (): Promise<string | null> => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return null;
    const w = svg.clientWidth || 720;
    const h = svg.clientHeight || 280;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    // Inline a white background so the chart is readable on a PDF page.
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = 2;
        canvas.width = w * scale; canvas.height = h * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try { resolve(canvas.toDataURL("image/png")); } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 40;
      let y = margin;

      doc.setFont("helvetica", "bold"); doc.setFontSize(16);
      doc.text(`${symbol.toUpperCase()} — ROIC / WACC report`, margin, y); y += 20;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Exported ${new Date().toLocaleString()} · Vela.ai`, margin, y); y += 14;
      doc.setTextColor(20);

      // Headline metrics
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text(`ROIC ${pct(roicLatest?.roic)}   ·   WACC ${pct(wacc?.wacc)}   ·   Spread ${pct(spread)}`, margin, y);
      y += 16;

      // Assumptions
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text("Assumptions", margin, y); y += 4;
      autoTable(doc, {
        startY: y + 4, theme: "grid", styles: { fontSize: 8 },
        head: [["rf", "ERP", "kd", "Tax", "Beta"]],
        body: [[
          `${rfPct.toFixed(2)}%`, `${erpPct.toFixed(2)}%`, `${kdPct.toFixed(2)}%`,
          taxPct === "" ? (snap?.effTaxRate != null ? `${(snap.effTaxRate * 100).toFixed(2)}%` : "—") : `${Number(taxPct).toFixed(2)}%`,
          betaIn === "" ? (snap?.beta != null ? snap.beta.toFixed(2) : "—") : Number(betaIn).toFixed(2),
        ]],
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

      // Chart
      const png = await captureChartPng();
      if (png) {
        const imgW = pageW - margin * 2;
        const imgH = imgW * (280 / 720);
        if (y + imgH > doc.internal.pageSize.getHeight() - margin) { doc.addPage(); y = margin; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(10);
        doc.text("ROIC · WACC · Spread over time", margin, y); y += 8;
        doc.addImage(png, "PNG", margin, y, imgW, imgH);
        y += imgH + 10;
      }

      // Time series table
      autoTable(doc, {
        startY: y, theme: "striped", styles: { fontSize: 8 },
        head: [["Year", "End date", "ROIC", "WACC", "Spread"]],
        body: timeSeries.map((r) => [
          r.year, r.endDate,
          r.roicPct != null ? `${r.roicPct.toFixed(2)}%` : "—",
          r.waccPct != null ? `${r.waccPct.toFixed(2)}%` : "—",
          r.spreadPct != null ? `${r.spreadPct.toFixed(2)}%` : "—",
        ]),
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

      // Sensitivity
      if (sensitivity) {
        if (y > doc.internal.pageSize.getHeight() - 140) { doc.addPage(); y = margin; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(10);
        doc.text("Sensitivity summary", margin, y); y += 4;
        autoTable(doc, {
          startY: y + 4, theme: "grid", styles: { fontSize: 8 },
          head: [["Metric", "Value"]],
          body: [
            ["Range low (min spread)", pct(sensitivity.min)],
            ["Range high (max spread)", pct(sensitivity.max)],
            ["Current spread", pct(spread)],
            ["rf range", `${sensRf[0].toFixed(2)}% – ${sensRf[1].toFixed(2)}%`],
            ["ERP range", `${sensErp[0].toFixed(2)}% – ${sensErp[1].toFixed(2)}%`],
            ["Tax range", `${sensTax[0].toFixed(1)}% – ${sensTax[1].toFixed(1)}%`],
            ["Beta range", `${sensBeta[0].toFixed(2)} – ${sensBeta[1].toFixed(2)}`],
          ],
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
      }

      // Backtest events
      if (y > doc.internal.pageSize.getHeight() - 140) { doc.addPage(); y = margin; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text(`Backtest triggers — direction=${alertDirection}, threshold=${alertThresholdBps} bps, min-hold=${alertMinHoldYears}y`, margin, y); y += 4;
      autoTable(doc, {
        startY: y + 4, theme: "striped", styles: { fontSize: 8 },
        head: [["Year", "Δ spread (bps)", "Direction"]],
        body: backtest.events.length
          ? backtest.events.map((e) => [e.year, `${e.delta >= 0 ? "+" : ""}${(e.delta * 10000).toFixed(0)}`, e.direction])
          : [["—", "no triggers", "—"]],
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

      // Filing drilldown
      if (y > doc.internal.pageSize.getHeight() - 160) { doc.addPage(); y = margin; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text("Filing-field drilldown", margin, y); y += 4;
      autoTable(doc, {
        startY: y + 4, theme: "grid", styles: { fontSize: 7 },
        head: [["Line", "Filing field", "Unit", "Value"]],
        body: [
          ["EBIT", "incomeStatementHistory[0].operatingIncome", "USD", fmtB(snap?.ebit ?? null)],
          ["× (1 − eff. tax)", "incomeTaxExpense ÷ incomeBeforeTax", "ratio", pct(roicLatest?.taxRate ?? null)],
          ["NOPAT", "EBIT × (1 − tax)", "USD", fmtB(roicLatest?.nopat ?? null)],
          ["Total equity", "balanceSheetHistory[0].totalStockholderEquity", "USD", fmtB(snap?.equity ?? null)],
          ["LT debt", "balanceSheetHistory[0].longTermDebt", "USD", fmtB(snap?.ltDebt ?? null)],
          ["ST portion LT debt", "balanceSheetHistory[0].shortLongTermDebt", "USD", fmtB(snap?.stDebt ?? null)],
          ["Cash & equivalents", "balanceSheetHistory[0].cash", "USD", fmtB(snap?.cash ?? null)],
          ["Invested capital", "equity + LT debt + ST debt − cash", "USD", fmtB(roicLatest?.investedCapital ?? null)],
          ["Market cap", "price.marketCap", "USD (equity weight)", fmtB(snap?.marketCap ?? null)],
          ["Beta", "summaryDetail.beta", "dimensionless", snap?.beta != null ? snap.beta.toFixed(2) : "—"],
        ],
      });

      if (dataQuality.issues.length) {
        doc.addPage(); y = margin;
        doc.setFont("helvetica", "bold"); doc.setFontSize(10);
        doc.text("Data quality — missing or estimated inputs", margin, y); y += 4;
        autoTable(doc, {
          startY: y + 4, theme: "grid", styles: { fontSize: 8 },
          head: [["Year", "Missing", "Estimated / substituted"]],
          body: dataQuality.issues.map((i) => [i.year, i.missing.join(", ") || "—", i.estimated.join(", ") || "—"]),
        });
      }

      doc.save(`${symbol.toUpperCase()}_roic_wacc_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      toast({ title: "PDF export failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setPdfBusy(false);
    }
  };

  const saveAlert = async () => {
    if (!user) { toast({ title: "Please sign in to create alerts", variant: "destructive" }); return; }
    if (spread == null) { toast({ title: "Spread unavailable; cannot baseline the alert.", variant: "destructive" }); return; }
    setAlertSaving(true);
    const { error } = await supabase.from("alert_rules").insert({
      user_id: user.id,
      kind: "roic_wacc_spread_delta",
      symbol: symbol.toUpperCase(),
      name: `${symbol.toUpperCase()} · ROIC−WACC spread Δ`,
      threshold: alertThresholdBps,
      params: {
        window_days: alertWindowDays,
        direction: alertDirection,
        baseline_spread: spread,
        baseline_captured_at: new Date().toISOString(),
        assumptions: {
          rf: rfPct / 100, erp: erpPct / 100, kd: kdPct / 100,
          tax: taxPct === "" ? null : Number(taxPct) / 100,
          beta: betaIn === "" ? null : Number(betaIn),
        },
      },
    });
    setAlertSaving(false);
    if (error) { toast({ title: "Failed to create alert", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Alert created", description: `Baseline spread ${pct(spread)}; window ${alertWindowDays}d; threshold ${alertThresholdBps} bps.` });
    setAlertOpen(false);
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Computing ROIC &amp; WACC…</div>;
  }
  if (err || !roicLatest || !snap) {
    return <div className="text-sm text-muted-foreground py-6">{err ?? "Not enough data to compute ROIC / WACC."}</div>;
  }

  const spreadPositive = (spread ?? 0) >= 0;
  const ic = (snap.equity ?? 0) + (snap.ltDebt ?? 0) + (snap.stDebt ?? 0) - (snap.cash ?? 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* ROIC card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> Return on Invested Capital</CardTitle>
            <CardDescription>NOPAT ÷ (Equity + Debt − Cash). Efficiency of capital deployment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-3">
              <div className="text-3xl font-semibold font-mono">{pct(roicLatest.roic)}</div>
              <Badge variant="outline" className="text-[10px]">Effective tax {pct(roicLatest.taxRate)}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              NOPAT ≈ {fmtB(roicLatest.nopat)} · Invested capital ≈ {fmtB(roicLatest.investedCapital)}
            </div>
            <button className="text-xs text-primary inline-flex items-center gap-1 hover:underline" onClick={() => setShowDrilldown((v) => !v)}>
              {showDrilldown ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {showDrilldown ? "Hide" : "Show"} invested-capital &amp; NOPAT drilldown
            </button>
            {showDrilldown && (
              <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-foreground">NOPAT &amp; invested-capital build</div>
                  <button
                    type="button"
                    className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
                    onClick={() => setFieldMapOpen((v) => !v)}
                  >
                    {fieldMapOpen ? "Hide" : "Show"} filing-field labels
                  </button>
                </div>
                <FilingRow
                  label="EBIT (operating income)"
                  field="incomeStatementHistory[0].operatingIncome"
                  unit="USD"
                  value={fmtB(snap.ebit)}
                  used
                  showField={fieldMapOpen}
                />
                <FilingRow
                  label="× (1 − effective tax)"
                  field="derived: incomeTaxExpense ÷ incomeBeforeTax"
                  unit="ratio, capped 50%"
                  value={`× ${pct(roicLatest.taxRate)}`}
                  used
                  showField={fieldMapOpen}
                />
                <FilingRow
                  label="= NOPAT"
                  field="EBIT × (1 − tax)"
                  unit="USD"
                  value={fmtB(roicLatest.nopat)}
                  bold
                  used
                  showField={fieldMapOpen}
                />
                <Separator />
                <FilingRow
                  label="Total stockholder equity"
                  field="balanceSheetHistory[0].totalStockholderEquity"
                  unit="USD"
                  value={fmtB(snap.equity)}
                  used
                  showField={fieldMapOpen}
                />
                <FilingRow
                  label="+ Long-term debt"
                  field="balanceSheetHistory[0].longTermDebt"
                  unit="USD"
                  value={fmtB(snap.ltDebt)}
                  used
                  showField={fieldMapOpen}
                />
                <FilingRow
                  label="+ Current portion of LT debt"
                  field="balanceSheetHistory[0].shortLongTermDebt"
                  unit="USD"
                  value={fmtB(snap.stDebt)}
                  used
                  showField={fieldMapOpen}
                />
                <FilingRow
                  label="− Cash &amp; equivalents"
                  field="balanceSheetHistory[0].cash"
                  unit="USD"
                  value={fmtB(-(snap.cash ?? 0))}
                  used
                  showField={fieldMapOpen}
                />
                <FilingRow
                  label="= Invested capital"
                  field="equity + LT debt + ST debt − cash"
                  unit="USD"
                  value={fmtB(ic > 0 ? ic : null)}
                  bold
                  used
                  showField={fieldMapOpen}
                />
                <Separator />
                <div className="font-semibold text-foreground">WACC inputs</div>
                <FilingRow label="Market capitalisation" field="price.marketCap" unit="USD (equity weight)" value={fmtB(snap.marketCap)} used showField={fieldMapOpen} />
                <FilingRow label="Beta (5Y monthly)" field="summaryDetail.beta / defaultKeyStatistics.beta" unit="dimensionless" value={snap.beta != null ? snap.beta.toFixed(2) : "-"} used showField={fieldMapOpen} />
                <FilingRow label="Risk-free rate" field="user input (10Y proxy)" unit="decimal" value={pct(rfPct / 100)} used showField={fieldMapOpen} />
                <FilingRow label="Equity risk premium" field="user input" unit="decimal" value={pct(erpPct / 100)} used showField={fieldMapOpen} />
                <FilingRow label="Pre-tax cost of debt" field="user input" unit="decimal" value={pct(kdPct / 100)} used showField={fieldMapOpen} />
                <p className="text-[10px] text-muted-foreground pt-1">
                  Highlighted rows are the exact fields fed into ROIC and WACC. Fields come from the Yahoo Finance <code>quoteSummary</code> feed (annual filings).
                </p>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b">
                  <th className="text-left py-1 font-medium">Year</th>
                  <th className="text-right py-1 font-medium">ROIC</th>
                  <th className="text-right py-1 font-medium">NOPAT</th>
                  <th className="text-right py-1 font-medium">IC</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.year} className="border-b last:border-0">
                    <td className="py-1">{r.year}</td>
                    <td className="text-right font-mono py-1">{pct(r.roic)}</td>
                    <td className="text-right font-mono py-1">{fmtB(r.nopat)}</td>
                    <td className="text-right font-mono py-1">{fmtB(r.ic)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* WACC card with editable assumptions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> Weighted Avg Cost of Capital</CardTitle>
            <CardDescription>CAPM cost of equity + after-tax cost of debt, weighted by capital structure. Tune the assumptions below and recalculate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-3">
              <div className="text-3xl font-semibold font-mono">{pct(wacc?.wacc)}</div>
              {spread != null && (
                <Badge variant={spreadPositive ? "default" : "destructive"} className="text-[10px] flex items-center gap-1">
                  {spreadPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  ROIC − WACC {pct(spread)}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{interpretSpread(spread)}</p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <Row k="Cost of equity" v={pct(wacc?.costOfEquity)} />
              <Row k="After-tax cost of debt" v={pct(wacc?.afterTaxCostOfDebt)} />
              <Row k="Equity weight" v={pct(wacc?.weightEquity)} />
              <Row k="Debt weight" v={pct(wacc?.weightDebt)} />
            </div>

            <div className="rounded-md border border-border/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold">Assumptions</div>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={resetAssumptions}>
                  <RefreshCw className="h-3 w-3" /> Reset
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumField label="Risk-free rate %" value={rfPct} onChange={(n) => { if (n !== "") setRfPct(n); markDirty(); }} step={0.05} />
                <NumField label="Equity risk premium %" value={erpPct} onChange={(n) => { if (n !== "") setErpPct(n); markDirty(); }} step={0.1} />
                <NumField label="Tax rate %" value={taxPct} onChange={(n) => { setTaxPct(n); markDirty(); }} step={0.5} placeholder={snap.effTaxRate != null ? (snap.effTaxRate * 100).toFixed(1) : "21"} />
                <NumField label="Beta" value={betaIn} onChange={(n) => { setBetaIn(n); markDirty(); }} step={0.05} placeholder={snap.beta != null ? snap.beta.toFixed(2) : "1.00"} />
                <NumField label="Pre-tax cost of debt %" value={kdPct} onChange={(n) => { if (n !== "") setKdPct(n); markDirty(); }} step={0.1} />
              </div>
              <p className="text-[10px] text-muted-foreground">Changes recalculate ROIC (tax) and WACC live. Reset to defaults sourced from filings + 10Y proxy.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAlertOpen((v) => !v)}>
                <BellPlus className="h-3.5 w-3.5" /> Alert on spread change
              </Button>
            </div>

            {alertOpen && (
              <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px]">Window (days)</Label>
                    <Input type="number" min={1} max={365} value={alertWindowDays} onChange={(e) => setAlertWindowDays(Math.max(1, Number(e.target.value) || 30))} className="h-8" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Threshold (bps)</Label>
                    <Input type="number" min={10} max={5000} step={10} value={alertThresholdBps} onChange={(e) => setAlertThresholdBps(Math.max(10, Number(e.target.value) || 100))} className="h-8" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Direction</Label>
                    <select value={alertDirection} onChange={(e) => setAlertDirection(e.target.value as any)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                      <option value="either">Either direction</option>
                      <option value="improve">Improves ≥</option>
                      <option value="worsen">Worsens ≥</option>
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Baselines the current spread ({pct(spread)}) and fires when |Δ| ≥ {alertThresholdBps} bps after {alertWindowDays} day(s).
                </p>
                <div className="rounded border border-dashed border-border/60 p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <History className="h-3 w-3" /> Backtest preview
                  </div>
                  {timeSeries.filter((r) => r.spread != null).length < 2 ? (
                    <p className="text-[10px] text-muted-foreground">Need at least two annual observations to backtest.</p>
                  ) : (
                    <>
                      <p className="text-[10px]">
                        Would have triggered <span className="font-semibold">{backtest.count}</span>{" "}
                        time{backtest.count === 1 ? "" : "s"} across{" "}
                        {timeSeries.filter((r) => r.spread != null).length - 1} year-over-year step
                        {timeSeries.filter((r) => r.spread != null).length - 1 === 1 ? "" : "s"}{" "}
                        (direction: {alertDirection}, threshold {alertThresholdBps} bps).
                      </p>
                      {backtest.events.length > 0 && (
                        <ul className="text-[10px] font-mono space-y-0.5">
                          {backtest.events.map((e) => (
                            <li key={e.year} className="flex items-center justify-between gap-2">
                              <span>{e.year}</span>
                              <span className={e.direction === "improve" ? "text-success" : "text-destructive"}>
                                {e.delta >= 0 ? "+" : ""}{(e.delta * 10000).toFixed(0)} bps
                                {" "}({e.direction})
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="text-[9px] text-muted-foreground pt-0.5">
                        Backtest uses annual filings (year-over-year Δ). The live rule uses your chosen
                        rolling {alertWindowDays}-day window on the same spread definition.
                      </p>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveAlert} disabled={alertSaving}>
                    {alertSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                    Create alert
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAlertOpen(false)}>Cancel</Button>
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">Educational estimate — not investment advice.</p>
          </CardContent>
        </Card>
      </div>

      {/* Time-series chart */}
      {timeSeries.some((r) => r.roicPct != null || r.waccPct != null) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <LineChartIcon className="h-4 w-4" /> ROIC · WACC · Spread over time
            </CardTitle>
            <CardDescription>
              Annual filings from the last {timeSeries.length} year{timeSeries.length === 1 ? "" : "s"}.
              WACC per year is recomputed using the current rf/ERP/kd/β and per-year book-equity + total-debt weights.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full h-[280px]">
              <ResponsiveContainer>
                <ComposedChart data={timeSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickFormatter={(v) => `${v}%`}
                    domain={["auto", "auto"]}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                    formatter={(v: number | string) => (typeof v === "number" ? `${v.toFixed(2)}%` : v)}
                    labelFormatter={(y, payload) => {
                      const d = payload?.[0]?.payload?.endDate;
                      return d ? `${y} (${d})` : String(y);
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="spreadPct" name="ROIC − WACC" fill="hsl(var(--primary))" opacity={0.35} />
                  <Line type="monotone" dataKey="roicPct" stroke="hsl(var(--success))" strokeWidth={2} dot name="ROIC" />
                  <Line type="monotone" dataKey="waccPct" stroke="hsl(var(--destructive))" strokeWidth={2} dot name="WACC" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Historic years use book equity as the equity-weight proxy (point-in-time market caps aren't in the feed), so ROIC changes drive most of the spread movement while WACC evolves with the capital structure only.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Sensitivity panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" /> Sensitivity — how inputs move the spread
          </CardTitle>
          <CardDescription>
            Pick a range for each driver. We resample the ROIC − WACC spread across every corner of the range and show the resulting min/max.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            type="button"
            className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
            onClick={() => setSensOpen((v) => !v)}
          >
            {sensOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {sensOpen ? "Hide" : "Show"} sensitivity ranges
          </button>
          {sensOpen && (
            <div className="grid gap-3 md:grid-cols-2">
              <RangeSlider label="Risk-free rate" min={0} max={10} step={0.05} value={sensRf} onChange={setSensRf} unit="%" decimals={2} />
              <RangeSlider label="Equity risk premium" min={0} max={12} step={0.1} value={sensErp} onChange={setSensErp} unit="%" decimals={2} />
              <RangeSlider label="Tax rate" min={0} max={50} step={0.5} value={sensTax} onChange={setSensTax} unit="%" decimals={1} />
              <RangeSlider label="Beta" min={0} max={3} step={0.05} value={sensBeta} onChange={setSensBeta} decimals={2} />
            </div>
          )}
          {sensitivity && (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border/60 p-3 space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Current spread</div>
                <div className={`text-2xl font-mono font-semibold ${spreadPositive ? "text-success" : "text-destructive"}`}>{pct(spread)}</div>
              </div>
              <div className="rounded-md border border-border/60 p-3 space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Range low</div>
                <div className={`text-2xl font-mono font-semibold ${sensitivity.min >= 0 ? "text-success" : "text-destructive"}`}>{pct(sensitivity.min)}</div>
                {spread != null && (
                  <div className="text-[10px] text-muted-foreground">
                    Δ {(spread - sensitivity.min) >= 0 ? "−" : "+"}
                    {Math.abs((sensitivity.min - spread) * 100).toFixed(1)} pp
                  </div>
                )}
              </div>
              <div className="rounded-md border border-border/60 p-3 space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Range high</div>
                <div className={`text-2xl font-mono font-semibold ${sensitivity.max >= 0 ? "text-success" : "text-destructive"}`}>{pct(sensitivity.max)}</div>
                {spread != null && (
                  <div className="text-[10px] text-muted-foreground">
                    Δ {(sensitivity.max - spread) >= 0 ? "+" : "−"}
                    {Math.abs((sensitivity.max - spread) * 100).toFixed(1)} pp
                  </div>
                )}
              </div>
            </div>
          )}
          {sensitivity && (
            <div className="rounded-md border border-border/60 p-3 space-y-2">
              <div className="text-[11px] font-semibold text-foreground">One-at-a-time sweeps</div>
              <div className="grid gap-2 md:grid-cols-2">
                {(["rf", "erp", "tax", "beta"] as const).map((k) => {
                  const rows = sensitivity.drivers[k];
                  const label = k === "rf" ? "Risk-free rate" : k === "erp" ? "Equity risk premium" : k === "tax" ? "Tax rate" : "Beta";
                  const unit = k === "beta" ? "" : "%";
                  const vals = rows.map((r) => r.spread).filter((v): v is number => v != null);
                  const lo = vals.length ? Math.min(...vals) : null;
                  const hi = vals.length ? Math.max(...vals) : null;
                  return (
                    <div key={k} className="rounded border border-border/40 p-2 space-y-1 text-[10px] font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{label}</span>
                        <span>
                          spread {pct(lo)} → {pct(hi)}
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {rows.map((r, i) => (
                          <div key={i} className="text-center">
                            <div className="text-[9px] text-muted-foreground">{r.x.toFixed(k === "beta" ? 2 : 1)}{unit}</div>
                            <div className={r.spread != null && r.spread >= 0 ? "text-success" : "text-destructive"}>
                              {r.spread != null ? `${(r.spread * 100).toFixed(1)}%` : "-"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Range results use every corner of your 4-range box (16 evaluations). One-at-a-time sweeps hold the other three drivers at the midpoint of their ranges.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Peer / sector comparison */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Peer &amp; sector comparison</CardTitle>
              <CardDescription>Enter peer tickers (comma-separated) to compare ROIC, WACC, and the ROIC−WACC spread using the same assumptions.</CardDescription>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={downloadCsv}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-[10px]">Peer symbols</Label>
              <Input value={peerInput} onChange={(e) => setPeerInput(e.target.value)} placeholder="e.g. AAPL, MSFT, GOOGL" className="h-9" />
            </div>
            <Button size="sm" onClick={loadPeers} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Compare</Button>
          </div>

          {peers.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b">
                  <th className="text-left py-1 font-medium">Ticker</th>
                  <th className="text-right py-1 font-medium">ROIC</th>
                  <th className="text-right py-1 font-medium">WACC</th>
                  <th className="text-right py-1 font-medium">Spread</th>
                  <th className="text-right py-1 font-medium">Reading</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b bg-muted/30">
                  <td className="py-1 font-semibold">{symbol.toUpperCase()} <Badge variant="outline" className="ml-1 text-[9px]">this</Badge></td>
                  <td className="text-right font-mono py-1">{pct(roicLatest.roic)}</td>
                  <td className="text-right font-mono py-1">{pct(wacc?.wacc)}</td>
                  <td className={`text-right font-mono py-1 ${spreadPositive ? "text-success" : "text-destructive"}`}>{pct(spread)}</td>
                  <td className="text-right text-xs py-1">{spreadPositive ? "value-creating" : "destroying"}</td>
                </tr>
                {peers.map((p) => {
                  const rel = p.spread != null && spread != null ? p.spread - spread : null;
                  return (
                    <tr key={p.sym} className="border-b last:border-0">
                      <td className="py-1">{p.sym}</td>
                      <td className="text-right font-mono py-1">{p.loading ? "…" : pct(p.roic)}</td>
                      <td className="text-right font-mono py-1">{p.loading ? "…" : pct(p.wacc)}</td>
                      <td className={`text-right font-mono py-1 ${p.spread != null && p.spread >= 0 ? "text-success" : "text-destructive"}`}>{p.loading ? "…" : pct(p.spread)}</td>
                      <td className="text-right text-xs py-1">
                        {p.err ? <span className="text-muted-foreground">{p.err}</span> : rel != null ? (
                          <span className={rel >= 0 ? "text-success" : "text-destructive"}>{rel >= 0 ? "+" : ""}{(rel * 100).toFixed(1)} pp vs {symbol}</span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {peerAvg.spread != null && (
                  <tr className="border-t bg-muted/20">
                    <td className="py-1 font-semibold">Peer avg</td>
                    <td className="text-right font-mono py-1">{pct(peerAvg.roic)}</td>
                    <td className="text-right font-mono py-1">{pct(peerAvg.wacc)}</td>
                    <td className={`text-right font-mono py-1 ${peerAvg.spread >= 0 ? "text-success" : "text-destructive"}`}>{pct(peerAvg.spread)}</td>
                    <td className="text-right text-xs py-1">
                      {spread != null && (
                        <span className={spread - peerAvg.spread >= 0 ? "text-success" : "text-destructive"}>
                          {symbol.toUpperCase()} {spread - peerAvg.spread >= 0 ? "leads" : "trails"} peers by {Math.abs((spread - peerAvg.spread) * 100).toFixed(1)} pp
                        </span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          {peers.length === 0 && (
            <p className="text-xs text-muted-foreground">Try common sector peers, e.g. banks: <code>JPM, BAC, WFC</code> · mega-cap tech: <code>AAPL, MSFT, GOOGL</code>.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 pb-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}

function NumField({ label, value, onChange, step, placeholder }: { label: string; value: number | ""; onChange: (n: number | "") => void; step?: number; placeholder?: string }) {
  return (
    <div>
      <Label className="text-[10px]">{label}</Label>
      <Input
        type="number"
        step={step ?? 0.1}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") { onChange(""); return; }
          const n = Number(v);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="h-8"
      />
    </div>
  );
}

function FilingRow({
  label, field, unit, value, used, bold, showField,
}: {
  label: string; field: string; unit: string;
  value: string; used?: boolean; bold?: boolean; showField?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[1fr_auto] gap-x-4 items-baseline rounded px-1 py-0.5 ${used ? "bg-primary/5 border-l-2 border-primary/40" : ""}`}>
      <div className="min-w-0">
        <div className={`truncate ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</div>
        {showField && (
          <div className="text-[9px] text-muted-foreground/80 font-mono truncate">
            <span className="text-primary/80">{field}</span>
            <span className="mx-1">·</span>
            <span>{unit}</span>
          </div>
        )}
      </div>
      <div className={`text-right font-mono ${bold ? "font-semibold" : ""}`}>{value}</div>
    </div>
  );
}

function RangeSlider({
  label, min, max, step, value, onChange, unit, decimals = 2,
}: {
  label: string; min: number; max: number; step: number;
  value: [number, number]; onChange: (v: [number, number]) => void;
  unit?: string; decimals?: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          {value[0].toFixed(decimals)}{unit} – {value[1].toFixed(decimals)}{unit}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={(v) => {
          if (v.length === 2) onChange([v[0], v[1]] as [number, number]);
        }}
      />
    </div>
  );
}