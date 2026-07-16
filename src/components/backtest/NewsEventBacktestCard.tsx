import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Newspaper, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { analyzeEventWindows } from "@/lib/backtest/eventBacktest";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from "recharts";

interface NewsItem { publishedAt: number; title: string; url: string | null; source: string | null; sentiment: number; }
interface Bar { t: number; close: number; }
interface Props { symbol: string; bars: Bar[]; }

interface TradeSim {
  headline: string;
  publishedAt: number;
  entryIdx: number;
  exitIdx: number;
  entryPrice: number;
  exitPrice: number;
  pct: number;
  sentiment: number;
}

function nearestBarIdx(bars: Bar[], ts: number): number {
  for (let i = 0; i < bars.length; i++) if (bars[i].t >= ts) return i;
  return -1;
}

export function NewsEventBacktestCard({ symbol, bars }: Props) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryDelay, setEntryDelay] = useState(1);
  const [exitBars, setExitBars] = useState(5);
  const [sentimentThr, setSentimentThr] = useState(1);
  const [days, setDays] = useState(60);
  const [preWin, setPreWin] = useState(3);
  const [postWin, setPostWin] = useState(5);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("news-events", { body: { symbol, days } });
      if (error) throw error;
      if ((data as any)?.error) setError((data as any).error);
      else setItems(((data as any).items ?? []) as NewsItem[]);
    } catch (e: any) { setError(e?.message ?? "news_unavailable"); }
    finally { setLoading(false); }
  };

  const trades: TradeSim[] = [];
  for (const n of items) {
    if (Math.abs(n.sentiment) < sentimentThr) continue;
    const idx = nearestBarIdx(bars, n.publishedAt);
    if (idx < 0) continue;
    const entryIdx = idx + entryDelay;
    const exitIdx = entryIdx + exitBars;
    if (exitIdx >= bars.length) continue;
    const dir = n.sentiment > 0 ? 1 : -1;
    const entryPrice = bars[entryIdx].close;
    const exitPrice = bars[exitIdx].close;
    const pct = dir * ((exitPrice - entryPrice) / entryPrice) * 100;
    trades.push({ headline: n.title, publishedAt: n.publishedAt, entryIdx, exitIdx, entryPrice, exitPrice, pct, sentiment: n.sentiment });
  }
  const wins = trades.filter((t) => t.pct > 0).length;
  const winRate = trades.length ? (wins / trades.length) * 100 : 0;
  const avg = trades.length ? trades.reduce((s, t) => s + t.pct, 0) / trades.length : 0;
  const cum = trades.reduce((s, t) => s + t.pct, 0);

  const eventStats = items.length > 0
    ? analyzeEventWindows(bars, items.filter((n) => Math.abs(n.sentiment) >= sentimentThr).map((n) => ({ publishedAt: n.publishedAt, sentiment: n.sentiment })), preWin, postWin)
    : null;

  // Overlay + bucket comparison across events.
  const overlay = (() => {
    if (!items.length) return null;
    const curves: { key: string; sentiment: number; points: { x: number; ret: number }[]; postMove: number; maxDD: number }[] = [];
    const filtered = items.filter((n) => Math.abs(n.sentiment) >= sentimentThr);
    for (const n of filtered) {
      const i = nearestBarIdx(bars, n.publishedAt);
      if (i < 0 || i < preWin || i + postWin >= bars.length) continue;
      const anchor = bars[i].close;
      const pts: { x: number; ret: number }[] = [];
      let peak = 0, dd = 0;
      for (let k = -preWin; k <= postWin; k++) {
        const ret = ((bars[i + k].close - anchor) / anchor) * 100;
        pts.push({ x: k, ret });
        if (k >= 0) {
          peak = Math.max(peak, ret);
          dd = Math.min(dd, ret - peak);
        }
      }
      const postMove = pts[pts.length - 1].ret;
      curves.push({ key: `${n.publishedAt}-${n.title.slice(0, 24)}`, sentiment: n.sentiment, points: pts, postMove, maxDD: dd });
    }
    if (!curves.length) return null;
    // Merge for chart: aligned x axis across curves.
    const xs: number[] = [];
    for (let k = -preWin; k <= postWin; k++) xs.push(k);
    const chartRows = xs.map((x) => {
      const row: Record<string, number> = { x };
      curves.forEach((c, idx) => { const p = c.points.find((pt) => pt.x === x); if (p) row[`c${idx}`] = p.ret; });
      // Bucket averages.
      const bulls = curves.filter((c) => c.sentiment > 0).map((c) => c.points.find((pt) => pt.x === x)?.ret).filter((v): v is number => v != null);
      const bears = curves.filter((c) => c.sentiment < 0).map((c) => c.points.find((pt) => pt.x === x)?.ret).filter((v): v is number => v != null);
      if (bulls.length) row.avgBull = bulls.reduce((a, b) => a + b, 0) / bulls.length;
      if (bears.length) row.avgBear = bears.reduce((a, b) => a + b, 0) / bears.length;
      return row;
    });
    const bucket = (dir: 1 | -1) => {
      const g = curves.filter((c) => Math.sign(c.sentiment) === dir);
      if (!g.length) return null;
      const avgMove = g.reduce((s, c) => s + c.postMove, 0) / g.length;
      const avgDD = g.reduce((s, c) => s + c.maxDD, 0) / g.length;
      const worst = Math.min(...g.map((c) => c.maxDD));
      return { n: g.length, avgMove, avgDD, worst };
    };
    return { chartRows, curves, bull: bucket(1), bear: bucket(-1) };
  })();

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center gap-2 mb-3">
        <Newspaper className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">News-driven event backtest</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Simulates entering N bars after each qualifying headline in the direction of the sentiment and exiting a fixed horizon later.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <Label className="text-xs">Lookback (days)</Label>
          <Input type="number" min={7} max={90} value={days} onChange={(e) => setDays(Number(e.target.value) || 30)} />
        </div>
        <div>
          <Label className="text-xs">Entry delay (bars)</Label>
          <Input type="number" min={0} max={20} value={entryDelay} onChange={(e) => setEntryDelay(Number(e.target.value) || 0)} />
        </div>
        <div>
          <Label className="text-xs">Exit horizon (bars)</Label>
          <Input type="number" min={1} max={40} value={exitBars} onChange={(e) => setExitBars(Number(e.target.value) || 5)} />
        </div>
        <div>
          <Label className="text-xs">Min |sentiment|</Label>
          <Input type="number" min={1} max={3} value={sentimentThr} onChange={(e) => setSentimentThr(Number(e.target.value) || 1)} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <Label className="text-xs">Pre-event window (bars)</Label>
          <Input type="number" min={1} max={30} value={preWin} onChange={(e) => setPreWin(Number(e.target.value) || 3)} />
        </div>
        <div>
          <Label className="text-xs">Post-event window (bars)</Label>
          <Input type="number" min={1} max={30} value={postWin} onChange={(e) => setPostWin(Number(e.target.value) || 5)} />
        </div>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <Button size="sm" onClick={load} disabled={loading}><Play className="h-3.5 w-3.5 mr-1" />{loading ? "Loading…" : "Load headlines & simulate"}</Button>
        {items.length > 0 && <Badge variant="outline">{items.length} headlines</Badge>}
        {error && <Badge variant="destructive">{error}</Badge>}
      </div>

      {trades.length > 0 && (
        <>
          {eventStats && eventStats.events > 0 && (
            <div className="mb-3 p-3 rounded border border-border bg-muted/20">
              <p className="text-xs font-semibold mb-2">Pre/post event impact ({eventStats.events} events)</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <div className="p-2 rounded border border-border"><p className="text-muted-foreground">Pre avg</p><p className={`font-semibold ${eventStats.preAvgRetPct >= 0 ? "text-success" : "text-destructive"}`}>{eventStats.preAvgRetPct.toFixed(2)}%</p></div>
                <div className="p-2 rounded border border-border"><p className="text-muted-foreground">Post avg</p><p className={`font-semibold ${eventStats.postAvgRetPct >= 0 ? "text-success" : "text-destructive"}`}>{eventStats.postAvgRetPct.toFixed(2)}%</p></div>
                <div className="p-2 rounded border border-border"><p className="text-muted-foreground">Pre σ</p><p className="font-semibold">{(eventStats.preSigma * 100).toFixed(2)}%</p></div>
                <div className="p-2 rounded border border-border"><p className="text-muted-foreground">Post σ</p><p className="font-semibold">{(eventStats.postSigma * 100).toFixed(2)}%</p></div>
                <div className="p-2 rounded border border-border"><p className="text-muted-foreground">Vol expansion</p><p className={`font-semibold ${eventStats.volExpansion > 1.2 ? "text-destructive" : "text-foreground"}`}>{eventStats.volExpansion.toFixed(2)}×</p></div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Directional hit rate (post move vs sentiment sign): {eventStats.hitRate.toFixed(0)}%.</p>
            </div>
          )}
          {overlay && (
            <div className="mb-3 p-3 rounded border border-border bg-muted/10">
              <p className="text-xs font-semibold mb-2">Event overlay ({overlay.curves.length} events, anchored at t=0)</p>
              <div className="w-full h-[220px]">
                <ResponsiveContainer>
                  <LineChart data={overlay.chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="x" fontSize={10} stroke="hsl(var(--muted-foreground))" label={{ value: "bars from event", position: "insideBottom", offset: -2, fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v.toFixed(1)}%`} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} formatter={(v: number) => `${v.toFixed(2)}%`} />
                    <ReferenceLine x={0} stroke="hsl(var(--primary))" strokeDasharray="2 2" />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.4} />
                    {overlay.curves.map((c, idx) => (
                      <Line key={c.key} type="monotone" dataKey={`c${idx}`}
                        stroke={c.sentiment > 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                        strokeOpacity={0.25} strokeWidth={1} dot={false} isAnimationActive={false} />
                    ))}
                    <Line type="monotone" dataKey="avgBull" stroke="hsl(var(--success))" strokeWidth={2.5} dot={false} name="Avg bullish" />
                    <Line type="monotone" dataKey="avgBear" stroke="hsl(var(--destructive))" strokeWidth={2.5} dot={false} name="Avg bearish" />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-xs">
                {overlay.bull && (
                  <div className="p-2 rounded border border-border">
                    <p className="text-success font-semibold mb-1">Bullish bucket · {overlay.bull.n} events</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div><p className="text-muted-foreground">Avg move</p><p className={`font-semibold ${overlay.bull.avgMove >= 0 ? "text-success" : "text-destructive"}`}>{overlay.bull.avgMove.toFixed(2)}%</p></div>
                      <div><p className="text-muted-foreground">Avg drawdown</p><p className="font-semibold text-destructive">{overlay.bull.avgDD.toFixed(2)}%</p></div>
                      <div><p className="text-muted-foreground">Worst DD</p><p className="font-semibold text-destructive">{overlay.bull.worst.toFixed(2)}%</p></div>
                    </div>
                  </div>
                )}
                {overlay.bear && (
                  <div className="p-2 rounded border border-border">
                    <p className="text-destructive font-semibold mb-1">Bearish bucket · {overlay.bear.n} events</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div><p className="text-muted-foreground">Avg move</p><p className={`font-semibold ${overlay.bear.avgMove >= 0 ? "text-success" : "text-destructive"}`}>{overlay.bear.avgMove.toFixed(2)}%</p></div>
                      <div><p className="text-muted-foreground">Avg drawdown</p><p className="font-semibold text-destructive">{overlay.bear.avgDD.toFixed(2)}%</p></div>
                      <div><p className="text-muted-foreground">Worst DD</p><p className="font-semibold text-destructive">{overlay.bear.worst.toFixed(2)}%</p></div>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Thin lines are individual events (green = positive sentiment, red = negative). Bold lines are per-bucket averages.</p>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
            <div className="p-2 rounded border border-border"><p className="text-muted-foreground">Trades</p><p className="font-semibold text-base">{trades.length}</p></div>
            <div className="p-2 rounded border border-border"><p className="text-muted-foreground">Win rate</p><p className="font-semibold text-base">{winRate.toFixed(1)}%</p></div>
            <div className="p-2 rounded border border-border"><p className="text-muted-foreground">Avg trade</p><p className={`font-semibold text-base ${avg >= 0 ? "text-success" : "text-destructive"}`}>{avg.toFixed(2)}%</p></div>
            <div className="p-2 rounded border border-border"><p className="text-muted-foreground">Cumulative</p><p className={`font-semibold text-base ${cum >= 0 ? "text-success" : "text-destructive"}`}>{cum.toFixed(2)}%</p></div>
          </div>
          <div className="max-h-64 overflow-y-auto border border-border rounded">
            <table className="text-xs w-full">
              <thead className="bg-muted/40 sticky top-0"><tr>
                <th className="text-left p-2">Date</th><th className="text-left p-2">Headline</th><th className="text-right p-2">Sent.</th><th className="text-right p-2">P/L%</th>
              </tr></thead>
              <tbody>
                {trades.slice(0, 30).map((t, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2">{new Date(t.publishedAt).toLocaleDateString()}</td>
                    <td className="p-2 truncate max-w-[420px]">{t.headline}</td>
                    <td className="p-2 text-right">{t.sentiment}</td>
                    <td className={`p-2 text-right font-semibold ${t.pct >= 0 ? "text-success" : "text-destructive"}`}>{t.pct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}