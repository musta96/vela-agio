import { useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Sigma } from "lucide-react";

interface Score { symbol: string; value: number; quality: number; momentum: number; lowVol: number; composite: number }

function zscore(arr: number[]): number[] {
  const m = arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  const s = Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length || 1)) || 1;
  return arr.map(x => (x - m) / s);
}

export default function QuantAlpha() {
  const [tickers, setTickers] = useState("AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,JPM,XOM,UNH");
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    const list = tickers.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    const raw: { symbol: string; pe: number; roe: number; mom: number; vol: number }[] = [];
    for (const s of list) {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${s}?modules=summaryDetail,defaultKeyStatistics,financialData`;
      const j = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`).then(r => r.json()).catch(() => null);
      const r = j?.quoteSummary?.result?.[0];
      if (!r) continue;
      const { data } = await supabase.functions.invoke("market-data", { body: { action: "ohlc", symbol: s, range: "1y", interval: "1d" } });
      const bars = (data?.bars ?? []) as { close: number }[];
      const mom = bars.length > 20 ? bars[bars.length - 1].close / bars[bars.length - 252 < 0 ? 0 : bars.length - 252].close - 1 : 0;
      const rets = [];
      for (let i = 1; i < bars.length; i++) rets.push(Math.log(bars[i].close / bars[i - 1].close));
      const m = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
      const vol = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length || 1)) * Math.sqrt(252);
      raw.push({
        symbol: s,
        pe: r.summaryDetail?.trailingPE?.raw ?? 30,
        roe: r.financialData?.returnOnEquity?.raw ?? 0,
        mom,
        vol,
      });
    }
    const zPE = zscore(raw.map(x => -x.pe)); // cheap = high
    const zROE = zscore(raw.map(x => x.roe));
    const zMom = zscore(raw.map(x => x.mom));
    const zVol = zscore(raw.map(x => -x.vol));
    const out: Score[] = raw.map((r, i) => ({
      symbol: r.symbol,
      value: zPE[i], quality: zROE[i], momentum: zMom[i], lowVol: zVol[i],
      composite: (zPE[i] + zROE[i] + zMom[i] + zVol[i]) / 4,
    }));
    out.sort((a, b) => b.composite - a.composite);
    setScores(out);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Quant Alpha | Vela.ai" description="Composite multi-factor alpha scoring" path="/quant" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><Sigma className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Quant Alpha — Composite Score</h1></div>
        <div className="flex gap-2">
          <Input value={tickers} onChange={(e) => setTickers(e.target.value)} />
          <Button onClick={run} disabled={loading}>{loading ? "Scoring…" : "Score"}</Button>
        </div>
        {scores.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Ranking — Value + Quality + Momentum + Low-Vol (z-scores)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-6 text-xs font-semibold border-b pb-1">
                <div>Symbol</div><div className="text-right">Value</div><div className="text-right">Quality</div><div className="text-right">Momentum</div><div className="text-right">Low-Vol</div><div className="text-right">Composite</div>
              </div>
              {scores.map(s => (
                <div key={s.symbol} className="grid grid-cols-6 text-sm py-1 border-b font-mono">
                  <div className="font-semibold">{s.symbol}</div>
                  <div className="text-right">{s.value.toFixed(2)}</div>
                  <div className="text-right">{s.quality.toFixed(2)}</div>
                  <div className="text-right">{s.momentum.toFixed(2)}</div>
                  <div className="text-right">{s.lowVol.toFixed(2)}</div>
                  <div className={`text-right font-bold ${s.composite >= 0 ? "text-bull" : "text-bear"}`}>{s.composite.toFixed(2)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}