import { useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Filter, Search, Globe, Database, Save, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { COUNTRY_OPTIONS, SECTOR_OPTIONS, STAGE_OPTIONS, money } from "@/hooks/usePrivateCompanies";
import { readEdgeError } from "@/lib/edgeError";

interface Row {
  id: string | null; name: string; website: string | null; country: string; sector: string; stage: string; currency: string;
  region: string; requiredIrr: number; irrSource: string; irrValuation: number | null; irrDetail: string;
  scorecardValuation: number | null; scorecardDetail: string; benchmarkMedian: number;
  weighted: number | null; askPreMoney: number | null; upside: number | null; runwayMonths: number | null;
  notes?: string[];
}

const stageLabel = (id: string) => STAGE_OPTIONS.find((s) => s.id === id)?.label ?? id;
const pct = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);

const DISCOVERY_SOURCES = [
  { id: "news", label: "Funding news", description: "GDELT & Bing News funding headlines" },
  { id: "sec_formd", label: "SEC Form D", description: "Official US fundraise filings" },
  { id: "crunchbase_web", label: "Crunchbase (web)", description: "Best-effort public pages" },
  { id: "github", label: "GitHub", description: "Open-source growth signals" },
  { id: "byo_crunchbase", label: "Crunchbase API", description: "BYO key" },
  { id: "byo_pitchbook", label: "PitchBook", description: "BYO enterprise key" },
  { id: "byo_dealroom", label: "Dealroom", description: "BYO enterprise key" },
];

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
  const [mode, setMode] = useState<"saved" | "discover">("saved");
  const [query, setQuery] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [discoverySources, setDiscoverySources] = useState<string[]>(["news"]);
  const [hurdle, setHurdle] = useState("");
  const [rank, setRank] = useState<"required_irr" | "scorecard" | "upside">("required_irr");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const run = async () => {
    setLoading(true);
    setWarnings([]);
    try {
      const { data, error } = await supabase.functions.invoke("startup-screener", {
        body: {
          source: mode,
          query: query.trim() || undefined,
          includeSaved: mode === "saved",
          discoverySources,
          rank,
          requiredIrr: hurdle.trim() ? Number(hurdle) : undefined,
          filters: { countries, sectors, stages },
          limit: 50,
        },
      });
      if (error) throw new Error((await readEdgeError(error)).message);
      if (data?.error) throw new Error(data.message ?? data.error);
      setRows(data.rows ?? []);
      setWarnings(data.warnings ?? []);
      if (!data.rows?.length) toast.info("No startups matched. Try discover mode, relax filters, or add startups to your watchlist.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Screening failed");
    } finally { setLoading(false); }
  };

  const saveToWatchlist = async (row: Row) => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { toast.error("Sign in first"); return; }
      const { error } = await supabase.from("private_companies").insert({
        kind: "startup",
        user_id: auth.user.id,
        name: row.name,
        website: row.website,
        country: row.country,
        sector: row.sector,
        stage: row.stage,
        currency: row.currency,
        round_size: row.askPreMoney,
        status: "tracking",
        inputs: {},
      });
      if (error) throw new Error(error.message);
      toast.success(`${row.name} added to your startup watchlist`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  return (
    <>
      <SEO
        title="Startup screener — rank by required IRR and Scorecard | Vela"
        description="Rank the startups you track — or discover new ones from funding news and official filings — by the required-IRR (VC) method and the Scorecard method, filtered by country, sector and stage."
        path="/startup-screener"
      />
      <TopNav />
      <div className="container mx-auto px-4 py-6 space-y-5 pb-24">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Filter className="h-5 w-5" />Startup screener</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "saved"
              ? "Rank the startups on your watchlist with the same benchmark engine as the Startup tab."
              : "Discover real startups from funding news and SEC Form D filings, then rank them with the benchmark engine."}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant={mode === "saved" ? "default" : "outline"} size="sm" onClick={() => setMode("saved")}><Database className="h-4 w-4 mr-2" />My watchlist</Button>
          <Button variant={mode === "discover" ? "default" : "outline"} size="sm" onClick={() => setMode("discover")}><Globe className="h-4 w-4 mr-2" />Discover</Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {mode === "discover" && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs" htmlFor="sc-query">Search / keywords</Label>
                  <Input id="sc-query" placeholder="e.g. climate fintech, AI infrastructure, medtech" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Data sources</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {DISCOVERY_SOURCES.map((s) => {
                      const on = discoverySources.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setDiscoverySources(on ? discoverySources.filter((x) => x !== s.id) : [...discoverySources, s.id])}
                          className={`rounded-md border px-2.5 py-1.5 text-xs text-left transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                        >
                          <span className="font-medium">{s.label}</span>
                          <span className="block text-[10px] opacity-80">{s.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
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

        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />Source notes</div>
            <ul className="list-disc ml-5 mt-1 space-y-0.5">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

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
                        {mode === "discover" && <TableHead className="text-right">Action</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r, i) => (
                        <TableRow key={`${r.name}-${i}`}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">
                            {r.name}
                            <span className="block text-xs text-muted-foreground">{r.region} benchmark median {money(r.benchmarkMedian, r.currency)}</span>
                            {r.website && <a href={r.website.startsWith("http") ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer" className="block text-xs text-primary hover:underline">{r.website}</a>}
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
                          {mode === "discover" && (
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" aria-label="Save" onClick={() => saveToWatchlist(r)}><Save className="h-3.5 w-3.5 mr-1" />Save</Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Valuations are pre-money, from stage × region × sector benchmarks. Upside compares the modelled value with the round's implied ask (round size ÷ ownership offered). Discover-mode candidates come from live sources and may need verification before investing.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
