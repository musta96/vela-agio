import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { CorrelationMatrix } from "@/components/CorrelationMatrix";
import { RefreshCw } from "lucide-react";

const LOOKBACKS = [
  { value: "3mo", label: "3M" },
  { value: "1y",  label: "1Y" },
  { value: "3y",  label: "3Y" },
] as const;
type Lookback = typeof LOOKBACKS[number]["value"];

export default function Rebalance() {
  const { user } = useAuth();
  const [holdings, setHoldings] = useState<{ symbol: string; shares: number; avg_price: number }[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [band, setBand] = useState(5);
  const [lookback, setLookback] = useState<Lookback>("1y");
  const [corrSyms, setCorrSyms] = useState<string[]>([]);
  const [corrReturns, setCorrReturns] = useState<number[][]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("portfolio_holdings").select("symbol,shares,avg_price").eq("user_id", user.id)
      .then(({ data }) => {
        const h = (data ?? []) as any[];
        setHoldings(h);
        const eq = h.length ? 100 / h.length : 0;
        setTargets(Object.fromEntries(h.map(x => [x.symbol, eq])));
      });
  }, [user]);

  // Pull 1y of daily OHLC for every current holding so we can show a
  // correlation matrix alongside the drift table. Concentrated holdings
  // (high pairwise ρ) are the ones rebalancing rarely actually de-risks.
  useEffect(() => {
    let cancelled = false;
    const syms = holdings.map(h => h.symbol);
    if (!syms.length) { setCorrSyms([]); setCorrReturns([]); return; }
    (async () => {
      const series: number[][] = [];
      for (const s of syms) {
        const { data } = await supabase.functions.invoke("market-data", {
          body: { action: "ohlc", symbol: s, range: lookback, interval: "1d" },
        });
        const bars = (data?.bars ?? []) as { close: number }[];
        const rets: number[] = [];
        for (let i = 1; i < bars.length; i++) rets.push(Math.log(bars[i].close / bars[i - 1].close));
        series.push(rets);
      }
      if (cancelled) return;
      const T = Math.min(...series.map(s => s.length));
      if (!T || !isFinite(T)) { setCorrSyms(syms); setCorrReturns([]); return; }
      const aligned: number[][] = [];
      for (let t = 0; t < T; t++) aligned.push(series.map(s => s[s.length - T + t]));
      setCorrSyms(syms);
      setCorrReturns(aligned);
    })();
    return () => { cancelled = true; };
  }, [holdings, lookback]);

  const { quotes } = useLiveQuotes(holdings.map(h => h.symbol), 60_000);
  const values = holdings.map(h => ({ ...h, value: h.shares * (quotes[h.symbol]?.price ?? h.avg_price) }));
  const total = values.reduce((s, h) => s + h.value, 0) || 1;

  if (!user) return <div className="min-h-screen bg-background"><TopNav /><main className="container mx-auto px-6 py-8">Sign in to access rebalancing.</main></div>;

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Rebalance | Vela.ai" description="Drift-band rebalancing engine" path="/rebalance" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><RefreshCw className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Rebalancing Engine</h1></div>
        <Card>
          <CardHeader><CardTitle>Drift Band</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-3">
            <span className="text-sm">±</span>
            <Input type="number" value={band} onChange={(e) => setBand(Number(e.target.value))} className="w-24" />
            <span className="text-sm text-muted-foreground">% from target triggers a trade</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Drift vs target weights</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-6 text-xs font-semibold border-b pb-1">
              <div>Symbol</div><div className="text-right">Current %</div><div className="text-right">Target %</div><div className="text-right">Drift</div><div className="text-right">$ Δ</div><div className="text-right">Status</div>
            </div>
            {values.map(h => {
              const cur = (h.value / total) * 100;
              const tgt = targets[h.symbol] ?? 0;
              const drift = cur - tgt;
              const dollar = (tgt - cur) / 100 * total;
              const action = Math.abs(drift) >= band ? (drift > 0 ? "OVERWEIGHT" : "UNDERWEIGHT") : "IN BAND";
              return (
                <div key={h.symbol} className="grid grid-cols-6 text-sm font-mono py-1 border-b">
                  <div>{h.symbol}</div>
                  <div className="text-right">{cur.toFixed(1)}%</div>
                  <div className="text-right">
                    <Input type="number" value={tgt} onChange={(e) => setTargets({ ...targets, [h.symbol]: Number(e.target.value) })} className="w-20 h-7 text-right text-xs inline-block" />
                  </div>
                  <div className={`text-right ${Math.abs(drift) >= band ? (drift > 0 ? "text-bear" : "text-bull") : ""}`}>{drift >= 0 ? "+" : ""}{drift.toFixed(1)}%</div>
                  <div className="text-right">{dollar >= 0 ? "+" : ""}${dollar.toFixed(0)}</div>
                  <div className={`text-right font-semibold ${action === "UNDERWEIGHT" ? "text-bull" : action === "OVERWEIGHT" ? "text-bear" : "text-muted-foreground"}`}>{action}</div>
                </div>
              );
            })}
            <div className="mt-3 text-sm text-muted-foreground">Total NAV: <span className="font-mono">${total.toFixed(0)}</span></div>
            <p className="mt-2 text-[11px] text-muted-foreground">Educational drift analysis only - Vela does not place orders or recommend specific trades. Discuss with a licensed advisor before acting.</p>
          </CardContent>
        </Card>
        {corrReturns.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-end gap-2 text-xs">
              <span className="text-muted-foreground">Correlation lookback</span>
              <Select value={lookback} onValueChange={(v) => setLookback(v as Lookback)}>
                <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOOKBACKS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <CorrelationMatrix symbols={corrSyms} returns={corrReturns} />
          </div>
        )}
      </main>
    </div>
  );
}