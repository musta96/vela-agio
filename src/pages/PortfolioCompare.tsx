// Proposed vs existing portfolio comparison: computes overlap, diversification
// impact and rebalance suggestions when integrating a new allocation into the
// user's current holdings.

import { useMemo, useState } from "react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TickerSearch } from "@/components/TickerSearch";
import { usePortfolio } from "@/hooks/usePortfolio";
import { computeImpact, type ImpactReport } from "@/lib/portfolio/impact";
import { GitCompare, Plus, X, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ProposedRow { symbol: string; weight: number }

export default function PortfolioCompare() {
  const { positions, marketValue } = usePortfolio();
  const [proposed, setProposed] = useState<ProposedRow[]>([]);
  const [newSymbol, setNewSymbol] = useState("");
  const [capital, setCapital] = useState<number>(0);

  const current = useMemo(
    () => positions.map((p) => ({ symbol: p.holding.symbol, value: p.marketValue })),
    [positions],
  );

  const effectiveCapital = capital > 0 ? capital : marketValue;

  const report: ImpactReport | null = useMemo(() => {
    if (!proposed.length) return null;
    return computeImpact({
      current,
      proposed: proposed.map((p) => ({ symbol: p.symbol, amount: p.weight })),
      proposedCapital: effectiveCapital,
      proposedMode: "weights",
    });
  }, [current, proposed, effectiveCapital]);

  const totalWeight = proposed.reduce((s, p) => s + p.weight, 0);

  const addLeg = () => {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym || proposed.some((p) => p.symbol === sym)) return;
    setProposed((rows) => [...rows, { symbol: sym, weight: Math.max(0, 100 - totalWeight) }]);
    setNewSymbol("");
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO
        title="Proposed vs Current Portfolio | Vela.ai"
        description="Compare a proposed allocation with your existing portfolio: overlap, diversification impact and rebalancing suggestions."
        path="/portfolio-compare"
      />
      <PageHeader
        icon={GitCompare}
        title="Proposed vs Current Portfolio"
        description="Evaluate how a new strategy or allocation integrates with your current holdings — overlap, diversification and rebalance actions."
      />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr] items-start">
        <Card className="p-5 rounded-2xl space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Current portfolio</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {positions.length} holding{positions.length === 1 ? "" : "s"} · NAV {marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="capital">New capital to deploy</Label>
            <Input
              id="capital"
              type="number"
              min={0}
              placeholder={`Defaults to current NAV (${marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })})`}
              value={capital || ""}
              onChange={(e) => setCapital(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label>Proposed allocation</Label>
            <div className="flex gap-2">
              <TickerSearch value={newSymbol} onValueChange={setNewSymbol} onSelect={(hit) => setNewSymbol(hit.symbol)} placeholder="Add instrument" />
              <Button variant="outline" size="icon" onClick={addLeg} disabled={!newSymbol.trim()} aria-label="Add instrument"><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-2">
              {proposed.map((p) => (
                <div key={p.symbol} className="flex items-center gap-2">
                  <span className="font-mono text-sm w-24 truncate">{p.symbol}</span>
                  <Input
                    type="number" min={0} max={100} step={1}
                    className="h-8 w-24"
                    value={p.weight}
                    onChange={(e) => setProposed((rows) => rows.map((r) => r.symbol === p.symbol ? { ...r, weight: Number(e.target.value) || 0 } : r))}
                    aria-label={`Weight for ${p.symbol}`}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  <button onClick={() => setProposed((rows) => rows.filter((r) => r.symbol !== p.symbol))} aria-label={`Remove ${p.symbol}`}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              ))}
              {!proposed.length && <p className="text-xs text-muted-foreground">Add at least one instrument to build the proposed allocation.</p>}
            </div>
            {proposed.length > 0 && Math.abs(totalWeight - 100) > 0.01 && (
              <p className="text-xs text-warning">Weights sum to {totalWeight.toFixed(0)}% — they will be normalized to 100%.</p>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          {!report && (
            <Card className="p-8 rounded-2xl text-center text-sm text-muted-foreground">
              Build a proposed allocation on the left to see the integration report.
            </Card>
          )}

          {report && (
            <>
              <Card className="p-5 rounded-2xl">
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <p className="text-xs text-muted-foreground">Diversification verdict</p>
                    <p className={`mt-1 flex items-center gap-2 text-lg font-semibold ${
                      report.diversification.verdict === "improves" ? "text-success" : report.diversification.verdict === "worsens" ? "text-destructive" : "text-muted-foreground"
                    }`}>
                      {report.diversification.verdict === "improves" ? <TrendingUp className="h-5 w-5" /> : report.diversification.verdict === "worsens" ? <TrendingDown className="h-5 w-5" /> : <Minus className="h-5 w-5" />}
                      {report.diversification.verdict === "improves" ? "Improves diversification" : report.diversification.verdict === "worsens" ? "Reduces diversification" : "Neutral impact"}
                    </p>
                  </div>
                  <Score label="Current" value={report.diversification.currentScore} />
                  <Score label="Proposed" value={report.diversification.proposedScore} />
                  <Score label="Combined" value={report.diversification.combinedScore} delta={report.diversification.delta} />
                  <div>
                    <p className="text-xs text-muted-foreground">Capital deployed</p>
                    <p className="mt-1 font-mono text-lg font-semibold">{report.base.proposedCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })} {report.base.currency}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-5 rounded-2xl">
                <h3 className="text-sm font-semibold mb-3">Rebalance suggestions</h3>
                <div className="space-y-2">
                  {report.rebalanceSuggestions.map((s) => (
                    <div key={s.symbol} className="flex items-start justify-between gap-4 border-b border-border/50 pb-2 text-sm last:border-0">
                      <div>
                        <span className="font-mono font-medium">{s.symbol}</span>
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.action === "add" || s.action === "open" ? "bg-success/10 text-success"
                          : s.action === "trim" || s.action === "close" ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                        }`}>{s.action}</span>
                        <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">{s.fromPct.toFixed(1)}% → {s.toPct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5 rounded-2xl">
                <h3 className="text-sm font-semibold mb-3">Sector overlap</h3>
                <OverlapTable cells={report.sectorOverlap} />
              </Card>

              <Card className="p-5 rounded-2xl">
                <h3 className="text-sm font-semibold mb-3">Combined positions</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="pb-2">Symbol</th><th className="pb-2">Sector</th><th className="pb-2">Current %</th><th className="pb-2">Proposed %</th><th className="pb-2">Combined %</th><th className="pb-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.combined.map((r) => (
                        <tr key={r.symbol} className="border-b border-border/50">
                          <td className="py-2 font-mono font-medium">
                            {r.symbol}
                            {r.duplicate && <span className="ml-2 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] text-warning">overlap</span>}
                          </td>
                          <td className="py-2 text-muted-foreground">{r.sector}</td>
                          <td className="py-2 font-mono">{r.currentPct.toFixed(1)}%</td>
                          <td className="py-2 font-mono">{r.proposedPct.toFixed(1)}%</td>
                          <td className="py-2 font-mono">{r.combinedPct.toFixed(1)}%</td>
                          <td className="py-2 text-xs text-muted-foreground">{r.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Score({ label, value, delta }: { label: string; value: number; delta?: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label} score</p>
      <p className="mt-1 font-mono text-lg font-semibold">
        {value}
        {delta != null && delta !== 0 && (
          <span className={`ml-1 text-xs ${delta > 0 ? "text-success" : "text-destructive"}`}>({delta > 0 ? "+" : ""}{delta})</span>
        )}
      </p>
    </div>
  );
}

function OverlapTable({ cells }: { cells: ImpactReport["sectorOverlap"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-2">Sector</th><th className="pb-2">Current</th><th className="pb-2">Proposed</th><th className="pb-2">Combined</th><th className="pb-2">Duplication</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((c) => (
            <tr key={c.key} className="border-b border-border/50">
              <td className="py-2 font-medium">{c.key}</td>
              <td className="py-2 font-mono">{c.currentPct.toFixed(1)}%</td>
              <td className="py-2 font-mono">{c.proposedPct.toFixed(1)}%</td>
              <td className="py-2 font-mono">{c.combinedPct.toFixed(1)}%</td>
              <td className={`py-2 font-mono ${c.duplication > 15 ? "text-warning" : "text-muted-foreground"}`}>{c.duplication.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
