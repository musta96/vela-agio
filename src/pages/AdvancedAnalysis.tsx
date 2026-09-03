import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FullBacktestReportCard } from "@/components/backtest/FullBacktestReportCard";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TickerSearch } from "@/components/TickerSearch";
import { AdvancedBacktestChart } from "@/components/backtest/AdvancedBacktestChart";
import { DetectorSettingsCard } from "@/components/backtest/DetectorSettingsCard";
import { supabase } from "@/integrations/supabase/client";
import { normalizeOhlcv } from "@/lib/ta/normalize";
import { computeIndicatorSeries, latestIndicatorSummary } from "@/lib/ta/indicators";
import { computeVolatility } from "@/lib/ta/volatility";
import { DEFAULT_DETECTOR_SETTINGS, type DetectorSettings } from "@/lib/ta/detectorSettings";
import type { Bar } from "@/lib/ta/types";
import { Activity, Loader2, RefreshCw, SlidersHorizontal } from "lucide-react";

const SETTINGS_KEY = "vela.advanced-analysis.detectors.v1";

export default function AdvancedAnalysis() {
  const [searchParams] = useSearchParams();
  const [symbol, setSymbol] = useState(() => searchParams.get("symbol")?.toUpperCase() || "AAPL");
  const [range, setRange] = useState("1y");
  const [bars, setBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSma, setShowSma] = useState(true);
  const [showBands, setShowBands] = useState(true);
  const [settings, setSettings] = useState<DetectorSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      return saved ? { ...DEFAULT_DETECTOR_SETTINGS, ...JSON.parse(saved) } : DEFAULT_DETECTOR_SETTINGS;
    } catch { return DEFAULT_DETECTOR_SETTINGS; }
  });

  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("market-data", {
        body: { action: "ohlc", symbol, range, interval: "1d" },
      });
      if (invokeError) throw invokeError;
      const normalized = normalizeOhlcv(data?.bars ?? []);
      if (normalized.length < 20) throw new Error("Not enough OHLCV history for this instrument.");
      setBars(normalized);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load market data."); setBars([]); }
    finally { setLoading(false); }
  };

  const indicators = useMemo(() => computeIndicatorSeries(bars), [bars]);
  const summary = useMemo(() => latestIndicatorSummary(bars), [bars]);
  const volatility = useMemo(() => computeVolatility(bars), [bars]);
  const indicatorData = useMemo(() => indicators.map((p) => ({ ...p, sma20: showSma ? p.sma20 : undefined, sma50: showSma ? p.sma50 : undefined, upperBand: showBands ? p.upperBand : undefined, lowerBand: showBands ? p.lowerBand : undefined })), [indicators, showBands, showSma]);

  return <div className="min-h-screen bg-background"><SEO title="Advanced Technical Analysis | Vela.ai" description="Advanced technical analysis with configurable detectors, indicators, and signal overlays." path="/advanced-analysis" /><TopNav /><main className="container mx-auto space-y-6 px-6 py-8">
    <div><div className="flex items-center gap-3"><Activity className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Advanced Analysis</h1></div><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Explore price structure, technical indicators, and advanced detector signals on one causal chart.</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-primary" /> Analysis workspace</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_150px_auto] md:items-end"><div className="space-y-2"><Label>Instrument</Label><TickerSearch value={symbol} onValueChange={setSymbol} onSelect={(hit) => setSymbol(hit.symbol)} placeholder="Search an instrument" /></div><div className="space-y-2"><Label htmlFor="analysis-range">History</Label><select id="analysis-range" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={range} onChange={(e) => setRange(e.target.value)}><option value="6mo">6 months</option><option value="1y">1 year</option><option value="3y">3 years</option><option value="5y">5 years</option></select></div><Button onClick={load} disabled={loading} className="gap-2">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {loading ? "Loading…" : "Load analysis"}</Button><div className="flex items-center gap-3"><div className="flex items-center gap-2"><Switch checked={showSma} onCheckedChange={setShowSma} id="sma" /><Label htmlFor="sma">MAs</Label></div><div className="flex items-center gap-2"><Switch checked={showBands} onCheckedChange={setShowBands} id="bands" /><Label htmlFor="bands">Bands</Label></div></div></CardContent></Card>
    {error && <div role="alert" className="border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
    {bars.length > 0 && <><div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Metric label="Last close" value={bars.at(-1)?.close.toFixed(2) ?? "—"} /><Metric label="SMA 20" value={summary?.sma20?.toFixed(2) ?? "—"} /><Metric label="SMA 50" value={summary?.sma50?.toFixed(2) ?? "—"} /><Metric label="RSI 14" value={summary?.rsi14?.toFixed(1) ?? "—"} /><Metric label="Volatility" value={volatility ? `${volatility.realizedVolAnnualPct.toFixed(1)}%` : "—"} /></div><Card><CardHeader className="pb-2"><CardTitle className="text-base">Indicator readout</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm md:grid-cols-4"><Readout label="Trend" value={summary?.sma20 && summary?.sma50 ? (summary.sma20 >= summary.sma50 ? "Fast average above slow" : "Fast average below slow") : "Waiting for history"} /><Readout label="Momentum" value={summary?.rsi14 == null ? "Waiting for history" : summary.rsi14 >= 70 ? "Overbought" : summary.rsi14 <= 30 ? "Oversold" : "Neutral"} /><Readout label="Bollinger position" value={summary?.bollingerPosition == null ? "Waiting for history" : `${(summary.bollingerPosition * 100).toFixed(0)}% of band`} /><Readout label="Volatility regime" value={volatility?.regime ?? "Waiting for history"} /></CardContent></Card><AdvancedBacktestChart bars={bars} indicators={indicatorData} settings={settings} /><DetectorSettingsCard settings={settings} onChange={setSettings} /><IndicatorTable data={indicatorData.slice(-12)} /></>}
  </main></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <Card className="p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-mono text-lg font-semibold">{value}</p></Card>; }
function Readout({ label, value }: { label: string; value: string }) { return <div className="border-l-2 border-primary/40 pl-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function IndicatorTable({ data }: { data: ReturnType<typeof computeIndicatorSeries> }) { return <Card><CardHeader><CardTitle className="text-base">Latest indicator values</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="pb-2">Date</th><th className="pb-2">Close</th><th className="pb-2">SMA 20</th><th className="pb-2">SMA 50</th><th className="pb-2">RSI 14</th><th className="pb-2">BB upper / lower</th></tr></thead><tbody>{data.map((p) => <tr key={p.t} className="border-b border-border/50"><td className="py-2">{new Date(p.t).toLocaleDateString()}</td><td className="py-2 font-mono">{p.close.toFixed(2)}</td><td className="py-2 font-mono">{p.sma20?.toFixed(2) ?? "—"}</td><td className="py-2 font-mono">{p.sma50?.toFixed(2) ?? "—"}</td><td className="py-2 font-mono">{p.rsi14?.toFixed(1) ?? "—"}</td><td className="py-2 font-mono">{p.upperBand?.toFixed(2) ?? "—"} / {p.lowerBand?.toFixed(2) ?? "—"}</td></tr>)}</tbody></table></CardContent></Card>; }
