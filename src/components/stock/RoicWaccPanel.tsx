import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Gauge, Loader2, TrendingUp, TrendingDown, RefreshCw, BellPlus, Users, ChevronDown, ChevronRight } from "lucide-react";
import { computeRoic, computeWacc, pct, roicWaccSpread, type WaccInputs } from "@/lib/valuation/roicWacc";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const PROXY = "https://api.allorigins.win/raw?url=";

type YearRoic = { year: string; roic: number | null; nopat: number | null; ic: number | null };

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

async function fetchSnapshot(symbol: string): Promise<{ snap: Snapshot; history: YearRoic[]; raw: any } | null> {
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
  const history: YearRoic[] = inc.slice(0, 4).map((row: any, i: number) => {
    const b = bs[i] ?? {};
    const ebit = num(row.operatingIncome) ?? num(row.ebit);
    const tax = num(row.incomeTaxExpense);
    const pretax = num(row.incomeBeforeTax);
    const rate = tax != null && pretax && pretax !== 0 ? tax / pretax : null;
    const rr = computeRoic({
      ebit, taxRate: rate,
      totalEquity: num(b.totalStockholderEquity),
      longTermDebt: num(b.longTermDebt),
      shortLongTermDebt: num(b.shortLongTermDebt),
      cash: num(b.cash),
    });
    return { year: row.endDate?.fmt?.slice(0, 4) ?? "-", roic: rr.roic, nopat: rr.nopat, ic: rr.investedCapital };
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
  const [history, setHistory] = useState<YearRoic[]>([]);
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
  const [peers, setPeers] = useState<{ sym: string; roic: number | null; wacc: number | null; spread: number | null; loading?: boolean; err?: string }[]>([]);

  // Alert config UI toggle.
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertWindowDays, setAlertWindowDays] = useState(30);
  const [alertThresholdBps, setAlertThresholdBps] = useState(100);
  const [alertDirection, setAlertDirection] = useState<"either" | "improve" | "worsen">("either");
  const [alertSaving, setAlertSaving] = useState(false);

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
    setPeers(syms.map((sym) => ({ sym, roic: null, wacc: null, spread: null, loading: true })));
    const rows = await Promise.all(syms.map(async (sym) => {
      try {
        const res = await fetchSnapshot(sym);
        if (!res) return { sym, roic: null, wacc: null, spread: null, err: "no data" };
        const totalDebt = (res.snap.ltDebt ?? 0) + (res.snap.stDebt ?? 0);
        const roic = computeRoic({
          ebit: res.snap.ebit,
          taxRate: taxPct === "" ? res.snap.effTaxRate : Number(taxPct) / 100,
          totalEquity: res.snap.equity,
          longTermDebt: res.snap.ltDebt,
          shortLongTermDebt: res.snap.stDebt,
          cash: res.snap.cash,
        });
        const w = computeWacc({
          marketCap: res.snap.marketCap,
          totalDebt,
          beta: res.snap.beta,
          riskFreeRate: rfPct / 100,
          equityRiskPremium: erpPct / 100,
          preTaxCostOfDebt: kdPct / 100,
          taxRate: taxPct === "" ? res.snap.effTaxRate : Number(taxPct) / 100,
        });
        return { sym, roic: roic.roic, wacc: w.wacc, spread: roicWaccSpread(roic.roic, w.wacc) };
      } catch {
        return { sym, roic: null, wacc: null, spread: null, err: "error" };
      }
    }));
    setPeers(rows);
  };

  const peerAvg = useMemo(() => {
    const nums = (key: "roic" | "wacc" | "spread") => peers.map((p) => p[key]).filter((v): v is number => v != null && Number.isFinite(v));
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    return { roic: avg(nums("roic")), wacc: avg(nums("wacc")), spread: avg(nums("spread")) };
  }, [peers]);

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
                <div className="font-semibold text-foreground">NOPAT build</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
                  <span className="text-muted-foreground">EBIT (operating income)</span><span className="text-right">{fmtB(snap.ebit)}</span>
                  <span className="text-muted-foreground">× (1 − effective tax)</span><span className="text-right">× {pct(roicLatest.taxRate)}</span>
                  <span className="text-muted-foreground">= NOPAT</span><span className="text-right font-semibold">{fmtB(roicLatest.nopat)}</span>
                </div>
                <Separator />
                <div className="font-semibold text-foreground">Invested capital build</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
                  <span className="text-muted-foreground">Total stockholder equity</span><span className="text-right">{fmtB(snap.equity)}</span>
                  <span className="text-muted-foreground">+ Long-term debt</span><span className="text-right">{fmtB(snap.ltDebt)}</span>
                  <span className="text-muted-foreground">+ Current portion of LT debt</span><span className="text-right">{fmtB(snap.stDebt)}</span>
                  <span className="text-muted-foreground">− Cash &amp; equivalents</span><span className="text-right">{fmtB(-(snap.cash ?? 0))}</span>
                  <span className="text-muted-foreground">= Invested capital</span><span className="text-right font-semibold">{fmtB(ic > 0 ? ic : null)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">Filings sourced from latest annual balance sheet + income statement. Effective tax = tax expense ÷ pretax income; capped at 50%.</p>
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
                <NumField label="Risk-free rate %" value={rfPct} onChange={(n) => { setRfPct(n); markDirty(); }} step={0.05} />
                <NumField label="Equity risk premium %" value={erpPct} onChange={(n) => { setErpPct(n); markDirty(); }} step={0.1} />
                <NumField label="Tax rate %" value={taxPct} onChange={(n) => { setTaxPct(n); markDirty(); }} step={0.5} placeholder={snap.effTaxRate != null ? (snap.effTaxRate * 100).toFixed(1) : "21"} />
                <NumField label="Beta" value={betaIn} onChange={(n) => { setBetaIn(n); markDirty(); }} step={0.05} placeholder={snap.beta != null ? snap.beta.toFixed(2) : "1.00"} />
                <NumField label="Pre-tax cost of debt %" value={kdPct} onChange={(n) => { setKdPct(n); markDirty(); }} step={0.1} />
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

      {/* Peer / sector comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Peer &amp; sector comparison</CardTitle>
          <CardDescription>Enter peer tickers (comma-separated) to compare ROIC, WACC, and the ROIC−WACC spread using the same assumptions.</CardDescription>
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