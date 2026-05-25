import { useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { meanVariance, riskParity, hrp, covMatrix, portfolioStats } from "@/lib/optimizer";
import { Scale } from "lucide-react";

export default function Optimizer() {
  const [tickers, setTickers] = useState("SPY,QQQ,GLD,TLT,EFA");
  const [returns, setReturns] = useState<number[][]>([]);
  const [syms, setSyms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    const list = tickers.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    const series: number[][] = [];
    for (const s of list) {
      const { data } = await supabase.functions.invoke("market-data", { body: { action: "ohlc", symbol: s, range: "2y", interval: "1d" } });
      const bars = (data?.bars ?? []) as { close: number }[];
      const rets: number[] = [];
      for (let i = 1; i < bars.length; i++) rets.push(Math.log(bars[i].close / bars[i - 1].close));
      series.push(rets);
    }
    const T = Math.min(...series.map(s => s.length));
    const aligned: number[][] = [];
    for (let t = 0; t < T; t++) aligned.push(series.map(s => s[s.length - T + t]));
    setSyms(list); setReturns(aligned); setLoading(false);
  };

  const cov = returns.length ? covMatrix(returns) : [];
  const mv = returns.length ? meanVariance(returns) : [];
  const rp = cov.length ? riskParity(cov) : [];
  const hp = cov.length ? hrp(cov) : [];
  const eq = syms.length ? syms.map(() => 1 / syms.length) : [];

  const strategies = [
    { name: "Equal Weight", w: eq },
    { name: "Mean-Variance (max Sharpe)", w: mv },
    { name: "Risk Parity", w: rp },
    { name: "HRP", w: hp },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Portfolio Optimizer | FTSE MIB Analytics" description="Mean-Variance, Risk-Parity, HRP" path="/optimizer" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><Scale className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Portfolio Optimizer</h1></div>
        <div className="flex gap-2">
          <Input value={tickers} onChange={(e) => setTickers(e.target.value)} placeholder="SPY,QQQ,GLD,TLT" />
          <Button onClick={run} disabled={loading}>{loading ? "Optimizing…" : "Optimize"}</Button>
        </div>
        {returns.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            {strategies.map(s => {
              const stats = portfolioStats(s.w, returns);
              return (
                <Card key={s.name}>
                  <CardHeader><CardTitle>{s.name}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-1 mb-3">
                      {syms.map((sym, i) => (
                        <div key={sym} className="flex justify-between text-sm font-mono">
                          <span>{sym}</span><span>{(s.w[i] * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs border-t pt-2">
                      <div><div className="text-muted-foreground">Ret</div><div className="font-mono">{(stats.annReturn * 100).toFixed(1)}%</div></div>
                      <div><div className="text-muted-foreground">Vol</div><div className="font-mono">{(stats.annVol * 100).toFixed(1)}%</div></div>
                      <div><div className="text-muted-foreground">Sharpe</div><div className="font-mono">{stats.sharpe.toFixed(2)}</div></div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}