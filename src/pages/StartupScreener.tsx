import { useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Filter, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { COUNTRY_OPTIONS, SECTOR_OPTIONS, STAGE_OPTIONS, money } from "@/hooks/usePrivateCompanies";
import { readEdgeError } from "@/lib/edgeError";

interface Row {
  id: string | null; name: string; country: string; sector: string; stage: string; currency: string;
  region: string; requiredIrr: number; irrSource: string; irrValuation: number | null; irrDetail: string;
  scorecardValuation: number | null; scorecardDetail: string; benchmarkMedian: number;
  weighted: number | null; askPreMoney: number | null; upside: number | null; runwayMonths: number | null;
}

const stageLabel = (id: string) => STAGE_OPTIONS.find((s) => s.id === id)?.label ?? id;
const pct = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);

/** Multi-select rendered as toggle chips — no hidden menus. */
function Chips({ label, options, value, onChange, labels }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; labels?: Record<string, string> }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
              className={`rounded-full border px-2.5 py-1 text-xs capitalize transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              {labels?.[o] ?? o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function StartupScreener() {
  const [countries, setCountries] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [hurdle, setHurdle] = useState("");
  const [rank, setRank] = useState<"required_irr" | "scorecard" | "upside">("required_irr");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("startup-screener", {
        body: {
          includeSaved: true,
          rank,
          requiredIrr: hurdle.trim() ? Number(hurdle) : undefined,
          filters: { countries, sectors, stages },
        },
      });
      if (error) throw new Error((await readEdgeError(error)).message);
      if (data?.error) throw new Error(data.message ?? data.error);
      setRows(data.rows ?? []);
      if (!data.rows?.length) toast.info("No startups matched. Add startups to your watchlist or relax the filters.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Screening failed");
    } finally { setLoading(false); }
  };

  return (
    <>
      <SEO
        title="Startup screener — rank by required IRR and Scorecard | Vela"
        description="Rank the startups you track by the required-IRR (VC) method and the Scorecard method, filtered by country, sector and stage."
        path="/startup-screener"
      />
      <TopNav />
      <div className="container mx-auto px-4 py-6 space-y-5 pb-24">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Filter className="h-5 w-5" />Startup screener</h1>
          <p className="text-sm text-muted-foreground">Ranks the startups on your watchlist with the same benchmark engine as the Startup tab.</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Chips label="Country" options={COUNTRY_OPTIONS} value={countries} onChange={setCountries} />
              <Chips label="Sector" options={SECTOR_OPTIONS} value={sectors} onChange={setSectors} />
              <Chips label="Stage" options={STAGE_OPTIONS.map((s) => s.id)} value={stages} onChange={setStages} labels={Object.fromEntries(STAGE_OPTIONS.map((s) => [s.id, s.label]))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="sc-hurdle">Your required return (IRR, e.g. 0.45)</Label>
                <Input id="sc-hurdle" type="number" step="0.05" value={hurdle} placeholder="benchmark" onChange={(e) => setHurdle(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="sc-rank">Rank by</Label>
                <select id="sc-rank" className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={rank} onChange={(e) => setRank(e.target.value as typeof rank)}>
                  <option value="required_irr">Required-IRR valuation</option>
                  <option value="scorecard">Scorecard valuation</option>
                  <option value="upside">Upside vs the ask</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={run} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}Run screener
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {rows && (
          <Card>
            <CardHeader><CardTitle className="text-base">{rows.length} result{rows.length === 1 ? "" : "s"}</CardTitle></CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing matched these filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Sector</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead className="text-right">Required IRR</TableHead>
                        <TableHead className="text-right">IRR method</TableHead>
                        <TableHead className="text-right">Scorecard</TableHead>
                        <TableHead className="text-right">Weighted</TableHead>
                        <TableHead className="text-right">Upside</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r, i) => (
                        <TableRow key={`${r.name}-${i}`}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">
                            {r.name}
                            <span className="block text-xs text-muted-foreground">{r.region} benchmark median {money(r.benchmarkMedian, r.currency)}</span>
                          </TableCell>
                          <TableCell><Badge variant="secondary">{stageLabel(r.stage)}</Badge></TableCell>
                          <TableCell className="text-sm capitalize">{r.sector}</TableCell>
                          <TableCell className="text-sm">{r.country}</TableCell>
                          <TableCell className="text-right text-sm">{pct(r.requiredIrr)}<span className="block text-xs text-muted-foreground">{r.irrSource}</span></TableCell>
                          <TableCell className="text-right text-sm">{money(r.irrValuation, r.currency)}</TableCell>
                          <TableCell className="text-right text-sm">{money(r.scorecardValuation, r.currency)}</TableCell>
                          <TableCell className="text-right text-sm">{money(r.weighted, r.currency)}</TableCell>
                          <TableCell className={`text-right text-sm ${r.upside != null && r.upside > 0 ? "text-emerald-500" : r.upside != null ? "text-destructive" : ""}`}>
                            {r.upside == null ? "—" : pct(r.upside)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Valuations are pre-money, from stage × region × sector benchmarks. Upside compares the modelled value with the round's implied ask (round size ÷ ownership offered).
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
