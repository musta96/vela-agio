import { useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

interface Peer { symbol: string; name: string; pe: number; ps: number; mcap: number; ret1y: number; rank?: number }

export default function Peers() {
  const [seed, setSeed] = useState("AAPL");
  const [input, setInput] = useState("AAPL");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      // 1. discover peers via Yahoo recommendations
      const recUrl = `https://query1.finance.yahoo.com/v6/finance/recommendationsbysymbol/${encodeURIComponent(seed)}`;
      const rec = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(recUrl)}`).then(r => r.json());
      const symbols = [seed, ...(rec?.finance?.result?.[0]?.recommendedSymbols ?? []).slice(0, 8).map((x: any) => x.symbol)];
      // 2. fetch quoteSummary for each
      const data: Peer[] = [];
      for (const s of symbols) {
        const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${s}?modules=summaryDetail,price,defaultKeyStatistics`;
        const j = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`).then(r => r.json()).catch(() => null);
        const r = j?.quoteSummary?.result?.[0];
        if (!r) continue;
        data.push({
          symbol: s,
          name: r.price?.shortName ?? s,
          pe: r.summaryDetail?.trailingPE?.raw ?? 0,
          ps: r.summaryDetail?.priceToSalesTrailing12Months?.raw ?? 0,
          mcap: r.price?.marketCap?.raw ?? 0,
          ret1y: r.defaultKeyStatistics?.["52WeekChange"]?.raw ?? 0,
        });
      }
      // 3. cross-sectional rank: lower PE, lower PS, higher ret1y is better
      const rank = (arr: number[], asc = true) => arr.map((v, i) => ({ v, i })).sort((a, b) => asc ? a.v - b.v : b.v - a.v).map((x, r) => ({ ...x, r })).sort((a, b) => a.i - b.i).map(x => x.r + 1);
      const peR = rank(data.map(d => d.pe || 9999), true);
      const psR = rank(data.map(d => d.ps || 9999), true);
      const rR = rank(data.map(d => d.ret1y), false);
      data.forEach((d, i) => d.rank = peR[i] + psR[i] + rR[i]);
      data.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
      setPeers(data);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Peer Analysis | Vela.ai" description="Auto-discovered peers and cross-sectional ranking" path="/peers" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><Users className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Peer Discovery & Ranking</h1></div>
        <div className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} className="max-w-xs" />
          <Button onClick={() => { setSeed(input.trim()); run(); }} disabled={loading}>{loading ? "Loading…" : "Find Peers"}</Button>
        </div>
        {peers.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Ranking (composite of P/E, P/S, 1Y return)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-6 text-xs font-semibold border-b pb-1">
                <div>Symbol</div><div>Name</div><div className="text-right">P/E</div><div className="text-right">P/S</div><div className="text-right">1Y</div><div className="text-right">Rank</div>
              </div>
              {peers.map(p => (
                <div key={p.symbol} className="grid grid-cols-6 text-sm py-1 border-b font-mono">
                  <div>{p.symbol}</div>
                  <div className="truncate">{p.name}</div>
                  <div className="text-right">{p.pe ? p.pe.toFixed(1) : "-"}</div>
                  <div className="text-right">{p.ps ? p.ps.toFixed(1) : "-"}</div>
                  <div className={`text-right ${p.ret1y >= 0 ? "text-bull" : "text-bear"}`}>{(p.ret1y * 100).toFixed(1)}%</div>
                  <div className="text-right font-semibold">{p.rank}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}