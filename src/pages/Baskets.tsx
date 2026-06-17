import { useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Boxes, ArrowLeft, ExternalLink } from "lucide-react";
import { THEMATIC_BASKETS, type ThematicBasket } from "@/data/thematicBaskets";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { OHLCBar } from "@/lib/technicalIndicators";

async function fetchBars(symbol: string): Promise<OHLCBar[]> {
  const { data, error } = await supabase.functions.invoke("market-data", {
    body: { action: "ohlc", symbol, range: "1y", interval: "1d" },
  });
  if (error || !data?.bars) return [];
  return data.bars as OHLCBar[];
}

const BasketDetail = ({ basket, onBack }: { basket: ThematicBasket; onBack: () => void }) => {
  const { quotes } = useLiveQuotes(basket.symbols, 60_000);
  const [seriesMap, setSeriesMap] = useState<Record<string, OHLCBar[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, OHLCBar[]> = {};
      for (const s of basket.symbols) {
        const b = await fetchBars(s);
        if (cancelled) return;
        out[s] = b;
      }
      if (!cancelled) setSeriesMap(out);
    })();
    return () => { cancelled = true; };
  }, [basket.id, basket.symbols]);

  const chartData = useMemo(() => {
    const syms = basket.symbols.filter((s) => seriesMap[s]?.length);
    if (!syms.length) return [];
    const minLen = Math.min(...syms.map((s) => seriesMap[s].length));
    if (minLen < 2) return [];
    // equal-weight basket value
    const base = syms.map((s) => seriesMap[s][seriesMap[s].length - minLen].close);
    return Array.from({ length: minLen }).map((_, i) => {
      const row: any = { date: new Date(seriesMap[syms[0]][seriesMap[syms[0]].length - minLen + i].t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
      let basket100 = 0;
      syms.forEach((s, j) => {
        const bars = seriesMap[s];
        const v = (bars[bars.length - minLen + i].close / base[j]) * 100;
        basket100 += v / syms.length;
      });
      row["Basket"] = basket100;
      return row;
    });
  }, [seriesMap, basket.symbols]);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5"><ArrowLeft className="h-4 w-4" /> All baskets</Button>
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Boxes className="h-7 w-7 text-primary" /> {basket.name}</h1>
        <p className="text-muted-foreground mt-1">{basket.description}</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Thesis</CardTitle></CardHeader>
        <CardContent className="text-sm text-foreground/90">{basket.thesis}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equal-weight basket performance (1Y, base 100)</CardTitle>
          <CardDescription>Rebased to 100 at the start of the period.</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} minTickGap={40} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={50} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
                <Line type="monotone" dataKey="Basket" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Constituents</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2 pr-3">Symbol</th>
                  <th className="py-2 pr-3 text-right">Price</th>
                  <th className="py-2 pr-3 text-right">Day Δ</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {basket.symbols.map((s) => {
                  const q = quotes[s];
                  return (
                    <tr key={s} className="border-b border-border/40">
                      <td className="py-2 pr-3 font-mono font-semibold">{s}</td>
                      <td className="py-2 pr-3 text-right font-mono">{q?.price ? q.price.toFixed(2) : "-"}</td>
                      <td className={`py-2 pr-3 text-right font-mono ${q && q.change >= 0 ? "text-success" : "text-destructive"}`}>{q?.change != null ? `${q.change >= 0 ? "+" : ""}${q.change.toFixed(2)}%` : "-"}</td>
                      <td className="py-2 pr-3 text-right">
                        <Link to={`/stock/${encodeURIComponent(s)}`} className="text-primary text-xs inline-flex items-center gap-1 hover:underline">Open <ExternalLink className="h-3 w-3" /></Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const Baskets = () => {
  const [active, setActive] = useState<ThematicBasket | null>(null);
  return (
    <div className="min-h-screen bg-background">
      <SEO title="Thematic Baskets - Curated AI, Defense, Energy & Income Themes" description="Curated thematic baskets of stocks and ETFs across AI, defense, luxury, energy, and Italian banks with live performance." path="/baskets" />
      <TopNav />
      <main className="container mx-auto px-6 py-8">
        {active ? <BasketDetail basket={active} onBack={() => setActive(null)} /> : (
          <>
            <div className="mb-6">
              <h1 className="text-3xl font-bold flex items-center gap-2"><Boxes className="h-7 w-7 text-primary" /> Thematic baskets</h1>
              <p className="text-muted-foreground mt-1">Curated, equal-weight investment themes you can explore and track.</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {THEMATIC_BASKETS.map((b) => (
                <Card key={b.id} className="cursor-pointer hover:border-primary/40 transition" onClick={() => setActive(b)}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{b.name}</CardTitle>
                    <CardDescription>{b.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-foreground/80 line-clamp-3">{b.thesis}</p>
                    <div className="flex flex-wrap gap-1">
                      {b.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                    </div>
                    <p className="text-xs text-muted-foreground">{b.symbols.length} constituents</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Baskets;