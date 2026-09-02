import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TickerSearch } from "@/components/TickerSearch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Loader2, FileDown, LineChart, Layers, Info } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { computeImpact, type ImpactReport, type OverlapCell } from "@/lib/portfolio/impact";
import { computeRiskComparison, type RiskComparison } from "@/lib/portfolio/impactRisk";
import { saveAndDownloadImpactMemo } from "@/lib/portfolio/impactMemoPdf";
import { toast } from "sonner";

interface ProposedRow { symbol: string; weight: string; }

function OverlapHeatmap({ title, cells }: { title: string; cells: OverlapCell[] }) {
  const max = Math.max(1, ...cells.map((c) => c.combinedPct));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-6 text-[11px] uppercase text-muted-foreground px-3 py-1.5 border-b">
          <div className="col-span-2">Bucket</div>
          <div className="text-right">Current</div>
          <div className="text-right">Proposed</div>
          <div className="text-right">Combined</div>
          <div className="text-right">Overlap</div>
        </div>
        {cells.map((c) => {
          const ratio = Math.min(1, c.combinedPct / max);
          const bg = `hsl(215 60% ${Math.max(30, 92 - ratio * 55)}%)`;
          const isDup = c.duplication >= 15;
          return (
            <div key={c.key} className="grid grid-cols-6 items-center text-xs font-mono border-b last:border-b-0 px-3 py-1.5">
              <div className="col-span-2 truncate flex items-center gap-2">
                <span className="font-sans">{c.key}</span>
                {isDup && <Badge variant="destructive" className="text-[9px] py-0 px-1.5">DUP</Badge>}
              </div>
              <div className="text-right">{c.currentPct.toFixed(1)}%</div>
              <div className="text-right">{c.proposedPct.toFixed(1)}%</div>
              <div
                className="text-right rounded px-1"
                style={{ backgroundColor: bg, color: ratio > 0.55 ? "white" : "inherit" }}
              >
                {c.combinedPct.toFixed(1)}%
              </div>
              <div className={`text-right ${isDup ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                {c.duplication.toFixed(1)}%
              </div>
            </div>
          );
        })}
        {!cells.length && <div className="p-3 text-xs text-muted-foreground">No buckets yet — add proposed positions above.</div>}
      </CardContent>
    </Card>
  );
}

function RiskCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold font-mono">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default function ImpactPanel() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [holdings, setHoldings] = useState<{ symbol: string; shares: number; avg_price: number }[]>([]);
  const [proposed, setProposed] = useState<ProposedRow[]>([{ symbol: "", weight: "" }]);
  const [proposedCapital, setProposedCapital] = useState<string>("");
  const [currency] = useState("USD");
  const [risk, setRisk] = useState<RiskComparison | null>(null);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [strategyThesis, setStrategyThesis] = useState("");

  // Deep-link support: /rebalance?allocation=<json>&proposed_capital=<n>&thesis=<text>
  useEffect(() => {
    const alloc = searchParams.get("allocation");
    const cap = searchParams.get("proposed_capital");
    const thesis = searchParams.get("thesis");
    if (alloc) {
      try {
        const parsed = JSON.parse(alloc) as Record<string, number>;
        const rows = Object.entries(parsed).map(([symbol, w]) => ({ symbol, weight: String((Number(w) || 0) * 100) }));
        if (rows.length) setProposed(rows);
      } catch { /* ignore */ }
    }
    if (cap) setProposedCapital(cap);
    if (thesis) setStrategyThesis(thesis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("portfolio_holdings")
      .select("symbol,shares,avg_price")
      .eq("user_id", user.id)
      .then(({ data }) => setHoldings((data ?? []) as { symbol: string; shares: number; avg_price: number }[]));
  }, [user]);

  const { quotes } = useLiveQuotes(holdings.map((h) => h.symbol), 60_000);

  const currentHoldings = useMemo(() =>
    holdings.map((h) => ({
      symbol: h.symbol,
      value: h.shares * (quotes[h.symbol]?.price ?? h.avg_price ?? 0),
    })).filter((h) => h.value > 0),
  [holdings, quotes]);

  const currentNav = currentHoldings.reduce((s, h) => s + h.value, 0);
  const proposedCapNum = Number(proposedCapital) || currentNav || 100000;

  const impact: ImpactReport = useMemo(() => computeImpact({
    currency,
    current: currentHoldings,
    proposed: proposed
      .filter((r) => r.symbol.trim())
      .map((r) => ({ symbol: r.symbol.toUpperCase().trim(), amount: Number(r.weight) || 0 })),
    proposedCapital: proposedCapNum,
    proposedMode: "weights",
  }), [currency, currentHoldings, proposed, proposedCapNum]);

  const currentWeights = useMemo(() => {
    const out: Record<string, number> = {};
    if (currentNav <= 0) return out;
    for (const h of currentHoldings) out[h.symbol] = h.value / currentNav;
    return out;
  }, [currentHoldings, currentNav]);
  const proposedWeights = useMemo(() => {
    const raw = proposed
      .filter((r) => r.symbol.trim() && Number(r.weight) > 0)
      .map((r) => ({ s: r.symbol.toUpperCase().trim(), w: Number(r.weight) }));
    const total = raw.reduce((s, x) => s + x.w, 0);
    const out: Record<string, number> = {};
    if (total <= 0) return out;
    for (const r of raw) out[r.s] = (out[r.s] ?? 0) + r.w / total;
    return out;
  }, [proposed]);

  const proposedIsUsable = Object.keys(proposedWeights).length > 0;

  async function runRisk() {
    if (!proposedIsUsable && !Object.keys(currentWeights).length) {
      toast.error("Add at least one current or proposed position first.");
      return;
    }
    setLoadingRisk(true); setRisk(null);
    try {
      const res = await computeRiskComparison({
        currentWeights, proposedWeights,
        currentNav, proposedCapital: proposedCapNum,
      });
      setRisk(res);
    } catch (err) {
      console.error(err);
      toast.error("Risk computation failed. Check your symbols and try again.");
    } finally {
      setLoadingRisk(false);
    }
  }

  async function generatePdf() {
    if (!proposedIsUsable) { toast.error("Add a proposed allocation first."); return; }
    setSavingPdf(true);
    try {
      const res = await saveAndDownloadImpactMemo({
        title: "Portfolio Impact Memo",
        currency,
        impact,
        risk,
        strategyThesis: strategyThesis.trim() || undefined,
        userId: user?.id,
      });
      if (res.memoId) toast.success("PDF downloaded and saved to your memo history.");
      else toast.success("PDF downloaded.");
    } catch (e) {
      console.error(e);
      toast.error("Could not generate PDF.");
    } finally {
      setSavingPdf(false);
    }
  }

  const dv = impact.diversification;
  const deltaSign = dv.delta >= 0 ? "+" : "";
  const deltaCls = dv.verdict === "improves" ? "text-bull" : dv.verdict === "worsens" ? "text-bear" : "text-muted-foreground";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          Impact vs current portfolio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Proposed allocation input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Proposed allocation</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Proposed capital
              <Input
                type="number"
                value={proposedCapital}
                onChange={(e) => setProposedCapital(e.target.value)}
                className="h-8 w-32"
                placeholder={currentNav ? currentNav.toFixed(0) : "100000"}
              />
              {currency}
            </div>
          </div>
          {proposed.map((row, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <TickerSearch
                className="col-span-6"
                inputClassName="h-8"
                placeholder="Search instrument"
                value={row.symbol}
                onValueChange={(value) => setProposed((prev) => prev.map((r, j) => j === i ? { ...r, symbol: value } : r))}
                onSelect={(hit) => setProposed((prev) => prev.map((r, j) => j === i ? { ...r, symbol: hit.symbol.toUpperCase() } : r))}
              />
              <Input
                className="col-span-4 h-8"
                type="number"
                placeholder="Weight (%)"
                value={row.weight}
                onChange={(e) => setProposed((prev) => prev.map((r, j) => j === i ? { ...r, weight: e.target.value } : r))}
              />
              <Button
                variant="ghost" size="icon" className="col-span-2 h-8"
                onClick={() => setProposed((prev) => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)}
                aria-label="Remove row"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setProposed((prev) => [...prev, { symbol: "", weight: "" }])}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add leg
          </Button>
          <Input
            className="mt-2"
            placeholder="Optional: one-line strategy thesis (appears in the PDF memo)"
            value={strategyThesis}
            onChange={(e) => setStrategyThesis(e.target.value)}
            maxLength={280}
          />
        </div>

        {!currentNav && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No current holdings detected. The impact report will treat your proposal as a greenfield allocation.
            </AlertDescription>
          </Alert>
        )}

        {/* Diversification + Risk cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">Diversification score</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {dv.currentScore} → {dv.combinedScore}
              </div>
              <div className={`text-sm font-semibold ${deltaCls}`}>
                Δ {deltaSign}{dv.delta} · {dv.verdict}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                HHI {dv.currentHhi} → {dv.combinedHhi}. Higher score = risk spread more evenly.
              </div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader className="pb-1 flex flex-row items-center justify-between">
              <CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-1.5">
                <LineChart className="h-3.5 w-3.5" /> Risk before vs after {risk?.benchmark ? `· vs ${risk.benchmark}` : ""}
              </CardTitle>
              <Button size="sm" variant="outline" onClick={runRisk} disabled={loadingRisk}>
                {loadingRisk ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                {risk ? "Refresh" : "Compute"}
              </Button>
            </CardHeader>
            <CardContent>
              {!risk && !loadingRisk && (
                <p className="text-xs text-muted-foreground">Click compute to fetch OHLC and estimate vol, VaR and beta for current vs combined portfolios.</p>
              )}
              {risk && (
                <div className="grid grid-cols-4 gap-3">
                  <RiskCell label="" value="Portfolio" />
                  <RiskCell label="Vol (ann.)" value="" />
                  <RiskCell label="1d 95% VaR" value="" />
                  <RiskCell label={`Beta`} value="" />
                  {(["current","proposed","combined"] as const).map((k) => {
                    const r = risk[k];
                    return (
                      <div className="contents" key={k}>
                        <div className="text-xs font-semibold">{k === "combined" ? "After" : k === "proposed" ? "Proposed only" : "Current"}</div>
                        <div className="text-xs font-mono">{r ? `${(r.vol * 100).toFixed(1)}%` : "—"}</div>
                        <div className="text-xs font-mono">{r ? `${(r.var95 * 100).toFixed(2)}%` : "—"}</div>
                        <div className="text-xs font-mono">{r?.beta != null ? r.beta.toFixed(2) : "—"}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Overlap heatmaps + combined table */}
        <Tabs defaultValue="sector">
          <TabsList>
            <TabsTrigger value="sector">Sector overlap</TabsTrigger>
            <TabsTrigger value="geo">Geography overlap</TabsTrigger>
            <TabsTrigger value="positions">Combined positions</TabsTrigger>
            <TabsTrigger value="rebalance">Rebalance suggestions</TabsTrigger>
          </TabsList>
          <TabsContent value="sector">
            <OverlapHeatmap title="Sector exposure" cells={impact.sectorOverlap} />
          </TabsContent>
          <TabsContent value="geo">
            <OverlapHeatmap title="Geography exposure" cells={impact.geoOverlap} />
          </TabsContent>
          <TabsContent value="positions">
            <Card>
              <CardContent className="p-0">
                <div className="grid grid-cols-7 text-[11px] uppercase text-muted-foreground px-3 py-1.5 border-b">
                  <div>Symbol</div><div>Sector</div><div>Geo</div>
                  <div className="text-right">Current</div>
                  <div className="text-right">Proposed</div>
                  <div className="text-right">Combined</div>
                  <div className="text-right">Action</div>
                </div>
                {impact.combined.map((r) => (
                  <div key={r.symbol} className="grid grid-cols-7 items-center text-xs font-mono border-b last:border-b-0 px-3 py-1.5">
                    <div className="font-sans font-semibold">{r.symbol}</div>
                    <div className="font-sans truncate">{r.sector}</div>
                    <div className="font-sans truncate">{r.geography}</div>
                    <div className="text-right">{r.currentPct.toFixed(1)}%</div>
                    <div className="text-right">{r.proposedPct.toFixed(1)}%</div>
                    <div className="text-right font-semibold">{r.combinedPct.toFixed(1)}%</div>
                    <div className="text-right">
                      <Badge variant={r.duplicate ? "destructive" : "outline"} className="text-[9px]">
                        {r.action.toUpperCase()}{r.duplicate ? " · DUP" : ""}
                      </Badge>
                    </div>
                  </div>
                ))}
                {!impact.combined.length && <div className="p-3 text-xs text-muted-foreground">Add positions above to see the combined book.</div>}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="rebalance">
            <Card>
              <CardContent className="p-0">
                {!impact.rebalanceSuggestions.length && (
                  <div className="p-3 text-xs text-muted-foreground">No rebalancing flags — the proposal looks clean vs your current book.</div>
                )}
                {impact.rebalanceSuggestions.map((s, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start px-3 py-2 border-b last:border-b-0 text-xs">
                    <div className="col-span-3 font-mono font-semibold">{s.symbol}</div>
                    <div className="col-span-2">
                      <Badge variant={s.action === "trim" ? "destructive" : s.action === "open" ? "default" : "outline"} className="text-[10px]">{s.action.toUpperCase()}</Badge>
                    </div>
                    <div className="col-span-2 font-mono text-muted-foreground">{s.fromPct.toFixed(1)}% → {s.toPct.toFixed(1)}%</div>
                    <div className="col-span-5">{s.reason}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button onClick={generatePdf} disabled={savingPdf || !proposedIsUsable}>
            {savingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
            Generate unified impact PDF
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-right">
          Educational research only — not investment advice. Saved to your memo history under Documents.
        </p>
      </CardContent>
    </Card>
  );
}