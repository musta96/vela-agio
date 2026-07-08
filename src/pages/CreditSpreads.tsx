import { useMemo } from "react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMacroSeries, type MacroSeries } from "@/hooks/useMacroSeries";
import { Activity, AlertTriangle, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

/**
 * Corporate bond credit-spread dashboard.
 * All spreads are ICE BofA Option-Adjusted Spreads over duration-matched
 * Treasuries, sourced via FRED. Series update daily.
 */
const RATING_IDS = [
  { id: "us_aaa_oas", label: "AAA", grade: "IG" as const, color: "hsl(142 60% 45%)" },
  { id: "us_aa_oas",  label: "AA",  grade: "IG" as const, color: "hsl(158 55% 45%)" },
  { id: "us_a_oas",   label: "A",   grade: "IG" as const, color: "hsl(190 55% 50%)" },
  { id: "us_bbb_oas", label: "BBB", grade: "IG" as const, color: "hsl(215 60% 55%)" },
  { id: "us_bb_oas",  label: "BB",  grade: "HY" as const, color: "hsl(35 80% 55%)"  },
  { id: "us_b_oas",   label: "B",   grade: "HY" as const, color: "hsl(15 80% 55%)"  },
  { id: "us_ccc_oas", label: "CCC & Lower", grade: "HY" as const, color: "hsl(0 75% 55%)" },
];

const AGG_IDS = [
  { id: "us_ig_oas",  label: "US IG Aggregate",  color: "hsl(215 65% 55%)" },
  { id: "us_hy_oas",  label: "US HY Aggregate",  color: "hsl(15 80% 55%)"  },
  { id: "em_corp_oas", label: "EM Corporate",    color: "hsl(280 55% 60%)" },
  { id: "eur_ig_oas", label: "EMEA Corporate",   color: "hsl(190 55% 50%)" },
];

const ALL_IDS = [...RATING_IDS.map(r => r.id), ...AGG_IDS.map(a => a.id)];

function latest(series: MacroSeries | undefined): number | null {
  const p = series?.points?.[series.points.length - 1];
  return p ? p.v : null;
}
function nDaysAgo(series: MacroSeries | undefined, days: number): number | null {
  if (!series?.points?.length) return null;
  const target = Date.now() - days * 86400 * 1000;
  let best: { d: number; v: number } | null = null;
  for (const p of series.points) {
    const d = Math.abs(new Date(p.t).getTime() - target);
    if (!best || d < best.d) best = { d, v: p.v };
  }
  return best?.v ?? null;
}
function pctile(series: MacroSeries | undefined, v: number | null): number | null {
  if (v == null || !series?.points?.length) return null;
  const vals = series.points.map(p => p.v).sort((a, b) => a - b);
  const idx = vals.findIndex(x => x >= v);
  return idx < 0 ? 100 : Math.round((idx / vals.length) * 100);
}
function fmtBps(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "-";
  // FRED OAS reported in percent → convert to bps for readability
  return `${Math.round(v * 100)} bps`;
}
function fmtDelta(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "-";
  const bps = Math.round(v * 100);
  return `${bps >= 0 ? "+" : ""}${bps} bps`;
}

export default function CreditSpreads() {
  const { series, loading } = useMacroSeries(ALL_IDS);

  const rows = useMemo(() => {
    const build = (id: string, label: string, grade?: "IG" | "HY") => {
      const s = series[id];
      const cur = latest(s);
      const d30 = nDaysAgo(s, 30);
      const d90 = nDaysAgo(s, 90);
      const d365 = nDaysAgo(s, 365);
      return {
        id, label, grade, series: s,
        current: cur,
        chg30: cur != null && d30 != null ? cur - d30 : null,
        chg90: cur != null && d90 != null ? cur - d90 : null,
        chg365: cur != null && d365 != null ? cur - d365 : null,
        pctile: pctile(s, cur),
        notCovered: s?.notCovered,
      };
    };
    return {
      ratings: RATING_IDS.map(r => build(r.id, r.label, r.grade)),
      aggregates: AGG_IDS.map(a => build(a.id, a.label)),
    };
  }, [series]);

  const ig = series["us_ig_oas"]; const hy = series["us_hy_oas"];
  const igCur = latest(ig); const hyCur = latest(hy);
  const hyMinusIg = igCur != null && hyCur != null ? hyCur - igCur : null;
  const hyPct = pctile(hy, hyCur);

  const regime = hyPct == null ? null
    : hyPct >= 80 ? { label: "Risk-off — spreads elevated", tone: "destructive" as const, icon: AlertTriangle }
    : hyPct >= 60 ? { label: "Cautious — spreads above median", tone: "secondary" as const, icon: TrendingUp }
    : hyPct >= 30 ? { label: "Neutral — near historical median", tone: "outline" as const, icon: Activity }
    : { label: "Risk-on — spreads compressed", tone: "default" as const, icon: TrendingDown };

  // Build chart data by merging rating series on date
  const chartData = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>();
    for (const r of RATING_IDS) {
      const s = series[r.id]; if (!s?.points) continue;
      for (const p of s.points) {
        const row = map.get(p.t) ?? { t: p.t };
        row[r.label] = p.v * 100; // to bps
        map.set(p.t, row);
      }
    }
    return Array.from(map.values()).sort((a: any, b: any) => a.t.localeCompare(b.t));
  }, [series]);

  const covered = ALL_IDS.some(id => series[id]?.points?.length);

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO
        title="Credit Spreads Dashboard | Vela.ai"
        description="Live and historical corporate bond credit spreads by rating and region — track IG, HY and EM OAS vs Treasuries to gauge market risk sentiment."
        path="/credit-spreads"
      />
      <PageHeader
        icon={Activity}
        title="Corporate Credit Spreads"
        description="ICE BofA Option-Adjusted Spreads over duration-matched Treasuries. Widening spreads = deteriorating risk appetite."
      />

      {!loading && !covered && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" /> FRED API key not configured
            </CardTitle>
            <CardDescription>
              This dashboard pulls credit-spread series from the St. Louis Fed (FRED). Add a free FRED_API_KEY
              in the backend secrets to populate the charts. All other macro pages continue to work.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>US Investment Grade OAS</CardDescription>
            <CardTitle className="text-3xl font-mono">{fmtBps(igCur)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            30d {fmtDelta(rows.aggregates.find(r => r.id === "us_ig_oas")?.chg30)} · pctile {pctile(ig, igCur) ?? "-"}%
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>US High Yield OAS</CardDescription>
            <CardTitle className="text-3xl font-mono">{fmtBps(hyCur)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            30d {fmtDelta(rows.aggregates.find(r => r.id === "us_hy_oas")?.chg30)} · pctile {hyPct ?? "-"}%
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>HY − IG Differential</CardDescription>
            <CardTitle className="text-3xl font-mono">{fmtBps(hyMinusIg)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs">
            {regime ? (
              <Badge variant={regime.tone} className="text-[10px] flex items-center gap-1 w-fit">
                <regime.icon className="h-3 w-3" /> {regime.label}
              </Badge>
            ) : <span className="text-muted-foreground">-</span>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spread history by rating</CardTitle>
          <CardDescription>Last 3 years, basis points over Treasuries.</CardDescription>
        </CardHeader>
        <CardContent className="h-[360px]">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="text-sm text-muted-foreground">No data available.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}`} />
                <Tooltip formatter={(v: number) => `${Math.round(v)} bps`} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {RATING_IDS.map(r => (
                  <Line key={r.id} type="monotone" dataKey={r.label} stroke={r.color} dot={false} strokeWidth={1.4} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spread table</CardTitle>
          <CardDescription>Current level, recent moves and 3-year percentile.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left py-2 font-medium">Bucket</th>
                <th className="text-right py-2 font-medium">Current</th>
                <th className="text-right py-2 font-medium">30d Δ</th>
                <th className="text-right py-2 font-medium">90d Δ</th>
                <th className="text-right py-2 font-medium">1y Δ</th>
                <th className="text-right py-2 font-medium">3y %-ile</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-muted/30"><td colSpan={6} className="py-1 text-[10px] uppercase tracking-wider text-muted-foreground px-2">By rating (US)</td></tr>
              {rows.ratings.map(r => (
                <TableRow key={r.id} row={r} />
              ))}
              <tr className="bg-muted/30"><td colSpan={6} className="py-1 text-[10px] uppercase tracking-wider text-muted-foreground px-2">By region / index</td></tr>
              {rows.aggregates.map(r => (
                <TableRow key={r.id} row={r} />
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground mt-3">
            Source: ICE BofA indices via FRED. Percentile computed over the last ~3 years of daily observations. Educational data — not investment advice.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function TableRow({ row }: { row: { id: string; label: string; grade?: "IG" | "HY"; current: number | null; chg30: number | null; chg90: number | null; chg365: number | null; pctile: number | null; notCovered?: boolean } }) {
  const wide = (v: number | null) => v != null && v > 0;
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 px-2 flex items-center gap-2">
        {row.label}
        {row.grade && <Badge variant="outline" className="text-[9px]">{row.grade}</Badge>}
        {row.notCovered && <Badge variant="outline" className="text-[9px] text-muted-foreground">n/a</Badge>}
      </td>
      <td className="text-right font-mono">{fmtBps(row.current)}</td>
      <td className={`text-right font-mono ${wide(row.chg30) ? "text-destructive" : row.chg30 != null && row.chg30 < 0 ? "text-success" : ""}`}>{fmtDelta(row.chg30)}</td>
      <td className={`text-right font-mono ${wide(row.chg90) ? "text-destructive" : row.chg90 != null && row.chg90 < 0 ? "text-success" : ""}`}>{fmtDelta(row.chg90)}</td>
      <td className={`text-right font-mono ${wide(row.chg365) ? "text-destructive" : row.chg365 != null && row.chg365 < 0 ? "text-success" : ""}`}>{fmtDelta(row.chg365)}</td>
      <td className="text-right font-mono">{row.pctile == null ? "-" : `${row.pctile}%`}</td>
    </tr>
  );
}