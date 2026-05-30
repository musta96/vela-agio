import { useEffect, useMemo, useState } from "react";
import { OwnerPageHeader, KpiStrip } from "@/components/owner/OwnerLayout";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";

type RangeKey = "7d" | "30d" | "90d" | "12m" | "ytd" | "all";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7D" }, { key: "30d", label: "30D" }, { key: "90d", label: "90D" },
  { key: "12m", label: "12M" }, { key: "ytd", label: "YTD" }, { key: "all", label: "All" },
];

const PLAN_COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--muted-foreground))"];

type Metrics = {
  kpis: { mrr: number; arr: number; arpu: number; paid: number; churn_pct_30d: number; trend_pct: number };
  plans: { name: string; users: number; mrr: number; price: number; price_id: string }[];
  series: { label: string; mrr: number; new: number; churn: number; net: number }[];
};

function fmtEUR(n: number) { return `€${Math.round(n).toLocaleString()}`; }
function fmtEURk(n: number) { return n >= 1000 ? `€${(n/1000).toFixed(1)}k` : `€${Math.round(n)}`; }

export default function OwnerRevenue() {
  const [range, setRange] = useState<RangeKey>("12m");
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      const { data: res, error: err } = await supabase.functions.invoke("billing-metrics", {
        body: { range },
      });
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      setData(res as Metrics);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [range]);

  const cfg = RANGES.find(r => r.key === range)!;
  const kpis = data?.kpis;
  const series = data?.series ?? [];
  const plans = useMemo(() => (data?.plans ?? []).map((p, i) => ({ ...p, color: PLAN_COLORS[i % PLAN_COLORS.length] })), [data]);
  const planPie = plans.filter(p => p.mrr > 0).map(p => ({ name: p.name, value: p.mrr, color: p.color }));
  const periodRevenue = series.reduce((s, r) => s + r.mrr, 0);
  const trendDelta = kpis ? kpis.trend_pct.toFixed(1) : "0.0";
  const trendUp = (kpis?.trend_pct ?? 0) >= 0;

  return (
    <>
      <OwnerPageHeader
        title="Revenue"
        subtitle="Subscription, churn and lifetime value across plans."
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
              {RANGES.map(r => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={
                    "px-3 h-8 text-xs font-medium rounded-md transition-colors " +
                    (range === r.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
                  }
                >{r.label}</button>
              ))}
            </div>
            <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-2"/>Export CSV</Button>
          </div>
        }
      />

      {error && (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Failed to load billing data: {error}
        </div>
      )}

      <KpiStrip items={[
        { label: "MRR",         value: kpis ? fmtEUR(kpis.mrr)  : "—", sub: kpis ? `${trendUp ? "+" : ""}${trendDelta}% vs prev` : undefined, tone: trendUp ? "up" : "down" },
        { label: "ARR",         value: kpis ? fmtEUR(kpis.arr)  : "—" },
        { label: "ARPU",        value: kpis ? `€${kpis.arpu.toFixed(2)}` : "—" },
        { label: "Paid users",  value: kpis ? kpis.paid.toLocaleString() : "—" },
        { label: "Churn (30d)", value: kpis ? `${kpis.churn_pct_30d.toFixed(1)}%` : "—" },
      ]} />

      <div className="grid lg:grid-cols-3 gap-6 mt-8">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Recurring revenue</h3>
              <p className="text-xs text-muted-foreground">Period total {fmtEUR(periodRevenue)} · {cfg.label}</p>
            </div>
            <span className={"text-xs font-medium " + (trendUp ? "text-success" : "text-destructive")}>
              {trendUp ? "▲" : "▼"} {Math.abs(parseFloat(trendDelta)).toFixed(1)}%
            </span>
          </div>
          <div className="h-64 relative">
            {loading && <div className="absolute inset-0 flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/></div>}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="hsl(var(--primary))" stopOpacity={0.35}/>
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={fmtEURk}/>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => fmtEUR(v)}
                />
                <Area type="monotone" dataKey="mrr" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#revFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4"/>Plan mix</h3>
          <div className="h-40 relative">
            {planPie.length === 0 && !loading && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">No paid subscriptions yet</div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={planPie} dataKey="value" nameKey="name" innerRadius={38} outerRadius={62} paddingAngle={2}>
                  {planPie.map((p, i) => <Cell key={i} fill={p.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => fmtEUR(v)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-4 space-y-2.5 text-sm">
            {plans.map(p => (
              <li key={p.price_id} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                  {p.name} {p.price > 0 && <span className="text-muted-foreground text-xs">€{p.price}</span>}
                </span>
                <span className="text-muted-foreground tabular-nums">{fmtEUR(p.mrr)}</span>
              </li>
            ))}
            {plans.length === 0 && !loading && (
              <li className="text-xs text-muted-foreground">No active plans</li>
            )}
          </ul>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold mb-4">New vs churned MRR</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={fmtEURk}/>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => fmtEUR(Math.abs(v))}
                />
                <Legend wrapperStyle={{ fontSize: 11 }}/>
                <Bar dataKey="new"   name="New"    fill="hsl(var(--success))"     radius={[3,3,0,0]} />
                <Bar dataKey="churn" name="Churn"  fill="hsl(var(--destructive))" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold mb-4">Net new MRR</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={fmtEURk}/>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => fmtEUR(v)}
                />
                <Line type="monotone" dataKey="net" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}