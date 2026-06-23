import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Layers, ShieldAlert, X } from "lucide-react";
import {
  scenarioByAssetClassMatrix,
  varCvarByAssetClass,
  type BreakdownPosition,
  type ScenarioByClassRow,
} from "@/lib/scenarioVar";
import { MACRO_SCENARIOS } from "@/lib/quantScenarios";
import { useStableMemo } from "@/lib/computeCache";
import { downloadCsv } from "@/lib/csvUtil";

const ALL_CONFIDENCES = [0.95, 0.975, 0.99] as const;
const DEFAULT_CONFIDENCES = [0.95, 0.99];

export interface ScenarioVarBreakdownProps {
  positions: BreakdownPosition[];
  currency?: string;
  /** Limit to a curated set of scenarios. Defaults to all `MACRO_SCENARIOS`. */
  scenarioIds?: string[];
  /** Fired when the user clicks an asset-class row. `null` means cleared. */
  onSelectAssetClass?: (assetClass: string | null) => void;
}

export function ScenarioVarBreakdown({ positions, currency = "€", scenarioIds, onSelectAssetClass }: ScenarioVarBreakdownProps) {
  const [confidences, setConfidences] = useState<number[]>(DEFAULT_CONFIDENCES);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  const select = (cls: string | null) => {
    setSelectedClass(cls);
    onSelectAssetClass?.(cls);
  };

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

  const selectedScenarioRow: ScenarioByClassRow | null = useMemo(
    () => (selectedClass ? matrix.rows.find((r) => r.assetClass === selectedClass) ?? null : null),
    [matrix, selectedClass],
  );

  const fmtMoney = (v: number) =>
    `${v < 0 ? "−" : ""}${currency}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtPct = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

  const exportVarCsv = () => {
    const header = [
      "Asset class", "Value", "Weight",
      ...confidences.map((c) => `VaR ${(c * 100).toFixed(c === 0.975 ? 1 : 0)}%`),
      ...confidences.map((c) => `CVaR ${(c * 100).toFixed(c === 0.975 ? 1 : 0)}%`),
      "Observations",
    ];
    const rows = [...varCvar.byClass, varCvar.portfolio].map((row) => [
      row.assetClass,
      row.value,
      row.weight,
      ...confidences.map((c) => row.observations > 0 ? row.varByConf[c] : ""),
      ...confidences.map((c) => row.observations > 0 ? row.cvarByConf[c] : ""),
      row.observations,
    ]);
    downloadCsv(`var-cvar-breakdown-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  const exportScenarioCsv = () => {
    const header = ["Asset class", "Value", ...matrix.scenarios.flatMap((s) => [`${s.name} P/L %`, `${s.name} P/L`]), "Worst scenario", "Worst P/L %"];
    const rows = matrix.rows.map((r) => [
      r.assetClass,
      r.value,
      ...r.cells.flatMap((c) => [c.pnlPct, c.pnl]),
      r.worst?.scenarioName ?? "",
      r.worst?.pnlPct ?? "",
    ]);
    downloadCsv(`scenario-pnl-matrix-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

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
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={exportVarCsv} title="Download VaR / CVaR breakdown as CSV">
              <Download className="h-3.5 w-3.5" /> VaR CSV
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={exportScenarioCsv} title="Download scenario P/L matrix as CSV">
              <Download className="h-3.5 w-3.5" /> Scenario CSV
            </Button>
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
                const isSelected = !isPortfolio && selectedClass === row.assetClass;
                return (
                  <tr
                    key={`${row.assetClass}-${idx}`}
                    onClick={() => !isPortfolio && select(isSelected ? null : row.assetClass)}
                    className={[
                      "border-b border-border/40 transition-colors",
                      isPortfolio ? "font-semibold bg-muted/40" : "cursor-pointer hover:bg-muted/30",
                      isSelected ? "bg-warning/10 ring-1 ring-warning/40" : "",
                    ].join(" ")}
                    aria-pressed={isSelected || undefined}
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
          <div className="mt-1 text-[10px] text-muted-foreground italic">Tip: click an asset class to drill into its scenario detail below.</div>
        </div>

        {/* Scenario pivot */}
        {matrix.rows.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Scenario P/L by asset class {selectedClass ? <span className="text-warning">· focus: {selectedClass}</span> : null}
              </div>
              {selectedClass && (
                <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1" onClick={() => select(null)}>
                  <X className="h-3 w-3" /> Clear focus
                </Button>
              )}
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
                    const isSelected = !isPortfolio && selectedClass === row.assetClass;
                    const dim = selectedClass && !isSelected && !isPortfolio;
                    return (
                      <tr
                        key={row.assetClass}
                        className={[
                          "border-b border-border/40 transition-opacity",
                          isPortfolio ? "font-semibold bg-muted/40" : "",
                          isSelected ? "bg-warning/10 ring-1 ring-warning/40" : "",
                          dim ? "opacity-50" : "",
                        ].join(" ")}
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

        {/* Drilldown panel: per-class scenario distribution */}
        {selectedScenarioRow && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                {selectedScenarioRow.assetClass} · scenario P/L distribution
              </div>
              <div className="text-[11px] text-muted-foreground font-mono">
                worst {selectedScenarioRow.worst ? fmtPct(selectedScenarioRow.worst.pnlPct, 1) : "—"} ·
                exposure {fmtMoney(selectedScenarioRow.value)}
              </div>
            </div>
            <div>
              <div className="flex items-end gap-1.5 h-20">
                {selectedScenarioRow.cells.map((c) => {
                  const max = Math.max(0.01, ...selectedScenarioRow.cells.map((x) => Math.abs(x.pnlPct)));
                  const h = `${Math.max(4, (Math.abs(c.pnlPct) / max) * 100)}%`;
                  const isWorst = selectedScenarioRow.worst?.scenarioId === c.scenarioId;
                  const bg = c.pnlPct >= 0 ? "bg-bull/60" : "bg-bear/60";
                  const ring = isWorst ? "ring-2 ring-warning" : "";
                  return (
                    <div key={c.scenarioId} className="flex-1 flex flex-col items-center gap-1" title={`${c.scenarioName}: ${fmtPct(c.pnlPct, 2)} (${fmtMoney(c.pnl)})`}>
                      <div className={`w-full rounded-t ${bg} ${ring}`} style={{ height: h }} />
                      <div className="text-[9px] text-muted-foreground truncate w-full text-center">{c.scenarioName.split(" ")[0]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ScenarioVarBreakdown;