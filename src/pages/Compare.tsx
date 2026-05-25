import { useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, GitCompare } from "lucide-react";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useOHLCHistory } from "@/hooks/useOHLCHistory";
import { analyze } from "@/lib/technicalIndicators";
import { riskSummary } from "@/lib/riskMetrics";
import { findCatalogEntry } from "@/data/stockCatalog";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

const TickerStats = ({ symbol, color }: { symbol: string; color: string }) => {
  const { bars } = useOHLCHistory(symbol, "1Y");
  const tech = useMemo(() => (bars.length >= 60 ? analyze(bars) : null), [bars]);
  const risk = useMemo(() => (bars.length >= 30 ? riskSummary(bars) : null), [bars]);
  const entry = findCatalogEntry(symbol);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {symbol}
        </CardTitle>
        <CardDescription>{entry?.name || symbol}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 text-sm">
        <Stat label="Composite" value={tech?.score?.toString() ?? "—"} tone={tech ? (tech.score > 15 ? "good" : tech.score < -15 ? "bad" : "neutral") : "neutral"} />
        <Stat label="Vol (ann.)" value={risk ? `${(risk.vol * 100).toFixed(1)}%` : "—"} />
        <Stat label="Sharpe" value={risk ? risk.sharpe.toFixed(2) : "—"} tone={risk && risk.sharpe > 1 ? "good" : "neutral"} />
        <Stat label="Max DD" value={risk ? `${(risk.maxDD * 100).toFixed(1)}%` : "—"} tone="bad" />
      </CardContent>
    </Card>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "neutral" }) => (
  <div className="rounded border border-border/50 p-2">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`font-mono font-semibold ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}>{value}</p>
  </div>
);

const Compare = () => {
  const [tickers, setTickers] = useState<string[]>(["ENEL.MI", "ENI.MI"]);
  const [input, setInput] = useState("");
  const { quotes } = useLiveQuotes(tickers, 60000);

  // Normalized chart (each ticker rebased to 100 at first bar)
  const histories = tickers.map((s) => useOHLCHistory(s, "1Y").bars);

  const chartData = useMemo(() => {
    if (histories.length === 0 || histories.some((h) => h.length === 0)) return [];
    const minLen = Math.min(...histories.map((h) => h.length));
    const series = histories.map((h) => h.slice(-minLen));
    const base = series.map((h) => h[0]?.close || 1);
    return Array.from({ length: minLen }).map((_, i) => {
      const row: any = { date: new Date(series[0][i].t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
      tickers.forEach((t, j) => {
        row[t] = (series[j][i].close / base[j]) * 100;
      });
      return row;
    });
  }, [histories, tickers]);

  const add = () => {
    const sym = input.trim().toUpperCase();
    if (sym && !tickers.includes(sym) && tickers.length < 4) {
      setTickers([...tickers, sym]);
      setInput("");
    }
  };
  const remove = (s: string) => setTickers(tickers.filter((t) => t !== s));

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="container mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><GitCompare className="h-7 w-7 text-primary" /> Compare tickers</h1>
          <p className="text-muted-foreground mt-1">Side-by-side performance, technicals, and risk for up to 4 tickers.</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Selection</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {tickers.map((t, i) => (
              <Badge key={t} variant="outline" className="gap-1 py-1 pr-1" style={{ borderColor: COLORS[i] }}>
                <span className="font-mono">{t}</span>
                {quotes[t] && (
                  <span className={quotes[t].change >= 0 ? "text-success text-xs" : "text-destructive text-xs"}>
                    {quotes[t].change >= 0 ? "+" : ""}{quotes[t].change.toFixed(2)}%
                  </span>
                )}
                <button onClick={() => remove(t)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {tickers.length < 4 && (
              <div className="flex items-center gap-2">
                <Input
                  className="w-40 h-8"
                  placeholder="Add ticker (e.g. AAPL)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                />
                <Button size="sm" onClick={add}>Add</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Normalized performance (1Y, base 100)</CardTitle></CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={chartData}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} minTickGap={40} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={50} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Legend />
                  {tickers.map((t, i) => (
                    <Line key={t} type="monotone" dataKey={t} stroke={COLORS[i]} dot={false} strokeWidth={2} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          {tickers.map((t, i) => <TickerStats key={t} symbol={t} color={COLORS[i]} />)}
        </div>
      </div>
    </div>
  );
};

export default Compare;