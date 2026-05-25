import { useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import type { OHLCBar } from "@/lib/technicalIndicators";
import { useTranslation } from "react-i18next";

export default function EventStudy() {
  const { t } = useTranslation();
  const [symbol, setSymbol] = useState("AAPL");
  const [dates, setDates] = useState("2024-10-31,2024-08-01,2024-05-02");
  const [window, setWindow] = useState(10);
  const [series, setSeries] = useState<{ t: number; cum: number }[]>([]);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const { data } = await supabase.functions.invoke("market-data", { body: { action: "ohlc", symbol, range: "5y", interval: "1d" } });
    const bars: OHLCBar[] = data?.bars ?? [];
    const events = dates.split(",").map(s => s.trim()).filter(Boolean);
    const aligned: number[][] = [];
    for (const ev of events) {
      const evTs = new Date(ev).getTime();
      let idx = bars.findIndex(b => b.t >= evTs);
      if (idx < 0) continue;
      const slice = bars.slice(Math.max(0, idx - window), idx + window + 1);
      if (slice.length < window * 2 + 1) continue;
      const base = slice[window].close;
      aligned.push(slice.map(b => (b.close / base - 1) * 100));
    }
    if (!aligned.length) { setSeries([]); setBusy(false); return; }
    const avg: { t: number; cum: number }[] = [];
    for (let i = -window; i <= window; i++) {
      const idx = i + window;
      const vals = aligned.map(a => a[idx]).filter(v => Number.isFinite(v));
      avg.push({ t: i, cum: vals.reduce((s, v) => s + v, 0) / vals.length });
    }
    setSeries(avg); setBusy(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Event Study | Vela.ai" description="Average abnormal return around events" path="/event-study" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><TrendingUp className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">{t("pages.eventStudy.title")}</h1></div>
        <Card><CardContent className="p-4 grid md:grid-cols-4 gap-3">
          <div><Label>Ticker</Label><Input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} /></div>
          <div className="md:col-span-2"><Label>{t("pages.eventStudy.dates")}</Label><Input value={dates} onChange={e => setDates(e.target.value)} /></div>
          <div><Label>{t("pages.eventStudy.window")}</Label><Input type="number" value={window} onChange={e => setWindow(+e.target.value)} /></div>
        </CardContent></Card>
        <Button onClick={run} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("pages.eventStudy.run")}</Button>
        {series.length > 0 && (
          <Card><CardHeader><CardTitle>{t("pages.eventStudy.chartTitle")}</CardTitle></CardHeader><CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={series}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="t" /><YAxis tickFormatter={v => `${v.toFixed(1)}%`} /><Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
                <ReferenceLine x={0} stroke="hsl(var(--primary))" strokeDasharray="3 3" />
                <Line dataKey="cum" stroke="hsl(var(--bull))" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent></Card>
        )}
      </main>
    </div>
  );
}