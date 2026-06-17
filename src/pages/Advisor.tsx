import { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { AiDisclaimerStrip } from "@/components/AiDisclaimerStrip";
import { useAuth } from "@/hooks/useAuth";
import { useFlag } from "@/hooks/useFeatureFlags";
import { usePortfolio } from "@/hooks/usePortfolio";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Sparkles, RefreshCw, ShieldAlert, Trophy, Layers, Play, FileDown, Trash2, Settings as SettingsIcon, AlertTriangle } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ---------------- types ------------------
type StrategyResult = {
  name: string; label: string; family: string;
  weights: Record<string, number>;
  stats: { ann_return: number; ann_vol: number; sharpe: number; max_dd: number };
  turnover_pct: number; suitability_fit: number; score: number; rationale: string;
};
type GatingDecision = { feature: string; allowed: boolean; reason: string };
type Gating = {
  unrestricted_master: boolean; allow_cross_asset: boolean; allow_shorts: boolean; allow_derivatives: boolean;
  suitability_completed: boolean; risk_level?: number | null; decisions: GatingDecision[];
};
type OrderRow = {
  seq: number; action: string; asset_class: string; symbol: string; symbol_label?: string;
  side: string; qty: number; order_type: string; limit_price?: number; est_price?: number; est_notional?: number;
  currency: string; rationale: string;
  option_structure?: string; option_expiry?: string; option_strike?: number; option_right?: string;
};
type AdvisorResult = {
  run_id: string | null;
  base_currency: string;
  total_value: number;
  cash_available: number;
  gating: Gating;
  strategies: StrategyResult[];
  winner: string;
  blended_weights: Record<string, number>;
  orders_blended: OrderRow[];
  orders_winner: OrderRow[];
  symbols: string[];
  prices: Record<string, number>;
  currencies: Record<string, string>;
  classes: Record<string, string>;
  labels: Record<string, string>;
  current_weights: Record<string, number>;
};

const ACTION_LABEL: Record<string, string> = {
  buy_new: "Open new", add_to: "Add to", trim_n_shares: "Trim", sell_all: "Close",
  short: "Short", open_option: "Open option", swap_into: "Swap into", hedge_with: "Hedge with",
};
const CLASS_BADGE: Record<string, string> = {
  equity: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  etf: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  bond: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  commodity: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  crypto: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
  hedge: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  option: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
};

function pct(x: number, d = 1) { return `${(x * 100).toFixed(d)}%`; }
function num(x: number | undefined, d = 2) { return x == null ? "—" : x.toLocaleString(undefined, { maximumFractionDigits: d }); }
function money(x: number | undefined, ccy = "EUR") {
  if (x == null) return "—";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(x); } catch { return `${ccy} ${num(x, 0)}`; }
}

export default function Advisor() {
  const enabled = useFlag("advisor", true);
  const { user, loading: authLoading } = useAuth();
  const portfolio = usePortfolio();
  const [riskProfile, setRiskProfile] = useState("balanced");
  const [cash, setCash] = useState<number>(0);
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [running, setRunning] = useState(false);
  const [basis, setBasis] = useState<"blended" | "winner">("blended");
  const [editableOrders, setEditableOrders] = useState<OrderRow[]>([]);
  const [executingIdx, setExecutingIdx] = useState<number | null>(null);
  const [hasSuitability, setHasSuitability] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("investor_profiles").select("completed_at").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setHasSuitability(!!data?.completed_at));
    supabase.from("paper_cash").select("amount,currency").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.amount != null) setCash(Number(data.amount)); });
  }, [user?.id]);

  useEffect(() => {
    setEditableOrders(basis === "blended" ? (result?.orders_blended ?? []) : (result?.orders_winner ?? []));
  }, [basis, result]);

  if (!enabled) return <div className="min-h-screen bg-background"><TopNav /><div className="container mx-auto p-6 text-center text-muted-foreground">This feature is currently disabled by the admin.</div></div>;
  if (authLoading) return <div className="min-h-screen bg-background"><TopNav /></div>;
  if (!user) return <Navigate to="/auth" replace />;

  const holdings = portfolio.holdings;

  const run = async () => {
    if (!holdings.length) { toast.error("Add some holdings to your portfolio first"); return; }
    setRunning(true); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("advisor-run", {
        body: {
          holdings: holdings.map(h => ({ symbol: h.symbol, name: h.name, shares: h.shares, avg_price: h.avg_price, currency: h.currency })),
          cash, riskProfile, baseCurrency: "EUR",
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      setResult(data as AdvisorResult);
      toast.success(`Ran ${data.strategies?.length ?? 0} strategies — winner: ${data.winner}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Advisor failed");
    } finally { setRunning(false); }
  };

  const orders = editableOrders;

  const fireAllPaper = async () => {
    if (!user || !orders.length) return;
    const { data: portfolios } = await supabase.from("portfolios").select("id").eq("user_id", user.id).limit(1);
    const portfolioId = portfolios?.[0]?.id;
    if (!portfolioId) { toast.error("Create a portfolio first to use paper execution."); return; }
    let ok = 0, fail = 0;
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (o.asset_class === "option") { toast.info(`Skipping option leg ${o.symbol_label ?? o.symbol} — paper engine is equity-only.`); continue; }
      const tradeSide = o.side === "buy" || o.side === "buy_to_cover" ? "buy" : "sell";
      setExecutingIdx(i);
      const { error } = await supabase.from("paper_trades").insert({
        user_id: user.id,
        portfolio_id: portfolioId,
        symbol: o.symbol,
        name: o.symbol_label ?? null,
        side: tradeSide,
        quantity: Math.max(0.0001, Number(o.qty)),
        price: Number(o.limit_price ?? o.est_price ?? 0),
        currency: o.currency,
        notes: `Advisor v2 — ${o.rationale}`,
      });
      if (error) { fail++; toast.error(`${o.symbol}: ${error.message}`); }
      else ok++;
    }
    setExecutingIdx(null);
    toast.success(`Paper run complete — ${ok} filled, ${fail} skipped`);
    portfolio.refresh();
  };

  const downloadReport = () => {
    if (!result) return;
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text("Vela Advisor — Full Report", 14, 18);
    doc.setFontSize(10); doc.setTextColor(120); doc.text(new Date().toLocaleString(), 14, 25); doc.setTextColor(0);
    doc.setFontSize(11); doc.text(`Risk profile: ${riskProfile}  |  Total: ${money(result.total_value, result.base_currency)}  |  Cash: ${money(result.cash_available, result.base_currency)}`, 14, 33);
    let y = 42;
    doc.setFontSize(13); doc.text("Gating decisions", 14, y); y += 4;
    autoTable(doc, {
      startY: y, head: [["Feature", "Allowed", "Reason"]],
      body: result.gating.decisions.map(d => [d.feature, d.allowed ? "Yes" : "No", d.reason]),
      styles: { fontSize: 9 }, headStyles: { fillColor: [30, 41, 59] },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(13); doc.text("Strategy lab — every strategy ranked", 14, y); y += 4;
    autoTable(doc, {
      startY: y, head: [["Strategy", "Family", "Ann Ret", "Ann Vol", "Sharpe", "Max DD", "Turnover", "Fit", "Score"]],
      body: result.strategies.map(s => [
        s.label, s.family,
        pct(s.stats.ann_return), pct(s.stats.ann_vol), s.stats.sharpe.toFixed(2), pct(s.stats.max_dd),
        pct(s.turnover_pct), s.suitability_fit.toFixed(2), s.score.toFixed(2),
      ]),
      styles: { fontSize: 9 }, headStyles: { fillColor: [30, 41, 59] },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
    const winner = result.strategies.find(s => s.name === result.winner);
    doc.setFontSize(13); doc.text(`Winner: ${winner?.label ?? "—"}`, 14, y); y += 6;
    doc.setFontSize(10); doc.text(doc.splitTextToSize(winner?.rationale ?? "", 180), 14, y); y += 16;
    doc.setFontSize(13); doc.text("Blended consensus (top 3 by score)", 14, y); y += 4;
    autoTable(doc, {
      startY: y, head: [["Symbol", "Class", "Target weight", "Current", "Drift"]],
      body: Object.entries(result.blended_weights).filter(([, w]) => Math.abs(w) > 0.001).sort((a, b) => b[1] - a[1]).map(([sym, w]) => [
        sym, result.classes[sym] ?? "equity", pct(w, 1), pct(result.current_weights[sym] ?? 0, 1), pct(w - (result.current_weights[sym] ?? 0), 1),
      ]),
      styles: { fontSize: 9 }, headStyles: { fillColor: [30, 41, 59] },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(13); doc.text(`Order plan (${basis})`, 14, y); y += 4;
    autoTable(doc, {
      startY: y, head: [["#", "Action", "Symbol", "Side", "Qty", "Price", "Notional", "Rationale"]],
      body: orders.map(o => [
        o.seq, ACTION_LABEL[o.action] ?? o.action, o.symbol_label ? `${o.symbol} — ${o.symbol_label}` : o.symbol,
        o.side, num(o.qty, 2), money(o.limit_price ?? o.est_price, o.currency), money(o.est_notional, o.currency),
        doc.splitTextToSize(o.rationale, 70),
      ]),
      styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [30, 41, 59] },
      columnStyles: { 7: { cellWidth: 60 } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text(doc.splitTextToSize(
      `Disclaimer — Educational research output. The Vela Advisor runs quantitative portfolio strategies on Yahoo-sourced market data; results depend on the data quality and lookback window. ${result.gating.unrestricted_master && hasSuitability ? "Suggestions reflect your suitability profile but are not a personalised investment recommendation under MiFID II." : "Long-only equity scope; unrestricted suggestions are disabled."} Do your own research and consult a licensed advisor before acting.`,
      180,
    ), 14, y);
    doc.save(`vela-advisor-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const updateOrder = (i: number, patch: Partial<OrderRow>) => {
    setEditableOrders(prev => prev.map((o, idx) => idx === i ? { ...o, ...patch } : o));
  };
  const removeOrder = (i: number) => setEditableOrders(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Advisor — Multi-Strategy Cross-Asset Engine | Vela" description="Run every portfolio strategy against your live book, get a blended consensus and a concrete order plan across equities, bonds, commodities, crypto, shorts and options. Gated by suitability." path="/advisor" />
      <TopNav />
      <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-7xl">
        <PageHeader icon={Sparkles} title="Advisor" description="Runs every portfolio strategy in parallel against your live book, picks a winner and a blended consensus, and drafts a concrete order plan you can fire into paper trading in one click." />
        <AiDisclaimerStrip variant="ai" />

        {hasSuitability === false && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm space-y-1">
                <div className="font-medium">Suitability assessment required for unrestricted advice</div>
                <div className="text-muted-foreground">Long-only equity suggestions still run, but shorts and derivatives stay gated until your <Link to="/suitability" className="text-primary underline">profile</Link> is on file.</div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Input bar */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Inputs</CardTitle>
            <CardDescription>The engine uses your live holdings ({portfolio.loading ? "…" : holdings.length}) plus cross-asset baskets when permitted.</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Risk profile</label>
              <Select value={riskProfile} onValueChange={setRiskProfile}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">Conservative</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="growth">Growth</SelectItem>
                  <SelectItem value="aggressive">Aggressive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Cash available</label>
              <Input type="number" value={cash} onChange={e => setCash(Number(e.target.value || 0))} />
            </div>
            <div className="sm:col-span-2 flex items-end gap-2">
              <Button onClick={run} disabled={running || portfolio.loading || !holdings.length} className="gap-2">
                {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {running ? "Running…" : "Run advisor"}
              </Button>
              <Button variant="outline" asChild className="gap-2">
                <Link to="/settings"><SettingsIcon className="h-4 w-4" /> Permissions</Link>
              </Button>
              {result && <Button variant="outline" onClick={downloadReport} className="gap-2"><FileDown className="h-4 w-4" /> Download report</Button>}
            </div>
          </CardContent>
        </Card>

        {running && <div className="space-y-3"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>}

        {result && (
          <>
            <GatingBanner gating={result.gating} />

            {/* Recommendation cards */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="border-primary/40 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /> Winner — {result.strategies.find(s => s.name === result.winner)?.label}</CardTitle>
                  <CardDescription>{result.strategies.find(s => s.name === result.winner)?.rationale}</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-4 gap-2 text-xs">
                  <Stat label="Ann return" value={pct(result.strategies[0].stats.ann_return)} />
                  <Stat label="Ann vol" value={pct(result.strategies[0].stats.ann_vol)} />
                  <Stat label="Sharpe" value={result.strategies[0].stats.sharpe.toFixed(2)} />
                  <Stat label="Max DD" value={pct(result.strategies[0].stats.max_dd)} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Blended consensus</CardTitle>
                  <CardDescription>Confidence-weighted blend of the top three strategies. More robust, less style-specific. This is the default basis for the order plan.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(result.blended_weights).filter(([, w]) => w > 0.005).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([sym, w]) => (
                      <Badge key={sym} variant="outline" className={CLASS_BADGE[result.classes[sym]] ?? ""}>{sym} {pct(w, 1)}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Strategy lab */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Strategy lab</CardTitle>
                <CardDescription>Every strategy ran in parallel against your live book. Ranked by score = 1.2·Sharpe − 0.7·|MaxDD| − 0.4·Turnover + 0.8·SuitabilityFit.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Strategy</TableHead><TableHead>Family</TableHead>
                    <TableHead className="text-right">Ann Ret</TableHead><TableHead className="text-right">Ann Vol</TableHead>
                    <TableHead className="text-right">Sharpe</TableHead><TableHead className="text-right">Max DD</TableHead>
                    <TableHead className="text-right">Turnover</TableHead><TableHead className="text-right">Fit</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {result.strategies.map((s, i) => (
                      <TableRow key={s.name} className={i === 0 ? "bg-primary/5" : ""}>
                        <TableCell className="font-medium">{s.label}{i === 0 && <Badge className="ml-2" variant="default">Winner</Badge>}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{s.family}</Badge></TableCell>
                        <TableCell className="text-right">{pct(s.stats.ann_return)}</TableCell>
                        <TableCell className="text-right">{pct(s.stats.ann_vol)}</TableCell>
                        <TableCell className="text-right">{s.stats.sharpe.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{pct(s.stats.max_dd)}</TableCell>
                        <TableCell className="text-right">{pct(s.turnover_pct)}</TableCell>
                        <TableCell className="text-right">{s.suitability_fit.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">{s.score.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Order plan */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-base">Order plan</CardTitle>
                    <CardDescription>Concrete, sized orders translating the chosen allocation into actions. Edit any row before firing — paper run uses your edits.</CardDescription>
                  </div>
                  <Tabs value={basis} onValueChange={v => setBasis(v as any)}>
                    <TabsList><TabsTrigger value="blended">Blended</TabsTrigger><TabsTrigger value="winner">Winner-only</TabsTrigger></TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No drift greater than 0.5% — your current allocation already matches the recommendation.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>#</TableHead><TableHead>Action</TableHead><TableHead>Asset</TableHead>
                        <TableHead>Side</TableHead><TableHead className="w-28">Qty</TableHead>
                        <TableHead className="w-32">Limit</TableHead><TableHead>Notional</TableHead>
                        <TableHead>Rationale</TableHead><TableHead></TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {orders.map((o, i) => (
                          <TableRow key={`${o.symbol}-${o.seq}`}>
                            <TableCell className="text-xs text-muted-foreground">{o.seq}</TableCell>
                            <TableCell><Badge variant="outline">{ACTION_LABEL[o.action] ?? o.action}</Badge></TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{o.symbol}</div>
                              <div className="text-[10px] text-muted-foreground">{o.symbol_label}</div>
                              <Badge variant="outline" className={`text-[9px] mt-1 ${CLASS_BADGE[o.asset_class] ?? ""}`}>{o.asset_class}{o.option_structure ? ` · ${o.option_structure}` : ""}</Badge>
                            </TableCell>
                            <TableCell><Badge variant={o.side.startsWith("buy") ? "default" : "secondary"}>{o.side}</Badge></TableCell>
                            <TableCell><Input type="number" className="h-8 w-24" value={o.qty} onChange={e => updateOrder(i, { qty: Number(e.target.value || 0) })} /></TableCell>
                            <TableCell><Input type="number" className="h-8 w-28" value={o.limit_price ?? ""} onChange={e => updateOrder(i, { limit_price: e.target.value ? Number(e.target.value) : undefined })} /></TableCell>
                            <TableCell className="text-sm">{money(o.qty * (o.limit_price ?? o.est_price ?? 0), o.currency)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-xs">{o.rationale}</TableCell>
                            <TableCell><Button size="sm" variant="ghost" onClick={() => removeOrder(i)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {orders.length > 0 && (
                  <div className="flex justify-end pt-2">
                    <Button onClick={fireAllPaper} disabled={executingIdx !== null} className="gap-2">
                      <Play className="h-4 w-4" /> Fire entire plan into paper trading
                    </Button>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 pt-2"><AlertTriangle className="h-3 w-3 mt-0.5" /> Option legs are listed for review but skipped by the paper engine, which currently handles equities only. Live order routing is intentionally not exposed.</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border bg-card p-2"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="font-mono text-sm">{value}</div></div>;
}

function GatingBanner({ gating }: { gating: Gating }) {
  const blocked = gating.decisions.filter(d => !d.allowed);
  if (!blocked.length) return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400">
      Unrestricted advisor active. Cross-asset, shorts and derivatives are all on the table.
    </div>
  );
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
      <div className="font-medium text-amber-700 dark:text-amber-400">Some action types are gated for this run:</div>
      <ul className="text-muted-foreground space-y-0.5">
        {blocked.map(d => (<li key={d.feature}>• <span className="font-medium capitalize">{d.feature.replace("_", " ")}</span>: {d.reason}</li>))}
      </ul>
      <div className="pt-1"><Link to="/settings" className="text-primary underline">Adjust your permissions →</Link></div>
    </div>
  );
}