import { useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Grid3x3, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { OHLCBar } from "@/lib/technicalIndicators";

const SECTORS: { symbol: string; name: string }[] = [
  { symbol: "XLK", name: "Technology" },
  { symbol: "XLF", name: "Financials" },
  { symbol: "XLE", name: "Energy" },
  { symbol: "XLV", name: "Health Care" },
  { symbol: "XLY", name: "Consumer Disc." },
  { symbol: "XLP", name: "Consumer Stap." },
  { symbol: "XLI", name: "Industrials" },
  { symbol: "XLB", name: "Materials" },
  { symbol: "XLU", name: "Utilities" },
  { symbol: "XLRE", name: "Real Estate" },
  { symbol: "XLC", name: "Comm. Services" },
];

interface Perf { sym: string; name: string; p1m: number | null; p3m: number | null; p6m: number | null; pYTD: number | null; }

const tone = (v: number | null) => {
  if (v == null) return "bg-muted/30 text-muted-foreground";
  if (v > 8) return "bg-success/30 text-success";
  if (v > 3) return "bg-success/20 text-success";
  if (v > 0) return "bg-success/10 text-success";
  if (v > -3) return "bg-destructive/10 text-destructive";
  if (v > -8) return "bg-destructive/20 text-destructive";
  return "bg-destructive/30 text-destructive";
};

const SectorHeatmap = () => {
  const [data, setData] = useState<Perf[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const results: Perf[] = [];
    for (const s of SECTORS) {
      try {
        const { data: r } = await supabase.functions.invoke("market-data", {
          body: { action: "ohlc", symbol: s.symbol, range: "1y", interval: "1d" },
        });
        const bars: OHLCBar[] = r?.bars || [];
        if (bars.length < 30) {
          results.push({ sym: s.symbol, name: s.name, p1m: null, p3m: null, p6m: null, pYTD: null });
          continue;
        }
        const last = bars[bars.length - 1].close;
        const ago = (n: number) => bars[Math.max(0, bars.length - 1 - n)]?.close;
        const ytdIdx = bars.findIndex((b) => new Date(b.t).getFullYear() === new Date().getFullYear());
        const ytdBase = ytdIdx > 0 ? bars[ytdIdx].close : bars[0].close;
        const pct = (base?: number) => (base ? ((last - base) / base) * 100 : null);
        results.push({
          sym: s.symbol,
          name: s.name,
          p1m: pct(ago(21)),
          p3m: pct(ago(63)),
          p6m: pct(ago(126)),
          pYTD: pct(ytdBase),
        });
      } catch {
        results.push({ sym: s.symbol, name: s.name, p1m: null, p3m: null, p6m: null, pYTD: null });
      }
    }
    setData(results);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Sector Heatmap — Industry Performance at a Glance" description="Visualize sector and industry performance across FTSE MIB, EU, and US markets with a color-coded heatmap and rotation insights." path="/sectors" />
      <TopNav />
      <main>
      <div className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Grid3x3 className="h-7 w-7 text-primary" /> Sector heatmap</h1>
            <p className="text-muted-foreground mt-1">Relative performance of SPDR sector ETFs. Click any to drill in.</p>
          </div>
          {loading && <RefreshCw className="h-5 w-5 animate-spin text-primary" />}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Performance grid</CardTitle>
            <CardDescription>Greener = stronger. Use to spot rotation.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-4">Sector</th>
                    <th className="py-2 pr-4 text-right">1M</th>
                    <th className="py-2 pr-4 text-right">3M</th>
                    <th className="py-2 pr-4 text-right">6M</th>
                    <th className="py-2 pr-4 text-right">YTD</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((d) => (
                    <tr key={d.sym} className="border-b border-border/40">
                      <td className="py-2 pr-4">
                        <Link to={`/stock/${d.sym}`} className="hover:text-primary">
                          <span className="font-mono mr-2">{d.sym}</span>
                          <span className="text-muted-foreground">{d.name}</span>
                        </Link>
                      </td>
                      {([d.p1m, d.p3m, d.p6m, d.pYTD]).map((v, i) => (
                        <td key={i} className="py-1 pr-1 text-right">
                          <span className={`inline-block min-w-[64px] px-2 py-1 rounded font-mono text-xs ${tone(v)}`}>
                            {v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
    </div>
  );
};

export default SectorHeatmap;