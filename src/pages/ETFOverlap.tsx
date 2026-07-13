import { useMemo, useState } from "react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X, GitCompare, Search, Layers } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import { listETFs, findETF, type ETFDef } from "@/lib/etf/holdings";
import {
  pairwiseOverlap, sharedHoldings, sectorMatrix, blendedPortfolio,
  diversificationScore, scoreBand,
} from "@/lib/etf/overlap";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const DEFAULT_SELECTION = ["SPY", "QQQ", "VTI"];
const MAX_SLOTS = 5;

function pct(x: number, digits = 1) {
  return `${x.toFixed(digits)}%`;
}
function pctFrac(x: number, digits = 1) {
  return `${(x * 100).toFixed(digits)}%`;
}

export default function ETFOverlap() {
  const universe = listETFs();
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTION);
  const [allocations, setAllocations] = useState<number[]>(DEFAULT_SELECTION.map(() => 1));
  const [query, setQuery] = useState("");

  const etfs = useMemo(
    () => selected.map((s) => findETF(s)).filter((x): x is ETFDef => !!x),
    [selected],
  );

  const filteredUniverse = useMemo(() => {
    const q = query.trim().toUpperCase();
    return universe.filter(
      (e) =>
        !selected.includes(e.symbol) &&
        (!q || e.symbol.includes(q) || e.name.toUpperCase().includes(q) || e.category.toUpperCase().includes(q)),
    );
  }, [universe, selected, query]);

  function addETF(sym: string) {
    if (selected.includes(sym) || selected.length >= MAX_SLOTS) return;
    setSelected([...selected, sym]);
    setAllocations([...allocations, 1]);
    setQuery("");
  }
  function removeETF(sym: string) {
    const idx = selected.indexOf(sym);
    if (idx < 0) return;
    setSelected(selected.filter((s) => s !== sym));
    setAllocations(allocations.filter((_, i) => i !== idx));
  }
  function setAlloc(i: number, v: number) {
    setAllocations(allocations.map((a, k) => (k === i ? v : a)));
  }

  const pairs = useMemo(() => {
    const out: ReturnType<typeof pairwiseOverlap>[] = [];
    for (let i = 0; i < etfs.length; i++) {
      for (let j = i + 1; j < etfs.length; j++) {
        out.push(pairwiseOverlap(etfs[i], etfs[j]));
      }
    }
    return out;
  }, [etfs]);

  const shared = useMemo(() => (etfs.length >= 2 ? sharedHoldings(etfs) : []), [etfs]);
  const sectors = useMemo(() => (etfs.length >= 1 ? sectorMatrix(etfs) : []), [etfs]);
  const blend = useMemo(() => (etfs.length >= 1 ? blendedPortfolio(etfs, allocations) : null), [etfs, allocations]);
  const scoreObj = useMemo(() => diversificationScore(etfs, allocations), [etfs, allocations]);
  const band = scoreBand(scoreObj.score);

  const sectorChartData = useMemo(
    () =>
      sectors.map((s) => {
        const row: Record<string, any> = { sector: s.sector };
        for (const etf of etfs) row[etf.symbol] = s.weights[etf.symbol] || 0;
        return row;
      }),
    [sectors, etfs],
  );

  const radarData = useMemo(
    () =>
      sectors.slice(0, 8).map((s) => {
        const row: Record<string, any> = { sector: s.sector };
        for (const etf of etfs) row[etf.symbol] = s.weights[etf.symbol] || 0;
        return row;
      }),
    [sectors, etfs],
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      <SEO
        title="ETF Overlap Analyzer — Diversification & Holdings"
        description="Compare ETFs to find overlapping holdings, sector exposure, concentration risk, and a diversification score for portfolio construction."
      />
      <PageHeader
        icon={GitCompare}
        title="ETF Overlap Analyzer"
        subtitle="Compare up to 5 ETFs — spot duplicate holdings, sector concentration, and true diversification"
      />

      {/* Selection panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" /> Selected ETFs ({selected.length}/{MAX_SLOTS})
          </CardTitle>
          <CardDescription>
            Pick funds from the catalog. Allocations are relative weights — used to build the blended portfolio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {etfs.map((etf, i) => (
              <div key={etf.symbol} className="rounded-lg border border-border/60 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <p className="font-semibold">{etf.symbol}</p>
                      <Badge variant="outline" className="text-[10px]">{etf.category}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{etf.name}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeETF(etf.symbol)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                  <div>TER<div className="font-mono text-foreground">{etf.expense.toFixed(2)}%</div></div>
                  <div>AUM<div className="font-mono text-foreground">${etf.aum}B</div></div>
                  <div>Names<div className="font-mono text-foreground">{etf.totalHoldings}</div></div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <Label className="text-xs">Allocation</Label>
                    <span className="font-mono">{pctFrac(allocations[i] / (allocations.reduce((a, b) => a + b, 0) || 1))}</span>
                  </div>
                  <Slider
                    value={[allocations[i] ?? 1]}
                    onValueChange={(v) => setAlloc(i, v[0] ?? 1)}
                    min={0} max={10} step={0.1}
                  />
                </div>
              </div>
            ))}
          </div>

          {selected.length < MAX_SLOTS && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search catalog — symbol, name, or category"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {filteredUniverse.slice(0, 12).map((e) => (
                  <Button key={e.symbol} size="sm" variant="outline" onClick={() => addETF(e.symbol)}>
                    <span className="font-semibold mr-1">{e.symbol}</span>
                    <span className="text-muted-foreground text-xs">{e.category}</span>
                  </Button>
                ))}
                {filteredUniverse.length === 0 && (
                  <p className="text-xs text-muted-foreground">No matches in catalog.</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {etfs.length < 2 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Add at least 2 ETFs to see overlap and diversification analytics.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid gap-3 md:grid-cols-4">
            <Kpi
              label="Diversification Score"
              value={scoreObj.score.toFixed(0)}
              suffix="/100"
              tone={band.tone}
              hint={band.label}
            />
            <Kpi
              label="Avg Pairwise Overlap"
              value={pctFrac(scoreObj.breakdown.avgOverlap)}
              tone={scoreObj.breakdown.avgOverlap > 0.5 ? "bad" : scoreObj.breakdown.avgOverlap > 0.25 ? "warn" : "good"}
              hint="weight-min across shared holdings"
            />
            <Kpi
              label="Blended Top-10 Weight"
              value={pct(scoreObj.breakdown.top10)}
              tone={scoreObj.breakdown.top10 > 45 ? "bad" : scoreObj.breakdown.top10 > 30 ? "warn" : "good"}
              hint="concentration in largest names"
            />
            <Kpi
              label="Top Sector"
              value={sectors[0]?.sector ?? "-"}
              suffix={sectors[0] ? ` ${pct(sectors[0].blended)}` : ""}
              tone={scoreObj.breakdown.topSector > 45 ? "bad" : scoreObj.breakdown.topSector > 30 ? "warn" : "good"}
              hint="blended sector weight"
            />
          </div>

          <Tabs defaultValue="overlap" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overlap">Overlap</TabsTrigger>
              <TabsTrigger value="sectors">Sector Exposure</TabsTrigger>
              <TabsTrigger value="shared">Shared Holdings</TabsTrigger>
              <TabsTrigger value="blend">Blended Portfolio</TabsTrigger>
            </TabsList>

            {/* --- Overlap tab --- */}
            <TabsContent value="overlap" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Pairwise Overlap Matrix</CardTitle>
                  <CardDescription>
                    Weight overlap = Σ min(w<sub>A</sub>, w<sub>B</sub>) across shared holdings. Cosine treats each ETF as a weight vector; Jaccard is a set measure over disclosed top names.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pair</TableHead>
                        <TableHead className="text-right">Weight Overlap</TableHead>
                        <TableHead className="text-right">Cosine</TableHead>
                        <TableHead className="text-right">Jaccard (top)</TableHead>
                        <TableHead className="text-right">Shared names</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pairs.map((p) => (
                        <TableRow key={`${p.a}-${p.b}`}>
                          <TableCell className="font-mono">{p.a} × {p.b}</TableCell>
                          <TableCell className="text-right font-mono">
                            <OverlapCell value={p.weightOverlap} />
                          </TableCell>
                          <TableCell className="text-right font-mono">{p.cosine.toFixed(3)}</TableCell>
                          <TableCell className="text-right font-mono">{p.jaccardTop.toFixed(3)}</TableCell>
                          <TableCell className="text-right font-mono">{p.sharedCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* --- Sectors tab --- */}
            <TabsContent value="sectors" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Sector Weights</CardTitle>
                    <CardDescription>Side-by-side sector exposure per ETF (%)</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[380px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sectorChartData} layout="vertical" margin={{ left: 20, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="sector" type="category" tick={{ fontSize: 11 }} width={110} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                          formatter={(v: number) => `${v.toFixed(1)}%`}
                        />
                        <Legend />
                        {etfs.map((etf, i) => (
                          <Bar key={etf.symbol} dataKey={etf.symbol} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Sector Radar</CardTitle>
                    <CardDescription>Top 8 sectors by blended weight</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[380px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} outerRadius="75%">
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="sector" tick={{ fontSize: 10 }} />
                        <PolarRadiusAxis tick={{ fontSize: 10 }} />
                        {etfs.map((etf, i) => (
                          <Radar
                            key={etf.symbol}
                            name={etf.symbol}
                            dataKey={etf.symbol}
                            stroke={COLORS[i % COLORS.length]}
                            fill={COLORS[i % COLORS.length]}
                            fillOpacity={0.15}
                          />
                        ))}
                        <Legend />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                          formatter={(v: number) => `${v.toFixed(1)}%`}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* --- Shared holdings tab --- */}
            <TabsContent value="shared" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Shared Holdings ({shared.length})</CardTitle>
                  <CardDescription>
                    Names disclosed in the top holdings of ≥ 2 selected ETFs. Sorted by min-weight — a proxy for the guaranteed overlap you carry regardless of allocation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {shared.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No shared names among disclosed top holdings.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticker</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">In</TableHead>
                          <TableHead className="text-right">Min weight</TableHead>
                          {etfs.map((e) => (
                            <TableHead key={e.symbol} className="text-right">{e.symbol}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shared.map((h) => (
                          <TableRow key={h.ticker}>
                            <TableCell className="font-mono font-semibold">{h.ticker}</TableCell>
                            <TableCell className="text-muted-foreground">{h.name}</TableCell>
                            <TableCell className="text-right">{h.count}</TableCell>
                            <TableCell className="text-right font-mono">{pct(h.minWeight)}</TableCell>
                            {etfs.map((e) => (
                              <TableCell key={e.symbol} className="text-right font-mono">
                                {h.weights[e.symbol] != null ? pct(h.weights[e.symbol]) : "—"}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* --- Blend tab --- */}
            <TabsContent value="blend" className="space-y-4">
              {blend && (
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card className="lg:col-span-1">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Concentration</CardTitle>
                      <CardDescription>Disclosed portion of blended NAV</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <MiniStat label="HHI" value={blend.hhi.toFixed(4)} />
                      <MiniStat label="Effective # holdings (disclosed)" value={blend.effectiveN.toFixed(1)} />
                      <MiniStat label="Disclosed coverage" value={pctFrac(blend.disclosedCoverage)} />
                      <MiniStat label="Top-10 weight" value={pct(blend.holdings.slice(0, 10).reduce((s, h) => s + h.weight, 0))} />
                      <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
                        HHI aggregates the squared weights of disclosed names — funds with long tails (e.g. VTI, IWM) will look artificially concentrated because only the top slice is disclosed.
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Blended Top-15 Holdings</CardTitle>
                      <CardDescription>Weighted by your allocations</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[380px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={blend.holdings.slice(0, 15)} layout="vertical" margin={{ left: 20, right: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="ticker" type="category" tick={{ fontSize: 11 }} width={80} />
                          <Tooltip
                            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                            formatter={(v: number, _n, p: any) => [`${v.toFixed(2)}%`, p.payload.name]}
                          />
                          <Bar dataKey="weight" fill="hsl(var(--primary))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <p className="text-[11px] text-muted-foreground">
            Holdings snapshot from issuer disclosures (approx). Overlap metrics use disclosed top holdings; residual portions are treated as unmatched.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({
  label, value, suffix, tone, hint,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "good" | "warn" | "bad";
  hint?: string;
}) {
  const toneClass =
    tone === "good" ? "text-success" :
    tone === "bad" ? "text-destructive" :
    tone === "warn" ? "text-amber-500" : "";
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-mono text-2xl font-semibold ${toneClass}`}>
          {value}<span className="text-sm text-muted-foreground">{suffix}</span>
        </p>
        {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}

function OverlapCell({ value }: { value: number }) {
  const pctv = value * 100;
  const tone = value > 0.5 ? "text-destructive" : value > 0.25 ? "text-amber-500" : "text-success";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-1.5 rounded-full bg-current/20 relative overflow-hidden w-16`}>
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${
            value > 0.5 ? "bg-destructive" : value > 0.25 ? "bg-amber-500" : "bg-success"
          }`}
          style={{ width: `${Math.min(100, pctv)}%` }}
        />
      </span>
      <span className={tone}>{pctv.toFixed(1)}%</span>
    </span>
  );
}