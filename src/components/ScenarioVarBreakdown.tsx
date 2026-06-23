import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Layers, ShieldAlert } from "lucide-react";
import {
  scenarioByAssetClassMatrix,
  varCvarByAssetClass,
  type BreakdownPosition,
} from "@/lib/scenarioVar";
import { MACRO_SCENARIOS } from "@/lib/quantScenarios";
import { useStableMemo } from "@/lib/computeCache";

const ALL_CONFIDENCES = [0.95, 0.975, 0.99] as const;
const DEFAULT_CONFIDENCES = [0.95, 0.99];

export interface ScenarioVarBreakdownProps {
  positions: BreakdownPosition[];
  currency?: string;
  /** Limit to a curated set of scenarios. Defaults to all `MACRO_SCENARIOS`. */
  scenarioIds?: string[];
}

export function ScenarioVarBreakdown({ positions, currency = "€", scenarioIds }: ScenarioVarBreakdownProps) {
  const [confidences, setConfidences] = useState<number[]>(DEFAULT_CONFIDENCES);

  const scenarios = useMemo(
    () => (scenarioIds?.length
      ? MACRO_SCENARIOS.filter((s) => scenarioIds.includes(s.id))
      : MACRO_SCENARIOS.slice(0, 6)),
    [scenarioIds],
  );

  // Cache keyed by content — recomputes only when positions or confidences change.
  const varCvar = useStableMemo(
    () => varCvarByAssetClass(positions, confidences),
    { positions: positions.map((p) => ({ s: p.symbol, v: p.value, n: p.closes?.length ?? 0 })), confidences },
  );

  const matrix = useStableMemo(
    () => scenarioByAssetClassMatrix(positions, scenarios),
    { positions: positions.map((p) => ({ s: p.symbol, v: p.value })), scenarios: scenarios.map((s) => s.id) },
  );

  const fmtMoney = (v: number) =>
    `${v < 0 ? "−" : ""}${currency}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtPct = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

  if (!positions.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> VaR / CVaR &amp; scenario breakdown
            </CardTitle>
            <CardDescription>
              Per asset class, with portfolio aggregate. Historical VaR/CVaR from 1Y daily returns; scenario P/L from the macro engine.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {ALL_CONFIDENCES.map((c) => {
              const active = confidences.includes(c);
              return (
                <Button
                  key={c}
                  size="sm"
                  variant={active ? "default" : "ghost"}
                  className="h-7 text-xs px-2.5"
                  onClick={() => setConfidences((cur) =>
                    cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c].sort(),
                  )}
                  aria-pressed={active}
                >
                  {(c * 100).toFixed(c === 0.975 ? 1 : 0)}%
                </Button>
              );
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* VaR / CVaR table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 pr-3">Asset class</th>
                <th className="py-1.5 pr-3 text-right">Value</th>
                <th className="py-1.5 pr-3 text-right">Weight</th>
                {confidences.map((c) => (
                  <th key={`var-${c}`} className="py-1.5 pr-3 text-right">VaR {(c * 100).toFixed(c === 0.975 ? 1 : 0)}%</th>
                ))}
                {confidences.map((c) => (
                  <th key={`cvar-${c}`} className="py-1.5 pr-3 text-right">CVaR {(c * 100).toFixed(c === 0.975 ? 1 : 0)}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...varCvar.byClass, varCvar.portfolio].map((row, idx) => {
                const isPortfolio = row.assetClass === "Portfolio";
                return (
                  <tr
                    key={`${row.assetClass}-${idx}`}
                    className={`border-b border-border/40 ${isPortfolio ? "font-semibold bg-muted/40" : ""}`}
                  >
                    <td className="py-1.5 pr-3 flex items-center gap-2">
                      {isPortfolio ? (
                        <ShieldAlert className="h-3 w-3 text-primary" />
                      ) : (
                        <Badge variant="outline" className="text-[10px] font-normal">{row.assetClass}</Badge>
                      )}
                      {isPortfolio && <span>Portfolio total</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono">{fmtMoney(row.value)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-xs">{(row.weight * 100).toFixed(1)}%</td>
                    {confidences.map((c) => (
                      <td key={`var-${c}-${idx}`} className="py-1.5 pr-3 text-right font-mono text-bear">
                        {row.observations > 0 ? `${(row.varByConf[c] * 100).toFixed(2)}%` : "—"}
                      </td>
                    ))}
                    {confidences.map((c) => (
                      <td key={`cvar-${c}-${idx}`} className="py-1.5 pr-3 text-right font-mono text-bear">
                        {row.observations > 0 ? `${(row.cvarByConf[c] * 100).toFixed(2)}%` : "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Scenario pivot */}
        {matrix.rows.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Scenario P/L by asset class
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-1.5 pr-3">Asset class</th>
                    {matrix.scenarios.map((s) => (
                      <th key={s.id} className="py-1.5 pr-3 text-right whitespace-nowrap" title={s.description}>
                        {s.name}
                      </th>
                    ))}
                    <th className="py-1.5 pr-3 text-right">Worst</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((row) => {
                    const isPortfolio = row.assetClass === "Portfolio";
                    return (
                      <tr
                        key={row.assetClass}
                        className={`border-b border-border/40 ${isPortfolio ? "font-semibold bg-muted/40" : ""}`}
                      >
                        <td className="py-1.5 pr-3">
                          {isPortfolio ? "Portfolio total" : (
                            <Badge variant="outline" className="text-[10px] font-normal">{row.assetClass}</Badge>
                          )}
                        </td>
                        {row.cells.map((c) => (
                          <td
                            key={c.scenarioId}
                            className={`py-1.5 pr-3 text-right font-mono ${c.pnlPct >= 0 ? "text-bull" : "text-bear"}`}
                            title={`${fmtMoney(c.pnl)}`}
                          >
                            {fmtPct(c.pnlPct, 1)}
                          </td>
                        ))}
                        <td className="py-1.5 pr-3 text-right font-mono text-bear">
                          {row.worst ? fmtPct(row.worst.pnlPct, 1) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ScenarioVarBreakdown;