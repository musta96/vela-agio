import { useEffect, useMemo, useState } from "react";
import { RefreshCw, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { readEdgeError } from "@/lib/edgeError";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FundProfileData } from "@/hooks/useFundProfile";
import type { OHLCBar } from "@/lib/technicalIndicators";

interface Props {
  symbol: string;
  name: string;
  data: FundProfileData;
  bars: OHLCBar[];
}

interface SentimentResult {
  overall?: string;
  score?: number;
  summary?: string;
  drivers?: string[];
  degradedReason?: string;
  articles?: { title: string; link: string; source: string; sentiment: string; score: number }[];
}

const sma = (v: number[], n: number) => (v.length < n ? null : v.slice(-n).reduce((a, b) => a + b, 0) / n);

function rsi(v: number[], n = 14): number | null {
  if (v.length < n + 1) return null;
  let gain = 0, loss = 0;
  for (let i = v.length - n; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  if (loss === 0) return 100;
  const rs = (gain / n) / (loss / n);
  return 100 - 100 / (1 + rs);
}

const tone = (good: boolean | null) =>
  good == null ? "text-muted-foreground" : good ? "text-emerald-600 dark:text-emerald-400" : "text-destructive";

/**
 * Everything an investor needs to judge an ETF or fund in one tab: price trend,
 * quality of the vehicle (cost, size, tracking behaviour, rating), how it has
 * done against its category, and news sentiment on the same ticker.
 */
export const FundAnalysisTab = ({ symbol, name, data, bars }: Props) => {
  const [sentiment, setSentiment] = useState<SentimentResult | null>(null);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentNote, setSentNote] = useState<string | null>(null);

  const closes = useMemo(() => bars.map((b) => b.close).filter((c) => isFinite(c) && c > 0), [bars]);

  const technical = useMemo(() => {
    if (closes.length < 30) return null;
    const last = closes[closes.length - 1];
    const s50 = sma(closes, 50), s200 = sma(closes, 200);
    const r = rsi(closes);
    const rets = closes.slice(1).map((c, i) => c / closes[i] - 1);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const vol = Math.sqrt(rets.reduce((s, v) => s + (v - mean) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252);
    let peak = closes[0], dd = 0;
    for (const c of closes) { peak = Math.max(peak, c); dd = Math.min(dd, c / peak - 1); }
    const hi = Math.max(...closes), lo = Math.min(...closes);
    return {
      last, s50, s200, rsi: r, vol, drawdown: dd,
      rangePos: hi > lo ? (last - lo) / (hi - lo) : null,
      trend: s50 != null && s200 != null ? (s50 > s200 ? "up" : "down") : (last > (s50 ?? last) ? "up" : "flat"),
    };
  }, [closes]);

  const quality = useMemo(() => {
    const kf = data.keyFacts ?? {};
    const catTer = (data.fees as any)?.category?.annualReportExpenseRatio ?? null;
    const t = data.performance?.trailing ?? {};
    const c = data.performance?.trailingCategory ?? {};
    const beatsCategory = (k: string) =>
      t[k] != null && c[k] != null ? (t[k] as number) - (c[k] as number) : null;
    const items = [
      { label: "Ongoing charge", value: kf.ter, good: kf.ter != null && catTer != null ? kf.ter <= catTer : (kf.ter != null ? kf.ter <= 0.005 : null),
        note: catTer != null ? `Category ${(catTer * 100).toFixed(2)}%` : "Cheap for an index vehicle is under 0.30%" },
      { label: "Fund size", value: kf.totalAssets, good: kf.totalAssets != null ? kf.totalAssets > 1e8 : null,
        note: "Under 100m can mean closure or wide spreads" },
      { label: "3-year vs category", value: beatsCategory("threeYear"), good: (beatsCategory("threeYear") ?? 0) > 0, note: "Annualised difference" },
      { label: "5-year vs category", value: beatsCategory("fiveYear"), good: (beatsCategory("fiveYear") ?? 0) > 0, note: "Annualised difference" },
    ];
    return { items, catTer };
  }, [data]);

  const loadSentiment = async () => {
    setSentLoading(true);
    setSentNote(null);
    try {
      const { data: res, error } = await supabase.functions.invoke("analyze-sentiment", { body: { symbol, name } });
      if (error) throw error;
      setSentiment(res as SentimentResult);
      if ((res as any)?.degradedReason) setSentNote("Headline-based reading — the AI service was unavailable.");
    } catch (e: any) {
      const info = await readEdgeError(e);
      setSentNote(info.isEntitlement ? `News sentiment is locked. ${info.message}` : info.message);
    } finally {
      setSentLoading(false);
    }
  };

  useEffect(() => { void loadSentiment(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [symbol]);

  const vela = data.velaScore as any;
  const verdictParts: string[] = [];
  if (vela?.finalScore != null) verdictParts.push(vela.finalScore >= 70 ? "strong overall quality" : vela.finalScore >= 50 ? "average overall quality" : "weak overall quality");
  if (technical?.trend === "up") verdictParts.push("price trend positive");
  else if (technical?.trend === "down") verdictParts.push("price trend negative");
  const q3 = quality.items.find((i) => i.label === "3-year vs category")?.value as number | null;
  if (q3 != null) verdictParts.push(q3 > 0 ? "ahead of its category over 3 years" : "behind its category over 3 years");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What the numbers say</CardTitle>
          <CardDescription>A plain reading of trend, cost and track record. Educational, not personal advice.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {verdictParts.length ? (
            <p className="leading-relaxed">
              {name}: {verdictParts.join(", ")}.
              {technical?.rangePos != null && ` It currently sits ${(technical.rangePos * 100).toFixed(0)}% of the way up its 12-month range.`}
              {vela?.riskLabel && ` Risk profile: ${String(vela.riskLabel).toLowerCase()}.`}
            </p>
          ) : (
            <p className="text-muted-foreground">Not enough published data to summarise this vehicle yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Price behaviour</CardTitle>
            <CardDescription>From the last year of daily closes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!technical ? (
              <p className="text-muted-foreground">Not enough price history.</p>
            ) : (
              <>
                <Row
                  label="Trend"
                  value={technical.trend === "up" ? "Above its longer average" : technical.trend === "down" ? "Below its longer average" : "Flat"}
                  icon={technical.trend === "up" ? <TrendingUp className="h-4 w-4" /> : technical.trend === "down" ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                  cls={tone(technical.trend === "up" ? true : technical.trend === "down" ? false : null)}
                />
                <Row label="50-day average" value={technical.s50 != null ? technical.s50.toFixed(2) : "—"} />
                <Row label="200-day average" value={technical.s200 != null ? technical.s200.toFixed(2) : "—"} />
                <Row label="Momentum (RSI 14)" value={technical.rsi != null ? technical.rsi.toFixed(0) : "—"}
                  cls={technical.rsi == null ? "" : technical.rsi > 70 ? "text-destructive" : technical.rsi < 30 ? "text-emerald-600 dark:text-emerald-400" : ""} />
                <Row label="Yearly swing" value={`${(technical.vol * 100).toFixed(1)}%`} />
                <Row label="Worst fall in the year" value={`${(technical.drawdown * 100).toFixed(1)}%`} cls="text-destructive" />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quality of the vehicle</CardTitle>
            <CardDescription>Cost, scale and record against similar funds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {quality.items.map((i) => (
              <div key={i.label} className="flex items-start justify-between gap-3">
                <div>
                  <div>{i.label}</div>
                  <div className="text-[11px] text-muted-foreground">{i.note}</div>
                </div>
                <div className={`shrink-0 tabular-nums font-medium ${tone(i.good)}`}>
                  {i.value == null || !isFinite(i.value as number)
                    ? "—"
                    : i.label === "Fund size"
                      ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(i.value as number)
                      : `${(Math.abs(i.value as number) <= 1.5 ? (i.value as number) * 100 : (i.value as number)).toFixed(2)}%`}
                </div>
              </div>
            ))}
            {vela?.finalScore != null && (
              <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-2">
                <Badge variant="secondary">Vela score {vela.finalScore}/100</Badge>
                {vela.riskScore != null && <Badge variant="outline">Risk {vela.riskScore}/100</Badge>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">News sentiment</CardTitle>
            <CardDescription>Coverage mentioning {symbol} and the fund's mandate.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => void loadSentiment()} disabled={sentLoading}>
            <RefreshCw className={`h-4 w-4 ${sentLoading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {sentNote && <p className="text-muted-foreground">{sentNote}</p>}
          {sentiment ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {sentiment.overall && <Badge variant="secondary" className="capitalize">{sentiment.overall}</Badge>}
                {sentiment.score != null && <span className="text-muted-foreground">score {sentiment.score.toFixed(2)}</span>}
              </div>
              {sentiment.summary && <p className="leading-relaxed">{sentiment.summary}</p>}
              {(sentiment.drivers ?? []).length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {sentiment.drivers!.slice(0, 5).map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
              {(sentiment.articles ?? []).slice(0, 5).map((a, i) => (
                <a key={i} href={a.link} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary hover:underline">
                  {a.title}
                </a>
              ))}
            </>
          ) : !sentNote && sentLoading ? (
            <p className="text-muted-foreground">Reading the news flow…</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

const Row = ({ label, value, cls, icon }: { label: string; value: string; cls?: string; icon?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className={`flex items-center gap-1.5 font-medium tabular-nums ${cls ?? ""}`}>{icon}{value}</span>
  </div>
);
