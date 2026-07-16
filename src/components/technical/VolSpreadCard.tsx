import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, TrendingUpDown } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { computeVolSpread, backtestVolSpread, VOL_SPREAD_PRESETS, DEFAULT_VOL_SPREAD } from "@/lib/ta/volSpread";
import { supabase } from "@/integrations/supabase/client";

function fetchBarsFor(symbol: string, range: "6mo" | "1y" | "2y" = "1y") {
  return supabase.functions.invoke("market-history", { body: { symbol, range, interval: "1d" } })
    .then(({ data, error }) => {
      if (error) throw error;
      const bars = (data as any)?.bars ?? [];
      return bars as { t: number; close: number }[];
    });
}

export function VolSpreadCard() {
  const [preset, setPreset] = useState(VOL_SPREAD_PRESETS[0].label);
  const [entryZ, setEntryZ] = useState(DEFAULT_VOL_SPREAD.entryZ);
  const [exitZ, setExitZ] = useState(DEFAULT_VOL_SPREAD.exitZ);
  const [trendFilter, setTrendFilter] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volBars, setVolBars] = useState<{ t: number; close: number }[]>([]);
  const [uBars, setUBars] = useState<{ t: number; close: number }[]>([]);

  const chosen = VOL_SPREAD_PRESETS.find((p) => p.label === preset)!;

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [v, u] = await Promise.all([fetchBarsFor(chosen.volSymbol, "1y"), fetchBarsFor(chosen.underlyingSymbol, "1y")]);
      // Align by timestamp intersection.
      const uMap = new Map(u.map((b) => [b.t, b.close]));
      const alignedV: typeof v = []; const alignedU: typeof v = [];
      for (const b of v) { if (uMap.has(b.t)) { alignedV.push(b); alignedU.push({ t: b.t, close: uMap.get(b.t)! }); } }
      setVolBars(alignedV); setUBars(alignedU);
    } catch (e: any) { setError(e?.message ?? "load_failed"); }
    finally { setLoading(false); }
  };

  useEffect(() => { setVolBars([]); setUBars([]); }, [preset]);

  const analysis = useMemo(() => {
    if (volBars.length < 60) return null;
    const points = computeVolSpread(volBars, uBars, {
      entryZ, exitZ, trendEmaPeriod: trendFilter ? 20 : undefined,
    });
    const pnl = backtestVolSpread(points, uBars);
    return { points, pnl };
  }, [volBars, uBars, entryZ, exitZ, trendFilter]);

  const chartData = useMemo(() => {
    if (!analysis) return [];
    return analysis.points.map((p, i) => ({
      date: new Date(p.t).toLocaleDateString(),
      z: p.z,
      pnl: analysis.pnl.pnlPct[i - 1] ?? 0,
    }));
  }, [analysis]);

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUpDown className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Volatility spread</h3>
        {error && <Badge variant="destructive" className="ml-auto text-[10px]">{error}</Badge>}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Compares an implied-vol index to the realized vol of its underlying. Long spread = vol cheap (long vol / short underlying); short spread = vol rich.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <Label className="text-[11px]">Pair</Label>
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{VOL_SPREAD_PRESETS.map((p) => <SelectItem key={p.label} value={p.label} className="text-xs">{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px]">Entry |z| ≥ {entryZ.toFixed(2)}</Label>
          <Slider value={[entryZ]} min={0.5} max={3} step={0.1} onValueChange={(v) => setEntryZ(v[0])} className="mt-2" />
        </div>
        <div>
          <Label className="text-[11px]">Exit |z| ≤ {exitZ.toFixed(2)}</Label>
          <Slider value={[exitZ]} min={0} max={1} step={0.05} onValueChange={(v) => setExitZ(v[0])} className="mt-2" />
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-[11px]">Trend filter</Label>
            <div className="mt-1"><Switch checked={trendFilter} onCheckedChange={setTrendFilter} /></div>
          </div>
          <Button size="sm" onClick={load} disabled={loading} className="ml-auto"><Play className="h-3.5 w-3.5 mr-1" />{loading ? "Loading…" : "Load"}</Button>
        </div>
      </div>

      {analysis && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
            <Kpi label="Signals" value={String(analysis.pnl.trades)} />
            <Kpi label="Win rate" value={analysis.pnl.trades ? `${((analysis.pnl.wins / analysis.pnl.trades) * 100).toFixed(0)}%` : "—"} />
            <Kpi label="Total PnL" value={`${analysis.pnl.total.toFixed(2)}%`} tone={analysis.pnl.total >= 0 ? "success" : "destructive"} />
            <Kpi label="Latest z" value={analysis.points.at(-1)?.z?.toFixed(2) ?? "—"} />
          </div>
          <div className="w-full h-[260px]">
            <ResponsiveContainer>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="vspnl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" minTickGap={40} fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="l" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="r" orientation="right" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <ReferenceLine yAxisId="l" y={entryZ} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                <ReferenceLine yAxisId="l" y={-entryZ} stroke="hsl(var(--success))" strokeDasharray="3 3" />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                <Area yAxisId="l" type="monotone" dataKey="z" stroke="hsl(var(--muted-foreground))" fillOpacity={0.15} fill="hsl(var(--muted-foreground))" />
                <Area yAxisId="r" type="monotone" dataKey="pnl" stroke="hsl(var(--primary))" fill="url(#vspnl)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      {!analysis && !loading && (
        <p className="text-xs text-muted-foreground">Pick a pair and press Load to fetch series and compute the spread.</p>
      )}
    </Card>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "success" | "destructive" }) {
  const cls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="p-2 rounded border border-border">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${cls}`}>{value}</p>
    </div>
  );
}