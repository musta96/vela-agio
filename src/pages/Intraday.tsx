import { useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Activity } from "lucide-react";

interface Bar { t: number; open: number; high: number; low: number; close: number; volume: number }

export default function Intraday() {
  const [symbol, setSymbol] = useState("AAPL");
  const [input, setInput] = useState("AAPL");
  const [bars, setBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.functions.invoke("market-data", { body: { action: "ohlc", symbol, range: "1d", interval: "1m" } })
      .then(({ data }) => { if (!cancelled) setBars((data?.bars ?? []) as Bar[]); })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [symbol]);

  const { vwap, twap, series, lob } = useMemo(() => {
    if (!bars.length) return { vwap: 0, twap: 0, series: [], lob: [] as { side: string; price: number; size: number }[] };
    let cumPV = 0, cumV = 0, cumP = 0;
    const series = bars.map((b) => {
      const tp = (b.high + b.low + b.close) / 3;
      cumPV += tp * b.volume; cumV += b.volume; cumP += b.close;
      const vwap = cumV > 0 ? cumPV / cumV : b.close;
      return { time: new Date(b.t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), price: b.close, vwap };
    });
    const vwap = cumV > 0 ? cumPV / cumV : 0;
    const twap = cumP / bars.length;
    // Simulated Level-2 from last close & realised intraday vol (free data lacks true depth).
    const last = bars[bars.length - 1].close;
    const spread = Math.max(0.01, last * 0.0008);
    const lob = Array.from({ length: 5 }).flatMap((_, i) => ([
      { side: "BID", price: +(last - spread * (i + 1)).toFixed(2), size: Math.round(500 + Math.random() * 5000) },
      { side: "ASK", price: +(last + spread * (i + 1)).toFixed(2), size: Math.round(500 + Math.random() * 5000) },
    ]));
    return { vwap, twap, series, lob };
  }, [bars]);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Intraday | Vela.ai" description="Minute bars, VWAP, TWAP, simulated order book" path="/intraday" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><Activity className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Intraday & Microstructure</h1></div>
        <div className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Symbol" className="max-w-xs" />
          <Button onClick={() => setSymbol(input.trim())}>Load</Button>
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>{symbol} - 1-min bars with VWAP</CardTitle></CardHeader>
            <CardContent>
              {loading ? <div className="text-muted-foreground">Loading…</div> : (
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={series}>
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={40} />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="vwap" stroke="hsl(var(--bull))" dot={false} strokeWidth={1.5} />
                    <ReferenceLine y={twap} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: "TWAP", fontSize: 10 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
              <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                <div><div className="text-muted-foreground">VWAP</div><div className="font-mono">{vwap.toFixed(2)}</div></div>
                <div><div className="text-muted-foreground">TWAP</div><div className="font-mono">{twap.toFixed(2)}</div></div>
                <div><div className="text-muted-foreground">Bars</div><div className="font-mono">{bars.length}</div></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Order Book (simulated)</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">Free data feeds lack true L2 depth. Synthetic ladder for visualization only.</p>
              <div className="grid grid-cols-3 text-xs font-semibold border-b pb-1">
                <div>Side</div><div className="text-right">Price</div><div className="text-right">Size</div>
              </div>
              {lob.sort((a, b) => b.price - a.price).map((r, i) => (
                <div key={i} className={`grid grid-cols-3 text-xs font-mono py-0.5 ${r.side === "BID" ? "text-bull" : "text-bear"}`}>
                  <div>{r.side}</div><div className="text-right">{r.price.toFixed(2)}</div><div className="text-right">{r.size.toLocaleString()}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}