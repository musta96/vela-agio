import { useMemo, useState } from "react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calculator, TrendingDown, TrendingUp } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, Legend,
} from "recharts";
import {
  bondMetrics, priceAtYield, yieldToMaturity, estimatePriceChange,
} from "@/lib/bonds/pricing";

const FREQ_OPTIONS = [
  { label: "Annual", value: 1 },
  { label: "Semi-annual", value: 2 },
  { label: "Quarterly", value: 4 },
  { label: "Monthly", value: 12 },
];

function fmt(n: number, d = 2) {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function pct(n: number, d = 2) {
  return `${fmt(n * 100, d)}%`;
}

export default function BondCalculator() {
  const [face, setFace] = useState(1000);
  const [couponRate, setCouponRate] = useState(0.05); // 5%
  const [years, setYears] = useState(10);
  const [frequency, setFrequency] = useState(2);
  const [yieldRate, setYieldRate] = useState(0.05);

  // Solve-for-yield inputs
  const [targetPrice, setTargetPrice] = useState(1000);

  const inp = { face, couponRate, yearsToMaturity: years, frequency };
  const metrics = useMemo(() => bondMetrics({ ...inp, yieldRate }), [face, couponRate, years, frequency, yieldRate]);
  const solvedYtm = useMemo(() => yieldToMaturity(inp, targetPrice, yieldRate), [face, couponRate, years, frequency, targetPrice, yieldRate]);

  const priceYieldData = useMemo(() => {
    const points = [];
    const min = Math.max(0.0025, yieldRate - 0.06);
    const max = yieldRate + 0.06;
    const step = (max - min) / 60;
    for (let y = min; y <= max + 1e-9; y += step) {
      points.push({ yPct: +(y * 100).toFixed(3), price: +priceAtYield(inp, y).toFixed(4) });
    }
    return points;
  }, [face, couponRate, years, frequency, yieldRate]);

  const cashflowData = useMemo(
    () => metrics.cashflows.map(cf => ({
      period: `P${cf.period}`,
      t: +cf.t.toFixed(3),
      Cashflow: +cf.amount.toFixed(2),
      "Present value": +cf.pv.toFixed(2),
    })),
    [metrics],
  );

  const shocks = [-200, -100, -50, -25, 25, 50, 100, 200];
  const shockRows = shocks.map(bp => {
    const est = estimatePriceChange(metrics, bp);
    const exact = priceAtYield(inp, yieldRate + bp / 10000);
    return {
      bp,
      est: est.pct,
      estPrice: metrics.price + est.dollar,
      exact,
      exactPct: metrics.price > 0 ? (exact - metrics.price) / metrics.price : 0,
    };
  });

  const premiumDiscount = metrics.price > face
    ? { label: "Premium", tone: "default" as const, icon: TrendingUp }
    : metrics.price < face
    ? { label: "Discount", tone: "secondary" as const, icon: TrendingDown }
    : { label: "Par", tone: "outline" as const, icon: TrendingUp };

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO
        title="Bond Yield & Pricing Calculator | Vela.ai"
        description="Compute bond price, yield to maturity, Macaulay & modified duration, convexity and DV01 with interactive price-yield curve and cashflow charts."
        path="/bonds"
      />
      <PageHeader
        icon={Calculator}
        title="Bond Yield & Pricing Calculator"
        description="Model fixed-coupon bonds: price, YTM, duration, convexity and interest-rate sensitivity."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* Inputs */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Bond inputs</CardTitle>
            <CardDescription>Assumes end-of-period coupons, no accrued interest.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="face">Face value</Label>
              <Input id="face" type="number" min={1} value={face}
                onChange={e => setFace(Math.max(1, Number(e.target.value) || 0))} />
            </div>
            <div className="space-y-1.5">
              <Label>Coupon rate — {pct(couponRate, 2)}</Label>
              <Slider min={0} max={15} step={0.05}
                value={[couponRate * 100]}
                onValueChange={([v]) => setCouponRate(v / 100)} />
            </div>
            <div className="space-y-1.5">
              <Label>Years to maturity — {years}</Label>
              <Slider min={0.25} max={40} step={0.25}
                value={[years]}
                onValueChange={([v]) => setYears(v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Coupon frequency</Label>
              <Select value={String(frequency)} onValueChange={(v) => setFrequency(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQ_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Yield to maturity — {pct(yieldRate, 3)}</Label>
              <Slider min={0.1} max={20} step={0.05}
                value={[yieldRate * 100]}
                onValueChange={([v]) => setYieldRate(v / 100)} />
            </div>
          </CardContent>
        </Card>

        {/* Results + charts */}
        <div className="space-y-6 min-w-0">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Dirty price" value={fmt(metrics.price, 4)}
              badge={<Badge variant={premiumDiscount.tone} className="text-[10px] gap-1"><premiumDiscount.icon className="h-3 w-3" />{premiumDiscount.label}</Badge>} />
            <Kpi label="Modified duration" value={`${fmt(metrics.modifiedDuration)} y`} />
            <Kpi label="Convexity" value={fmt(metrics.convexity, 3)} />
            <Kpi label="DV01 (per 1bp)" value={fmt(metrics.dv01, 4)} />
            <Kpi label="Macaulay duration" value={`${fmt(metrics.macaulayDuration)} y`} />
            <Kpi label="Current yield" value={pct(metrics.currentYield, 3)} />
            <Kpi label="Coupon payment" value={fmt((couponRate * face) / frequency, 2)} />
            <Kpi label="Periods" value={String(Math.round(years * frequency))} />
          </div>

          <Tabs defaultValue="curve">
            <TabsList>
              <TabsTrigger value="curve">Price / Yield curve</TabsTrigger>
              <TabsTrigger value="cashflows">Cashflows</TabsTrigger>
              <TabsTrigger value="shocks">Rate shocks</TabsTrigger>
              <TabsTrigger value="solver">Solve for YTM</TabsTrigger>
            </TabsList>

            <TabsContent value="curve">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Price sensitivity to yield</CardTitle>
                  <CardDescription>Vertical line marks the current YTM assumption.</CardDescription>
                </CardHeader>
                <CardContent className="h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={priceYieldData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="yPct" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => Number(v).toFixed(0)} />
                      <Tooltip
                        formatter={(v: number) => fmt(v, 4)}
                        labelFormatter={(l) => `Yield ${l}%`}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                      />
                      <ReferenceLine x={+(yieldRate * 100).toFixed(3)} stroke="hsl(var(--primary))" strokeDasharray="4 3" />
                      <ReferenceLine y={face} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 4" label={{ value: "Par", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" dot={false} strokeWidth={1.6} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cashflows">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Coupon & principal cashflows</CardTitle>
                  <CardDescription>Nominal vs. present-value cashflows at the current YTM.</CardDescription>
                </CardHeader>
                <CardContent className="h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cashflowData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="period" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(v: number) => fmt(v, 2)}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Cashflow" fill="hsl(var(--muted-foreground))" opacity={0.5} />
                      <Bar dataKey="Present value" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="shocks">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Interest-rate shock table</CardTitle>
                  <CardDescription>Duration+convexity estimate vs. exact repricing.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="text-left py-2 font-medium">Shock</th>
                        <th className="text-right py-2 font-medium">Est. Δ%</th>
                        <th className="text-right py-2 font-medium">Est. price</th>
                        <th className="text-right py-2 font-medium">Exact Δ%</th>
                        <th className="text-right py-2 font-medium">Exact price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shockRows.map(r => (
                        <tr key={r.bp} className="border-b last:border-0">
                          <td className="py-2">{r.bp > 0 ? `+${r.bp}` : r.bp} bps</td>
                          <td className={`text-right font-mono ${r.est >= 0 ? "text-success" : "text-destructive"}`}>{pct(r.est, 3)}</td>
                          <td className="text-right font-mono">{fmt(r.estPrice, 4)}</td>
                          <td className={`text-right font-mono ${r.exactPct >= 0 ? "text-success" : "text-destructive"}`}>{pct(r.exactPct, 3)}</td>
                          <td className="text-right font-mono">{fmt(r.exact, 4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="solver">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Solve YTM from market price</CardTitle>
                  <CardDescription>Enter a market price; we solve for the annual yield that reprices it exactly.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-1.5">
                      <Label htmlFor="tgt">Market price</Label>
                      <Input id="tgt" type="number" min={0.01} step="0.01" value={targetPrice}
                        onChange={e => setTargetPrice(Math.max(0.01, Number(e.target.value) || 0))} />
                    </div>
                    <button
                      type="button"
                      className="self-end h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
                      onClick={() => setYieldRate(solvedYtm)}
                    >
                      Apply YTM to inputs
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Kpi label="Implied YTM" value={pct(solvedYtm, 4)} />
                    <Kpi label="Repriced value" value={fmt(priceAtYield(inp, solvedYtm), 4)} />
                    <Kpi label="Coupon vs YTM"
                      value={couponRate > solvedYtm ? "Coupon > YTM" : couponRate < solvedYtm ? "Coupon < YTM" : "Coupon = YTM"} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Educational tool — assumes flat yield curve, no taxes, no credit spread shocks, and equal periodic coupons.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, badge }: { label: string; value: string; badge?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardDescription className="text-[11px] uppercase tracking-wide">{label}</CardDescription>
        <CardTitle className="text-xl font-mono flex items-center gap-2">
          {value}{badge}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}