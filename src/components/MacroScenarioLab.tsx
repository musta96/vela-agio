import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Sliders, TrendingDown, TrendingUp } from "lucide-react";
import {
  MACRO_SCENARIOS,
  applyMacroScenario,
  type MacroScenario,
  type MacroShock,
  type ScenarioPosition,
} from "@/lib/quantScenarios";

/**
 * Interactive macro scenario lab. Lets the user either pick a curated
 * historical regime (GFC, COVID, Stagflation, …) or dial custom shocks
 * with sliders. Shows expected P&L per position and per asset-class
 * bucket using each instrument's classification.
 */
export interface MacroScenarioLabProps {
  positions: ScenarioPosition[];
  currency?: string;
}

export function MacroScenarioLab({ positions, currency = "€" }: MacroScenarioLabProps) {
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [presetId, setPresetId] = useState<string>(MACRO_SCENARIOS[0].id);

  // Custom shock state (mirrors MacroShock fields)
  const [equity, setEquity] = useState<number>(-15);
  const [ratesBps, setRatesBps] = useState<number>(100);
  const [creditBps, setCreditBps] = useState<number>(150);
  const [oil, setOil] = useState<number>(0);
  const [gold, setGold] = useState<number>(0);
  const [usd, setUsd] = useState<number>(5);

  const scenario: MacroScenario = useMemo(() => {
    if (mode === "preset") {
      return MACRO_SCENARIOS.find((s) => s.id === presetId) ?? MACRO_SCENARIOS[0];
    }
    const shock: MacroShock = {
      equity: equity / 100,
      ratesBps,
      creditSpreadBps: creditBps,
      oil: oil / 100,
      gold: gold / 100,
      usd: usd / 100,
    };
    return {
      id: "custom",
      name: "Custom shock",
      description: "User-defined macro regime",
      shock,
    };
  }, [mode, presetId, equity, ratesBps, creditBps, oil, gold, usd]);

  const impact = useMemo(
    () => (positions.length ? applyMacroScenario(positions, scenario) : null),
    [positions, scenario],
  );

  const fmtPct = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
  const fmtMoney = (v: number) =>
    `${v >= 0 ? "+" : "−"}${currency}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  if (!positions.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-warning" /> Macro scenario lab
            </CardTitle>
            <CardDescription>
              Per-position sensitivities by asset class, sector and geography — not just portfolio beta.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <Button
              size="sm"
              variant={mode === "preset" ? "default" : "ghost"}
              onClick={() => setMode("preset")}
              className="h-7 text-xs"
            >
              Historical
            </Button>
            <Button
              size="sm"
              variant={mode === "custom" ? "default" : "ghost"}
              onClick={() => setMode("custom")}
              className="h-7 text-xs gap-1"
            >
              <Sliders className="h-3 w-3" /> Custom
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {mode === "preset" ? (
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={presetId} onValueChange={setPresetId}>
              <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MACRO_SCENARIOS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{scenario.description}</span>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <ShockSlider label="Equity shock" unit="%" value={equity} min={-50} max={30} step={1} onChange={setEquity} />
            <ShockSlider label="Rates move" unit="bps" value={ratesBps} min={-300} max={400} step={10} onChange={setRatesBps} />
            <ShockSlider label="Credit spreads" unit="bps" value={creditBps} min={-100} max={600} step={10} onChange={setCreditBps} />
            <ShockSlider label="Oil" unit="%" value={oil} min={-70} max={80} step={1} onChange={setOil} />
            <ShockSlider label="Gold" unit="%" value={gold} min={-30} max={50} step={1} onChange={setGold} />
            <ShockSlider label="USD vs basket" unit="%" value={usd} min={-15} max={15} step={1} onChange={setUsd} />
          </div>
        )}

        {impact && (
          <>
            {/* Headline P&L */}
            <div className="grid sm:grid-cols-3 gap-3">
              <Headline
                label="Portfolio P&L"
                value={fmtMoney(impact.pnl)}
                sub={fmtPct(impact.pnlPct)}
                tone={impact.pnl >= 0 ? "good" : "bad"}
                icon={impact.pnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              />
              <Headline
                label="Worst position"
                value={impact.byPosition.slice().sort((a, b) => a.shockPct - b.shockPct)[0]?.symbol ?? "—"}
                sub={
                  impact.byPosition.length
                    ? fmtPct(impact.byPosition.slice().sort((a, b) => a.shockPct - b.shockPct)[0].shockPct)
                    : ""
                }
                tone="bad"
              />
              <Headline
                label="Best position"
                value={impact.byPosition.slice().sort((a, b) => b.shockPct - a.shockPct)[0]?.symbol ?? "—"}
                sub={
                  impact.byPosition.length
                    ? fmtPct(impact.byPosition.slice().sort((a, b) => b.shockPct - a.shockPct)[0].shockPct)
                    : ""
                }
                tone="good"
              />
            </div>

            {/* By asset-class bucket */}
            {impact.byBucket.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">By asset class</div>
                <div className="space-y-1.5">
                  {impact.byBucket.map((b) => (
                    <div key={b.bucket} className="flex items-center gap-3 text-sm">
                      <div className="w-32 shrink-0 font-medium">{b.bucket}</div>
                      <div className="flex-1 h-2 bg-muted rounded overflow-hidden relative">
                        <div
                          className={`absolute top-0 h-full ${b.pnl >= 0 ? "bg-bull right-1/2" : "bg-bear left-1/2"}`}
                          style={{ width: `${Math.min(50, Math.abs(b.pnlPct) * 100)}%` }}
                        />
                        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border" />
                      </div>
                      <div className={`font-mono text-xs w-20 text-right ${b.pnl >= 0 ? "text-bull" : "text-bear"}`}>
                        {fmtPct(b.pnlPct)}
                      </div>
                      <div className={`font-mono text-xs w-24 text-right ${b.pnl >= 0 ? "text-bull" : "text-bear"}`}>
                        {fmtMoney(b.pnl)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top contributors table */}
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Position-level impact</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-1.5 pr-3">Symbol</th>
                      <th className="py-1.5 pr-3">Class</th>
                      <th className="py-1.5 pr-3">Sector</th>
                      <th className="py-1.5 pr-3">Geo</th>
                      <th className="py-1.5 pr-3 text-right">Weight</th>
                      <th className="py-1.5 pr-3 text-right">Shock</th>
                      <th className="py-1.5 pr-3 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impact.byPosition
                      .slice()
                      .sort((a, b) => a.pnl - b.pnl)
                      .map((p) => (
                        <tr key={p.symbol} className="border-b border-border/40">
                          <td className="py-1.5 pr-3 font-mono">{p.symbol}</td>
                          <td className="py-1.5 pr-3"><Badge variant="outline" className="text-[10px]">{p.meta.assetClass}</Badge></td>
                          <td className="py-1.5 pr-3 text-muted-foreground text-xs">{p.meta.sector}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground text-xs">{p.meta.geography}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-xs">{(p.weight * 100).toFixed(1)}%</td>
                          <td className={`py-1.5 pr-3 text-right font-mono ${p.shockPct >= 0 ? "text-bull" : "text-bear"}`}>{fmtPct(p.shockPct)}</td>
                          <td className={`py-1.5 pr-3 text-right font-mono ${p.pnl >= 0 ? "text-bull" : "text-bear"}`}>{fmtMoney(p.pnl)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ShockSlider({
  label, unit, value, min, max, step, onChange,
}: {
  label: string; unit: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-mono ${value < 0 ? "text-bear" : value > 0 ? "text-bull" : "text-muted-foreground"}`}>
          {value > 0 ? "+" : ""}{value}{unit}
        </span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

function Headline({
  label, value, sub, tone, icon,
}: {
  label: string; value: string; sub?: string; tone?: "good" | "bad"; icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold font-mono flex items-center gap-1.5 ${tone === "good" ? "text-bull" : tone === "bad" ? "text-bear" : ""}`}>
        {icon}{value}
      </div>
      {sub && <div className={`text-xs font-mono ${tone === "good" ? "text-bull" : tone === "bad" ? "text-bear" : "text-muted-foreground"}`}>{sub}</div>}
    </div>
  );
}

export default MacroScenarioLab;