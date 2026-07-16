import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { GitCompare } from "lucide-react";
import { simulateCustom, type Bar } from "@/lib/backtest/clientSim";
import type { CostConfig } from "@/lib/backtest/costs";
import type { TradingStrategyVersionRow } from "@/lib/ta/strategyTypes";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  strategyId: string | null;
  bars: Bar[];
  initial: number;
  costs: CostConfig;
  walkForwardSplits?: number;
}

interface VersionRun {
  version: TradingStrategyVersionRow;
  totalReturn: number;
  maxDD: number;
  sharpe: number;
  winRate: number;
  trades: number;
  wfReturns: number[]; // per-window return %
}

function walkForwardReturns(equity: { t: number; value: number }[], splits: number): number[] {
  if (equity.length < splits * 4) return [];
  const size = Math.floor(equity.length / splits);
  const out: number[] = [];
  for (let i = 0; i < splits; i++) {
    const from = i * size;
    const to = i === splits - 1 ? equity.length - 1 : (i + 1) * size - 1;
    const s = equity[from].value;
    const e = equity[to].value;
    out.push(s > 0 ? ((e - s) / s) * 100 : 0);
  }
  return out;
}

export function VersionCompareCard({ strategyId, bars, initial, costs, walkForwardSplits = 4 }: Props) {
  const [versions, setVersions] = useState<TradingStrategyVersionRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [runs, setRuns] = useState<VersionRun[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!strategyId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("trading_strategy_versions")
        .select("*")
        .eq("strategy_id", strategyId)
        .order("version", { ascending: false });
      const rows = (data as TradingStrategyVersionRow[]) ?? [];
      setVersions(rows);
      // Preselect the 2 latest versions
      setSelected(new Set(rows.slice(0, 2).map((v) => v.version)));
    })();
  }, [strategyId]);

  const compare = () => {
    setLoading(true);
    const chosen = versions.filter((v) => selected.has(v.version));
    const out: VersionRun[] = chosen.map((v) => {
      const res = simulateCustom(bars, {
        entry: v.entry_rules ?? [],
        exit:  v.exit_rules  ?? [],
        risk:  v.risk_config ?? {},
      }, initial, costs);
      return {
        version: v,
        totalReturn: res.metrics.totalReturn,
        maxDD: res.metrics.maxDrawdown,
        sharpe: res.metrics.sharpe,
        winRate: res.metrics.winRate,
        trades: res.metrics.totalTrades,
        wfReturns: walkForwardReturns(res.equity, walkForwardSplits),
      };
    });
    setRuns(out);
    setLoading(false);
  };

  const best = useMemo(() => {
    if (runs.length === 0) return null;
    let bestRet = -Infinity, bestSharpe = -Infinity, bestRobust = -Infinity;
    let idxRet = 0, idxSharpe = 0, idxRobust = 0;
    runs.forEach((r, i) => {
      if (r.totalReturn > bestRet) { bestRet = r.totalReturn; idxRet = i; }
      if (r.sharpe > bestSharpe)   { bestSharpe = r.sharpe;   idxSharpe = i; }
      const positive = r.wfReturns.filter((x) => x > 0).length;
      const score = positive - (r.wfReturns.length - positive);
      if (score > bestRobust) { bestRobust = score; idxRobust = i; }
    });
    return { idxRet, idxSharpe, idxRobust };
  }, [runs]);

  if (!strategyId) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2"><GitCompare className="h-4 w-4 text-primary" /><CardTitle className="text-base">Compare strategy versions</CardTitle></div>
        <CardDescription className="text-xs">
          Re-runs each selected saved version on the same basket, costs, and range — plus a walk-forward split so you can see which iteration is most robust.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {versions.length === 0 && (
          <p className="text-xs text-muted-foreground">No saved versions found for this strategy.</p>
        )}
        {versions.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-40 overflow-auto">
            {versions.map((v) => {
              const on = selected.has(v.version);
              return (
                <label key={v.id} className={`flex items-center gap-2 p-2 rounded border text-xs cursor-pointer ${on ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}>
                  <Checkbox checked={on} onCheckedChange={() => {
                    const next = new Set(selected);
                    if (on) next.delete(v.version); else next.add(v.version);
                    setSelected(next);
                  }} />
                  <div className="min-w-0">
                    <p className="font-semibold">v{v.version}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {new Date(v.created_at).toLocaleDateString()} · {v.entry_rules?.length ?? 0}/{v.exit_rules?.length ?? 0}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={compare} disabled={loading || selected.size < 2 || bars.length < 30}>
            {loading ? "Simulating…" : `Compare ${selected.size} versions`}
          </Button>
          {selected.size < 2 && (
            <p className="text-[11px] text-muted-foreground self-center">Select at least 2 versions.</p>
          )}
        </div>

        {runs.length > 0 && (
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-left py-1 pr-2">Version</th>
                  <th className="text-right py-1 pr-2">Return</th>
                  <th className="text-right py-1 pr-2">Max DD</th>
                  <th className="text-right py-1 pr-2">Sharpe</th>
                  <th className="text-right py-1 pr-2">Win %</th>
                  <th className="text-right py-1 pr-2">Trades</th>
                  <th className="text-left py-1 pr-2">Walk-forward windows</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr key={r.version.id} className="border-t border-border">
                    <td className="py-1.5 pr-2">
                      <span className="font-semibold">v{r.version.version}</span>
                      <div className="flex gap-1 mt-0.5">
                        {best?.idxRet    === i && <Badge variant="outline" className="text-[9px]">best return</Badge>}
                        {best?.idxSharpe === i && <Badge variant="outline" className="text-[9px]">best sharpe</Badge>}
                        {best?.idxRobust === i && <Badge variant="outline" className="text-[9px]">most robust</Badge>}
                      </div>
                    </td>
                    <td className={`text-right pr-2 font-semibold ${r.totalReturn >= 0 ? "text-success" : "text-destructive"}`}>
                      {r.totalReturn >= 0 ? "+" : ""}{r.totalReturn.toFixed(2)}%
                    </td>
                    <td className="text-right pr-2 text-destructive">{r.maxDD.toFixed(2)}%</td>
                    <td className="text-right pr-2">{r.sharpe.toFixed(2)}</td>
                    <td className="text-right pr-2">{r.winRate.toFixed(0)}%</td>
                    <td className="text-right pr-2 text-muted-foreground">{r.trades}</td>
                    <td className="pr-2">
                      <div className="flex gap-1">
                        {r.wfReturns.map((w, wi) => (
                          <span key={wi}
                                title={`W${wi + 1}: ${w.toFixed(2)}%`}
                                className={`inline-block h-4 w-6 rounded text-[9px] text-center leading-4 ${
                                  w > 0 ? "bg-success/25 text-success" : w < 0 ? "bg-destructive/25 text-destructive" : "bg-muted"
                                }`}>
                            {w >= 0 ? "+" : ""}{w.toFixed(0)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}