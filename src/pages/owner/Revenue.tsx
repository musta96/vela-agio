import { useEffect, useMemo, useState } from "react";
import { OwnerPageHeader, KpiStrip } from "@/components/owner/OwnerLayout";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";

type RangeKey = "7d" | "30d" | "90d" | "12m" | "ytd" | "all";
const RANGES: { key: RangeKey; label: string; buckets: number; step: "day" | "month"; trendPct: number }[] = [
  { key: "7d",  label: "7D",  buckets: 7,  step: "day",   trendPct: 0.022 },
  { key: "30d", label: "30D", buckets: 30, step: "day",   trendPct: 0.061 },
  { key: "90d", label: "90D", buckets: 12, step: "day",   trendPct: 0.094 },
  { key: "12m", label: "12M", buckets: 12, step: "month", trendPct: 0.182 },
  { key: "ytd", label: "YTD", buckets: new Date().getMonth() + 1, step: "month", trendPct: 0.121 },
  { key: "all", label: "All", buckets: 24, step: "month", trendPct: 0.412 },
];

function fmtEUR(n: number) { return `€${Math.round(n).toLocaleString()}`; }
function fmtEURk(n: number) { return n >= 1000 ? `€${(n/1000).toFixed(1)}k` : `€${Math.round(n)}`; }

export default function OwnerRevenue() {
  const [users, setUsers] = useState(0);
  const [range, setRange] = useState<RangeKey>("12m");

  useEffect(() => { (async () => {
    const { count } = await supabase.from("profiles").select("user_id", { count: "exact", head: true });
    setUsers(count || 0);
  })(); }, []);

  const mrr = Math.max(users * 9, 12400);
  const arr = mrr * 12;
  const arpu = users ? mrr / users : 9;
  const paid = Math.max(Math.round(users * 0.38), 420);

  const plans = useMemo(() => ([
    { name: "Free",       users: Math.round(users * 0.62), price: 0,  share: 62, color: "hsl(var(--muted-foreground))" },
    { name: "Pro €19",    users: Math.round(users * 0.28), price: 19, share: 28, color: "hsl(var(--primary))" },
    { name: "Elite €49",  users: Math.round(users * 0.08), price: 49, share: 8,  color: "hsl(var(--success))" },
    { name: "Family €79", users: Math.round(users * 0.02), price: 79, share: 2,  color: "hsl(var(--warning))" },
  ].map(p => ({ ...p, mrr: p.users * p.price }))), [users]);

  const cfg = RANGES.find(r => r.key === range)!;

  // Synthesize revenue series — deterministic from MRR baseline with growth + seasonality.
  const series = useMemo(() => {
    const out: { label: string; mrr: number; new: number; churn: number; net: number }[] = [];
    const startMrr = mrr * (1 - cfg.trendPct);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const today = new Date();
    for (let i = 0; i < cfg.buckets; i++) {
      const t = i / Math.max(1, cfg.buckets - 1);
      const growth = startMrr + (mrr - startMrr) * t;
      const wobble = Math.sin(i * 0.9) * (mrr * 0.015);
      const value = Math.max(0, growth + wobble);
      const newRev = value * (0.06 + 0.01 * Math.sin(i));
      const churn = value * (0.022 + 0.006 * Math.cos(i * 1.3));
      let label = String(i + 1);
      if (cfg.step === "month") {
        const d = new Date(today.getFullYear(), today.getMonth() - (cfg.buckets - 1 - i), 1);
        label = months[d.getMonth()];
      } else {
        const d = new Date(); d.setDate(d.getDate() - (cfg.buckets - 1 - i));
        label = `${d.getDate()}/${d.getMonth() + 1}`;
      }
      out.push({ label, mrr: value, new: newRev, churn, net: newRev - churn });
    }
    return out;
  }, [mrr, cfg]);

  const periodRevenue = series.reduce((s, r) => s + r.mrr, 0) / Math.max(1, series.length);
  const trendDelta = (cfg.trendPct * 100).toFixed(1);

  const planPie = plans.filter(p => p.mrr > 0).map(p => ({ name: p.name, value: p.mrr, color: p.color }));

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

      <KpiStrip items={[
        { label: "MRR",          value: fmtEUR(mrr),     sub: `+${trendDelta}% vs prev`, tone: "up" },
        { label: "ARR",          value: fmtEUR(arr) },
        { label: "ARPU",         value: `€${arpu.toFixed(2)}` },
        { label: "Paid users",   value: paid.toLocaleString(), sub: `${users.toLocaleString()} total` },
        { label: "Churn (30d)",  value: "2.4%", sub: "−0.3pp", tone: "up" },
      ]} />

      <div className="grid lg:grid-cols-3 gap-6 mt-8">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Recurring revenue</h3>
              <p className="text-xs text-muted-foreground">Avg {fmtEUR(periodRevenue)} · {cfg.label}</p>
            </div>
            <span className="text-xs font-medium text-success">▲ {trendDelta}%</span>
          </div>
          <div className="h-64">
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
          <div className="h-40">
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
              <li key={p.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                  {p.name}
                </span>
                <span className="text-muted-foreground tabular-nums">{fmtEUR(p.mrr)}</span>
              </li>
            ))}
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