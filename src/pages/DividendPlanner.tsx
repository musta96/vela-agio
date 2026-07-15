import { useMemo, useState } from "react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Coins, Download, TrendingUp } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart,
} from "recharts";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { downloadCsv } from "@/lib/csvUtil";

/**
 * Dividend Income Planner
 * ------------------------
 * Projects future dividend income given:
 *   • starting portfolio value
 *   • monthly contributions (optionally growing with inflation/raises)
 *   • dividend yield (on cost / current price)
 *   • annual dividend growth rate (DGR)
 *   • price appreciation rate (drives forward yield on new capital)
 *   • reinvestment toggle (DRIP) and dividend tax rate
 *   • horizon in years
 *
 * Compounds monthly. All monetary outputs render in the user's base currency
 * — this is a planning model, not a valuation, so no FX conversion of inputs
 * is required.
 */

type Row = {
  year: number;
  yearLabel: string;
  contributions: number;   // cumulative net contributions this year
  reinvested: number;      // cumulative dividends reinvested this year
  portfolio: number;       // end-of-year portfolio value
  grossDividends: number;  // dividends paid during the year (pre-tax)
  netDividends: number;    // after tax
  yieldOnCost: number;     // net dividends / cumulative net contributions
};

function fmt(n: number, ccy: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: ccy,
    maximumFractionDigits: 0,
  }).format(Math.round(n || 0));
}
function pct(n: number, d = 2) {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(d)}%`;
}

export default function DividendPlanner() {
  const { baseCurrency } = useBaseCurrency();
  const ccy = (baseCurrency || "USD").toUpperCase();

  const [startingValue, setStartingValue] = useState(25_000);
  const [monthlyContribution, setMonthlyContribution] = useState(500);
  const [contributionGrowth, setContributionGrowth] = useState(3); // % per year
  const [dividendYield, setDividendYield] = useState(3.5);         // % annual
  const [dividendGrowth, setDividendGrowth] = useState(6);         // % per year
  const [priceGrowth, setPriceGrowth] = useState(4);               // % per year (capital appreciation)
  const [taxRate, setTaxRate] = useState(15);                      // % on dividends
  const [years, setYears] = useState(20);
  const [reinvest, setReinvest] = useState(true);
  const [payoutFreq, setPayoutFreq] = useState<"1" | "2" | "4" | "12">("4");

  const rows = useMemo<Row[]>(() => {
    const y0 = dividendYield / 100;
    const dgr = dividendGrowth / 100;
    const pgr = priceGrowth / 100;
    const tax = taxRate / 100;
    const contribGrowth = contributionGrowth / 100;
    const freq = Number(payoutFreq);
    const monthsPerPayout = 12 / freq;

    // Portfolio is modeled as a share of a hypothetical index whose price
    // grows at `pgr` and whose per-share dividend grows at `dgr` from an
    // initial yield of `y0`.  Track shares owned; contributions buy shares
    // at that year's price; dividends are cash unless DRIP is on.
    let price = 1; // normalized starting price
    let shares = startingValue / price;
    let dividendPerShare = (y0 * price) / freq; // per-payout, will grow
    let cash = 0;
    let cumulativeNetContrib = startingValue;
    let cumulativeReinvested = 0;
    let monthlyContrib = monthlyContribution;

    const out: Row[] = [];
    for (let year = 1; year <= years; year++) {
      let grossThisYear = 0;
      let netThisYear = 0;
      let reinvestedThisYear = 0;

      for (let month = 1; month <= 12; month++) {
        // 1) Contribution buys shares at current price
        if (monthlyContrib > 0) {
          const boughtShares = monthlyContrib / price;
          shares += boughtShares;
          cumulativeNetContrib += monthlyContrib;
        }

        // 2) Dividend payout at scheduled months
        if (month % monthsPerPayout === 0) {
          const gross = dividendPerShare * shares;
          const net = gross * (1 - tax);
          grossThisYear += gross;
          netThisYear += net;
          if (reinvest) {
            const drippedShares = net / price;
            shares += drippedShares;
            cumulativeReinvested += net;
            reinvestedThisYear += net;
          } else {
            cash += net;
          }
          // Grow DPS between payouts by annual DGR spread across payouts
          dividendPerShare *= Math.pow(1 + dgr, 1 / freq);
        }

        // 3) Price drifts up monthly by pgr
        price *= Math.pow(1 + pgr, 1 / 12);
      }

      const portfolio = shares * price;
      out.push({
        year,
        yearLabel: `Y${year}`,
        contributions: cumulativeNetContrib,
        reinvested: cumulativeReinvested,
        portfolio,
        grossDividends: grossThisYear,
        netDividends: netThisYear,
        yieldOnCost: cumulativeNetContrib > 0 ? netThisYear / cumulativeNetContrib : 0,
      });

      // Bump monthly contribution for next year (raises / inflation adjust)
      monthlyContrib *= 1 + contribGrowth;
    }
    return out;
  }, [
    startingValue, monthlyContribution, contributionGrowth, dividendYield,
    dividendGrowth, priceGrowth, taxRate, years, reinvest, payoutFreq,
  ]);

  const last = rows[rows.length - 1];
  const totalContrib = last?.contributions ?? startingValue;
  const totalReinvested = last?.reinvested ?? 0;
  const finalPortfolio = last?.portfolio ?? startingValue;
  const finalIncome = last?.netDividends ?? 0;
  const monthlyIncomeFinal = finalIncome / 12;
  const yieldOnCost = last?.yieldOnCost ?? 0;
  const totalReturn = totalContrib > 0 ? finalPortfolio / totalContrib - 1 : 0;

  const exportCsv = () => {
    downloadCsv("dividend-plan.csv", [
      ["Year", "Cumulative contributions", "Cumulative reinvested", "Portfolio value", "Gross dividends", "Net dividends", "Yield on cost"],
      ...rows.map((r) => [
        r.year,
        Math.round(r.contributions),
        Math.round(r.reinvested),
        Math.round(r.portfolio),
        Math.round(r.grossDividends),
        Math.round(r.netDividends),
        (r.yieldOnCost * 100).toFixed(2) + "%",
      ]),
    ]);
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <SEO
        title="Dividend Income Planner — Project Future Dividend Streams"
        description="Model future dividend income with contributions, dividend growth, price appreciation, DRIP and taxes. Interactive charts, yield-on-cost, and year-by-year projections."
        path="/dividends"
      />
      <PageHeader
        icon={Coins}
        title="Dividend Income Planner"
        description="Project future dividend income from contributions, dividend growth, price appreciation and reinvestment."
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Inputs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assumptions</CardTitle>
            <CardDescription>Adjust and watch the projection update.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="start">Starting portfolio</Label>
              <Input id="start" type="number" min={0} step={1000}
                value={startingValue}
                onChange={(e) => setStartingValue(Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contrib">Monthly contribution</Label>
              <Input id="contrib" type="number" min={0} step={50}
                value={monthlyContribution}
                onChange={(e) => setMonthlyContribution(Math.max(0, Number(e.target.value) || 0))} />
            </div>

            <SliderRow label="Contribution growth / yr" value={contributionGrowth} setValue={setContributionGrowth} min={0} max={15} step={0.5} suffix="%" />
            <SliderRow label="Dividend yield" value={dividendYield} setValue={setDividendYield} min={0} max={12} step={0.1} suffix="%" />
            <SliderRow label="Dividend growth (DGR)" value={dividendGrowth} setValue={setDividendGrowth} min={0} max={20} step={0.5} suffix="%" />
            <SliderRow label="Price appreciation" value={priceGrowth} setValue={setPriceGrowth} min={-5} max={15} step={0.5} suffix="%" />
            <SliderRow label="Dividend tax rate" value={taxRate} setValue={setTaxRate} min={0} max={45} step={1} suffix="%" />
            <SliderRow label="Horizon" value={years} setValue={setYears} min={1} max={50} step={1} suffix=" yrs" />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Payout frequency</Label>
                <Select value={payoutFreq} onValueChange={(v) => setPayoutFreq(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Annual</SelectItem>
                    <SelectItem value="2">Semi-annual</SelectItem>
                    <SelectItem value="4">Quarterly</SelectItem>
                    <SelectItem value="12">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center justify-between">
                  Reinvest (DRIP)
                  <Switch checked={reinvest} onCheckedChange={setReinvest} />
                </Label>
                <p className="text-xs text-muted-foreground">
                  {reinvest ? "Net dividends buy new shares." : "Dividends paid as cash."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Outputs */}
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label={`Portfolio in ${years}y`} value={fmt(finalPortfolio, ccy)} hint={`Total return ${pct(totalReturn, 1)}`} tone="good" />
            <Kpi label="Annual income (net)" value={fmt(finalIncome, ccy)} hint={`≈ ${fmt(monthlyIncomeFinal, ccy)} / mo`} tone="good" />
            <Kpi label="Yield on cost" value={pct(yieldOnCost, 2)} hint={`On ${fmt(totalContrib, ccy)} invested`} />
            <Kpi label="Reinvested dividends" value={fmt(totalReinvested, ccy)} hint={reinvest ? "Compounded into shares" : "DRIP off"} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Portfolio & annual dividends
              </CardTitle>
              <CardDescription>Portfolio value grows from contributions + price + reinvested dividends; bars show yearly net dividend income.</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="yearLabel" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11}
                    tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: any, n: any) => [fmt(Number(v), ccy), n]}
                  />
                  <Legend />
                  <Area yAxisId="left" type="monotone" dataKey="portfolio" name="Portfolio value"
                    fill="hsl(var(--primary) / 0.15)" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Bar yAxisId="right" dataKey="netDividends" name="Net dividends"
                    fill="hsl(142 70% 45%)" radius={[3, 3, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Contributions vs reinvestments</CardTitle>
                <CardDescription>How much of your portfolio comes from cash you added vs dividends put back in.</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="yearLabel" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      formatter={(v: any, n: any) => [fmt(Number(v), ccy), n]}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="contributions" name="Contributions" stackId="1"
                      stroke="hsl(199 89% 48%)" fill="hsl(199 89% 48% / 0.35)" />
                    <Area type="monotone" dataKey="reinvested" name="Reinvested dividends" stackId="1"
                      stroke="hsl(142 70% 45%)" fill="hsl(142 70% 45% / 0.4)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Yield on cost</CardTitle>
                <CardDescription>Net annual dividends divided by cumulative capital invested — the payoff of dividend growth.</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="yearLabel" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11}
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      formatter={(v: any) => [pct(Number(v), 2), "Yield on cost"]}
                    />
                    <Line type="monotone" dataKey="yieldOnCost" stroke="hsl(38 92% 50%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Year-by-year</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead className="text-right">Contributions</TableHead>
                    <TableHead className="text-right">Portfolio</TableHead>
                    <TableHead className="text-right">Gross div</TableHead>
                    <TableHead className="text-right">Net div</TableHead>
                    <TableHead className="text-right">YoC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.year}>
                      <TableCell className="font-medium">Y{r.year}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.contributions, ccy)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.portfolio, ccy)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(r.grossDividends, ccy)}</TableCell>
                      <TableCell className="text-right tabular-nums text-success">{fmt(r.netDividends, ccy)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(r.yieldOnCost, 2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Educational projection. Assumes constant growth and yield rates and does not account for market drawdowns,
            dividend cuts, or currency effects. Always cross-check with historical data and your own suitability profile.
          </p>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 tabular-nums ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}

function SliderRow({
  label, value, setValue, min, max, step, suffix,
}: {
  label: string; value: number; setValue: (n: number) => void;
  min: number; max: number; step: number; suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-sm font-medium tabular-nums">{value}{suffix ?? ""}</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => setValue(v)} min={min} max={max} step={step} />
    </div>
  );
}