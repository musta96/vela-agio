import { useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Target } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function monteCarlo(initial: number, monthlyAdd: number, years: number, mean: number, stdev: number, trials = 1000) {
  const months = years * 12; const mu = mean / 12; const sd = stdev / Math.sqrt(12);
  const finals: number[] = []; const p10: number[] = []; const p50: number[] = []; const p90: number[] = [];
  const paths: number[][] = Array.from({ length: trials }, () => [initial]);
  for (let t = 1; t <= months; t++) {
    for (let i = 0; i < trials; i++) {
      const r = mu + sd * randn();
      paths[i].push(paths[i][t - 1] * (1 + r) + monthlyAdd);
    }
    const col = paths.map(p => p[t]).sort((a, b) => a - b);
    p10.push(col[Math.floor(trials * 0.1)]); p50.push(col[Math.floor(trials * 0.5)]); p90.push(col[Math.floor(trials * 0.9)]);
  }
  for (let i = 0; i < trials; i++) finals.push(paths[i][months]);
  return { p10, p50, p90, finals };
}

export default function Goals() {
  const [initial, setInitial] = useState(20000);
  const [monthly, setMonthly] = useState(500);
  const [years, setYears] = useState(25);
  const [target, setTarget] = useState(500000);
  const [mean, setMean] = useState(0.07);
  const [sd, setSd] = useState(0.15);

  const sim = useMemo(() => monteCarlo(initial, monthly, years, mean, sd, 800), [initial, monthly, years, mean, sd]);
  const successProb = useMemo(() => sim.finals.filter(v => v >= target).length / sim.finals.length, [sim, target]);
  const data = sim.p50.map((m, i) => ({ year: ((i + 1) / 12).toFixed(1), p10: sim.p10[i], median: m, p90: sim.p90[i] }));

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Goal Planner | FTSE MIB Analytics" description="Monte Carlo retirement & life-goal planner" path="/goals" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><Target className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Goals-Based Planning</h1></div>
        <div className="grid md:grid-cols-3 gap-4">
          <Card><CardContent className="p-4 space-y-3">
            <div><Label>Initial capital (€)</Label><Input type="number" value={initial} onChange={e => setInitial(+e.target.value)} /></div>
            <div><Label>Monthly contribution (€)</Label><Input type="number" value={monthly} onChange={e => setMonthly(+e.target.value)} /></div>
            <div><Label>Horizon (years)</Label><Input type="number" value={years} onChange={e => setYears(+e.target.value)} /></div>
            <div><Label>Target (€)</Label><Input type="number" value={target} onChange={e => setTarget(+e.target.value)} /></div>
            <div><Label>Expected return</Label><Input type="number" step="0.01" value={mean} onChange={e => setMean(+e.target.value)} /></div>
            <div><Label>Volatility</Label><Input type="number" step="0.01" value={sd} onChange={e => setSd(+e.target.value)} /></div>
          </CardContent></Card>
          <Card className="md:col-span-2"><CardHeader><CardTitle>Probability of success: <span className={successProb >= 0.7 ? "text-bull" : successProb >= 0.4 ? "text-yellow-500" : "text-bear"}>{(successProb * 100).toFixed(0)}%</span></CardTitle></CardHeader><CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="year" /><YAxis tickFormatter={v => `€${(v/1000).toFixed(0)}k`} /><Tooltip formatter={(v: number) => `€${v.toFixed(0)}`} />
                <Line dataKey="p10" stroke="hsl(var(--bear))" dot={false} name="10th pct" />
                <Line dataKey="median" stroke="hsl(var(--primary))" dot={false} name="Median" />
                <Line dataKey="p90" stroke="hsl(var(--bull))" dot={false} name="90th pct" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </div>
        <p className="text-xs text-muted-foreground">800 Monte Carlo trials, lognormal returns. This is not financial advice.</p>
      </main>
    </div>
  );
}