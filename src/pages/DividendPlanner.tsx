import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Coins, Download, TrendingUp, Briefcase, Calendar, RotateCcw, Save } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart,
} from "recharts";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { downloadCsv } from "@/lib/csvUtil";
import { usePortfolio } from "@/hooks/usePortfolio";
import { projectDividends, buildPayoutCalendar, type DividendPositionSeed } from "@/lib/dividends/project";

/** LocalStorage key for persisted planner settings. */
const STORAGE_KEY = "vela.dividendPlanner.v2";

type PersistedSettings = {
  startingValue: number;
  monthlyContribution: number;
  contributionGrowth: number;
  dividendYield: number;
  dividendGrowth: number;
  priceGrowth: number;
  taxRate: number;
  years: number;
  reinvest: boolean;
  payoutFreq: "1" | "2" | "4" | "12";
  globalDripPct: number;
  importFromPortfolio: boolean;
  positionYields: Record<string, number>;
  positionDrip: Record<string, number>;
  nextPayoutMonth: number;
};

const DEFAULTS: PersistedSettings = {
  startingValue: 25_000,
  monthlyContribution: 500,
  contributionGrowth: 3,
  dividendYield: 3.5,
  dividendGrowth: 6,
  priceGrowth: 4,
  taxRate: 15,
  years: 20,
  reinvest: true,
  payoutFreq: "4",
  globalDripPct: 100,
  importFromPortfolio: false,
  positionYields: {},
  positionDrip: {},
  nextPayoutMonth: new Date().getMonth() + 1,
};

function loadPersisted(): PersistedSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

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

// Naive default per-symbol dividend yield estimate (annual %). Only used
// as a seed when we don't have a live quote fundamental; users can edit
// the per-position yield in the imported table before projecting.
const DEFAULT_YIELD_BY_SYMBOL: Record<string, number> = {};
const DEFAULT_YIELD = 2.0;

export default function DividendPlanner() {
  const { baseCurrency } = useBaseCurrency();
  const ccy = (baseCurrency || "USD").toUpperCase();
  const portfolio = usePortfolio();
  const initial = useMemo(() => loadPersisted(), []);

  const [startingValue, setStartingValue] = useState(initial.startingValue);
  const [monthlyContribution, setMonthlyContribution] = useState(initial.monthlyContribution);
  const [contributionGrowth, setContributionGrowth] = useState(initial.contributionGrowth);
  const [dividendYield, setDividendYield] = useState(initial.dividendYield);
  const [dividendGrowth, setDividendGrowth] = useState(initial.dividendGrowth);
  const [priceGrowth, setPriceGrowth] = useState(initial.priceGrowth);
  const [taxRate, setTaxRate] = useState(initial.taxRate);
  const [years, setYears] = useState(initial.years);
  const [reinvest, setReinvest] = useState(initial.reinvest);
  const [payoutFreq, setPayoutFreq] = useState<"1" | "2" | "4" | "12">(initial.payoutFreq);
  const [globalDripPct, setGlobalDripPct] = useState<number>(initial.globalDripPct);

  const [importFromPortfolio, setImportFromPortfolio] = useState(initial.importFromPortfolio);
  const [positionYields, setPositionYields] = useState<Record<string, number>>(initial.positionYields);
  const [positionDrip, setPositionDrip] = useState<Record<string, number>>(initial.positionDrip);
  const [nextPayoutMonth, setNextPayoutMonth] = useState<number>(initial.nextPayoutMonth);
  const [savedAt, setSavedAt] = useState<number>(0);

  // Persist all planner settings automatically (debounced via microtask).
  useEffect(() => {
    const payload: PersistedSettings = {
      startingValue, monthlyContribution, contributionGrowth, dividendYield,
      dividendGrowth, priceGrowth, taxRate, years, reinvest, payoutFreq,
      globalDripPct, importFromPortfolio, positionYields, positionDrip, nextPayoutMonth,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setSavedAt(Date.now());
    } catch { /* quota / private mode — silent */ }
  }, [startingValue, monthlyContribution, contributionGrowth, dividendYield,
      dividendGrowth, priceGrowth, taxRate, years, reinvest, payoutFreq,
      globalDripPct, importFromPortfolio, positionYields, positionDrip, nextPayoutMonth]);

  const resetSettings = () => {
    setStartingValue(DEFAULTS.startingValue);
    setMonthlyContribution(DEFAULTS.monthlyContribution);
    setContributionGrowth(DEFAULTS.contributionGrowth);
    setDividendYield(DEFAULTS.dividendYield);
    setDividendGrowth(DEFAULTS.dividendGrowth);
    setPriceGrowth(DEFAULTS.priceGrowth);
    setTaxRate(DEFAULTS.taxRate);
    setYears(DEFAULTS.years);
    setReinvest(DEFAULTS.reinvest);
    setPayoutFreq(DEFAULTS.payoutFreq);
    setGlobalDripPct(DEFAULTS.globalDripPct);
    setImportFromPortfolio(DEFAULTS.importFromPortfolio);
    setPositionYields({});
    setPositionDrip({});
    setNextPayoutMonth(DEFAULTS.nextPayoutMonth);
  };

  const seedPositions: DividendPositionSeed[] = useMemo(() => {
    if (!importFromPortfolio) return [];
    return portfolio.positions.map((p) => ({
      symbol: p.holding.symbol,
      shares: p.holding.shares,
      price: p.effectivePrice,
      yieldPct: positionYields[p.holding.symbol]
        ?? DEFAULT_YIELD_BY_SYMBOL[p.holding.symbol]
        ?? DEFAULT_YIELD,
      dripPct: positionDrip[p.holding.symbol] ?? globalDripPct,
      nextPayoutMonth,
    }));
  }, [importFromPortfolio, portfolio.positions, positionYields, positionDrip, globalDripPct, nextPayoutMonth]);

  const projection = useMemo(
    () =>
      projectDividends({
        startingValue,
        monthlyContribution,
        contributionGrowthPct: contributionGrowth,
        dividendYieldPct: dividendYield,
        dividendGrowthPct: dividendGrowth,
        priceGrowthPct: priceGrowth,
        taxPct: taxRate,
        years,
        reinvest,
        payoutFrequency: Number(payoutFreq) as 1 | 2 | 4 | 12,
        reinvestRatePct: globalDripPct,
        positions: seedPositions,
      }),
    [startingValue, monthlyContribution, contributionGrowth, dividendYield,
     dividendGrowth, priceGrowth, taxRate, years, reinvest, payoutFreq, globalDripPct, seedPositions],
  );

  const rows = useMemo(
    () => projection.rows.map((r) => ({ ...r, yearLabel: `Y${r.year}` })),
    [projection.rows],
  );
  const totalContrib = projection.totalContrib;
  const totalReinvested = projection.totalReinvested;
  const finalPortfolio = projection.finalPortfolio;
  const finalIncome = projection.finalNetIncome;
  const monthlyIncomeFinal = finalIncome / 12;
  const yieldOnCost = projection.yieldOnCost;
  const totalReturn = totalContrib > 0 ? finalPortfolio / totalContrib - 1 : 0;

  const payoutCalendar = useMemo(
    () => (importFromPortfolio ? buildPayoutCalendar(seedPositions, new Date().getMonth() + 1) : []),
    [importFromPortfolio, seedPositions],
  );

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
          <div className="flex items-center gap-2">
            {savedAt > 0 && (
              <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground">
                <Save className="h-3 w-3" /> Saved
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={resetSettings} title="Reset all planner settings to defaults">
              <RotateCcw className="h-4 w-4 mr-2" /> Reset
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </div>
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
            {/* Portfolio import */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm flex items-center gap-1.5 cursor-pointer">
                  <Briefcase className="h-3.5 w-3.5 text-primary" /> Seed from my portfolio
                </Label>
                <Switch checked={importFromPortfolio} onCheckedChange={setImportFromPortfolio} disabled={portfolio.loading || portfolio.positions.length === 0} />
              </div>
              {importFromPortfolio ? (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    Using {portfolio.positions.length} live position{portfolio.positions.length === 1 ? "" : "s"} · blended starting yield
                    <span className="font-medium text-foreground"> {projection.blendedStartYieldPct.toFixed(2)}%</span>
                    · starting value <span className="font-medium text-foreground">{fmt(portfolio.marketValue, ccy)}</span>
                  </p>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1.5"><Calendar className="h-3 w-3" /> First payout month</Label>
                    <Select value={String(nextPayoutMonth)} onValueChange={(v) => setNextPayoutMonth(Number(v))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "long" })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {portfolio.positions.length === 0
                    ? "No holdings found — add positions in Portfolio, then re-toggle."
                    : "Toggle on to project from your real holdings and pay dates."}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="start">Starting portfolio {importFromPortfolio && <span className="text-[10px] text-muted-foreground">(from holdings)</span>}</Label>
              <Input id="start" type="number" min={0} step={1000}
                value={startingValue}
                disabled={importFromPortfolio}
                onChange={(e) => setStartingValue(Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contrib">Monthly contribution</Label>
              <Input id="contrib" type="number" min={0} step={50}
                value={monthlyContribution}
                onChange={(e) => setMonthlyContribution(Math.max(0, Number(e.target.value) || 0))} />
            </div>

            <SliderRow label="Contribution growth / yr" value={contributionGrowth} setValue={setContributionGrowth} min={0} max={15} step={0.5} suffix="%" />
            <SliderRow label={importFromPortfolio ? "Yield on new capital" : "Dividend yield"} value={dividendYield} setValue={setDividendYield} min={0} max={12} step={0.1} suffix="%" />
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
                  <Switch checked={reinvest} onCheckedChange={(v) => { setReinvest(v); setGlobalDripPct(v ? 100 : 0); }} />
                </Label>
                <p className="text-xs text-muted-foreground">
                  {globalDripPct >= 100 ? "Full DRIP — every dividend reinvests." : globalDripPct <= 0 ? "Dividends paid as cash." : `${globalDripPct}% reinvested, rest paid as cash.`}
                </p>
              </div>
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Default DRIP rate</Label>
                <span className="text-sm font-medium tabular-nums">{globalDripPct}%</span>
              </div>
              <Slider
                value={[globalDripPct]}
                onValueChange={([v]) => { setGlobalDripPct(v); setReinvest(v > 0); }}
                min={0} max={100} step={5}
              />
              <p className="text-[11px] text-muted-foreground">
                Applied on each pay date. Per-position overrides in the imported table win when seeded from portfolio.
              </p>
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

          {/* Imported positions + upcoming payout calendar */}
          {importFromPortfolio && seedPositions.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-primary" /> Imported positions
                  </CardTitle>
                  <CardDescription>Edit each holding's estimated yield to refine the projection.</CardDescription>
                </CardHeader>
                <CardContent className="p-0 max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Yield %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {seedPositions.map((p) => (
                        <TableRow key={p.symbol}>
                          <TableCell className="font-medium">{p.symbol}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.shares * p.price, ccy)}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.1"
                              className="h-7 w-20 ml-auto text-right text-xs"
                              value={p.yieldPct}
                              onChange={(e) => setPositionYields((prev) => ({ ...prev, [p.symbol]: Number(e.target.value) || 0 }))}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" /> Next 12 months of payouts
                  </CardTitle>
                  <CardDescription>Estimated cash from imported positions using quarterly cadence.</CardDescription>
                </CardHeader>
                <CardContent className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={payoutCalendar}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="monthLabel" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11}
                        tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                        formatter={(v: any) => [fmt(Number(v), ccy), "Income"]}
                        labelFormatter={(l, payload) => {
                          const c = (payload?.[0]?.payload as any)?.contributors ?? [];
                          return `${l}${c.length ? " · " + c.slice(0, 4).join(", ") : ""}`;
                        }}
                      />
                      <Bar dataKey="income" fill="hsl(142 70% 45%)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

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