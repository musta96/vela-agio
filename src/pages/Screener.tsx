import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { AiDisclaimerStrip } from "@/components/AiDisclaimerStrip";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Search, Loader2, ExternalLink, Filter, Save, FolderOpen, Download, Plus, Sparkles, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { STOCK_CATALOG } from "@/data/stockCatalog";
import { useWatchlist } from "@/hooks/useWatchlist";
import { TickerSearch } from "@/components/TickerSearch";

const UNIVERSES = {
  "FTSE MIB": STOCK_CATALOG.filter((s) => s.market === "FTSE MIB").map((s) => s.symbol),
  Europe: STOCK_CATALOG.filter((s) => s.market === "Europe").map((s) => s.symbol),
  "S&P 500": STOCK_CATALOG.filter((s) => s.market === "S&P 500").map((s) => s.symbol),
  NASDAQ: STOCK_CATALOG.filter((s) => s.market === "NASDAQ").map((s) => s.symbol),
  ETF: STOCK_CATALOG.filter((s) => s.market === "ETF").map((s) => s.symbol),
  MENA: STOCK_CATALOG.filter((s) => s.market === "MENA").map((s) => s.symbol),
  APAC: STOCK_CATALOG.filter((s) => s.market === "APAC").map((s) => s.symbol),
  China: STOCK_CATALOG.filter((s) => s.market === "China").map((s) => s.symbol),
  LatAm: STOCK_CATALOG.filter((s) => s.market === "LatAm").map((s) => s.symbol),
} as const;


const EXAMPLES = [
  "US megacaps with ROE > 20%",
  "Stocks with PEG < 1 and growth > 15%",
  "FTSE MIB banks with P/E < 12 and div yield > 5%",
];

const PRESETS = [
  { emoji: "📈", label: "Italian high-dividend banks", q: "FTSE MIB banks with dividend yield above 5% and P/E below 12" },
  { emoji: "💎", label: "Luxury margin leaders", q: "European luxury names with operating margin above 25%" },
  { emoji: "🛢️", label: "Energy with low debt", q: "Energy names with debt-to-equity below 40 and dividend yield above 4%" },
  { emoji: "🚀", label: "EU small-cap momentum", q: "European small caps with revenue growth above 20%" },
];

function ScoreBadge({ score }: { score: string }) {
  const tone = score.startsWith("A")
    ? "bg-success/15 text-success"
    : score.startsWith("B")
    ? "bg-amber-500/15 text-amber-600"
    : "bg-destructive/15 text-destructive";
  return (
    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${tone}`}>
      {score}
    </span>
  );
}

function scoreFor(r: { roe?: number; pe?: number; opMargin?: number }): string {
  let s = 0;
  if ((r.roe ?? 0) > 0.15) s += 2;
  else if ((r.roe ?? 0) > 0.1) s += 1;
  if ((r.pe ?? 0) > 0 && r.pe! < 15) s += 2;
  else if ((r.pe ?? 0) > 0 && r.pe! < 25) s += 1;
  if ((r.opMargin ?? 0) > 0.2) s += 2;
  else if ((r.opMargin ?? 0) > 0.1) s += 1;
  if (s >= 5) return "A";
  if (s >= 4) return "A-";
  if (s >= 3) return "B+";
  if (s >= 2) return "B";
  return "C";
}

const METRIC_LABELS: Record<string, string> = {
  marketCap: "Market cap", pe: "P/E", forwardPe: "Forward P/E", peg: "PEG", pb: "P/B", ps: "P/S",
  evEbitda: "EV/EBITDA", divYield: "Dividend yield", payout: "Payout ratio", roe: "ROE", roa: "ROA",
  grossMargin: "Gross margin", opMargin: "Operating margin", netMargin: "Net margin",
  revGrowth: "Revenue growth", earningsGrowth: "Earnings growth", debtEquity: "Debt/Equity",
  currentRatio: "Current ratio", beta: "Beta", fcf: "Free cash flow", price: "Price",
  targetMean: "Target price", _score: "Overall score",
};
const metricLabel = (m: string) => METRIC_LABELS[m] ?? m;

interface Result {
  symbol: string;
  name: string;
  sector?: string;
  industry?: string;
  price?: number;
  pe?: number;
  forwardPe?: number;
  pb?: number;
  divYield?: number;
  roe?: number;
  opMargin?: number;
  netMargin?: number;
  revGrowth?: number;
  debtEquity?: number;
  marketCap?: number;
}

const Screener = () => {
  const { toast } = useToast();
  const { toggle, isWatched } = useWatchlist();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [universe, setUniverse] = useState<keyof typeof UNIVERSES>("FTSE MIB");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [spec, setSpec] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ran, setRan] = useState(false);
  const [meta, setMeta] = useState<{ total: number; matched: number } | null>(null);

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    setSpec(null);
    setErrorMsg(null);
    setMeta(null);
    try {
      const { data, error } = await supabase.functions.invoke("nl-screener", {
        body: { query, symbols: UNIVERSES[universe].slice(0, 40) },
      });
      let payload = data as any;
      if (error) {
        // Non-2xx: supabase-js hides the body in error.context — read it so the user sees a real message.
        const ctx = (error as any)?.context;
        const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
        throw new Error(body?.error || body?.reason || error.message || "Screener request failed");
      }
      if (payload?.error) throw new Error(payload.error);
      const rows: Result[] = Array.isArray(payload?.results) ? payload.results : [];
      console.debug("[screener] returned rows:", payload?.matched, "rendering:", rows.length, "universe fetched:", payload?.total);
      setResults(rows);
      setSpec(payload?.spec ?? null);
      setMeta({ total: payload?.total ?? 0, matched: payload?.matched ?? rows.length });
      if (payload?.unmapped?.length) {
        toast({
          title: "Some constraints were not applied",
          description: `Couldn't apply: ${payload.unmapped.join(", ")}`,
        });
      }
    } catch (e: any) {
      const msg = e?.message || "Try again later";
      setErrorMsg(msg);
      toast({ title: "Screener failed", description: msg, variant: "destructive" });
    } finally {
      setRan(true);
      setLoading(false);
    }
  };

  const fmtPct = (v?: number) => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);
  const fmtNum = (v?: number, d = 2) => (v == null ? "-" : v.toFixed(d));
  const fmtCap = (v?: number) => (v == null ? "-" : v > 1e9 ? `${(v / 1e9).toFixed(1)}B` : `${(v / 1e6).toFixed(0)}M`);

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO title="Natural-Language Stock Screener - Powered by AI" description="Describe what you want in plain English. AI translates your query into filters and screens stocks across global markets in seconds." path="/screener" />
      <PageHeader
        icon={Filter}
        title="AI Stock Screener"
        description="Describe what you want in plain English. We translate it into filters and rank the results."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2">
              <FolderOpen className="h-4 w-4" /> Saved screens (4)
            </Button>
            <Button size="sm" className="gap-2">
              <Save className="h-4 w-4" /> Save this screen
            </Button>
          </>
        }
      />
      <AiDisclaimerStrip />

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <Search className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Find a specific company or peer</h2>
          <span className="text-xs text-muted-foreground">— jump straight to a name across any global exchange.</span>
        </div>
        <TickerSearch
          onSelect={(h) => navigate(`/stock/${encodeURIComponent(h.symbol)}`)}
          placeholder="e.g. Apple, ASML, BCHN.MI, Tesla Frankfurt…"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Query column */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Your query</h2>
            <span className="text-[11px] font-medium rounded-full bg-primary/10 text-primary px-2.5 py-0.5">AI · GPT-style</span>
          </div>

          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. FTSE MIB banks with P/E below 12, dividend yield above 5%, and ROE above 10% - rank by 12-month momentum."
            className="min-h-[96px] bg-background border-border resize-none"
          />

          {spec && Array.isArray(spec.filters) && spec.filters.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Detected filters</p>
              <div className="flex flex-wrap gap-2">
                {spec.filters.map((f: any, i: number) => (
                  <span key={i} className="rounded-full bg-muted px-3 py-1 text-xs font-medium font-mono">
                    {metricLabel(f.metric)} {f.op} {f.value}
                  </span>
                ))}
                {Array.isArray(spec.sectors) && spec.sectors.map((sct: string) => (
                  <span key={`sec-${sct}`} className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                    Sector: {sct}
                  </span>
                ))}
                {Array.isArray(spec.industries) && spec.industries.map((ind: string) => (
                  <span key={`ind-${ind}`} className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                    Industry: {ind}
                  </span>
                ))}
                {spec.rankBy && (
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                    Ranked by {metricLabel(spec.rankBy)} ({spec.direction === "asc" ? "lowest first" : "highest first"})
                  </span>
                )}
                {Array.isArray(spec.unmapped) && spec.unmapped.map((u: string) => (
                  <span key={`un-${u}`} className="rounded-full bg-destructive/10 text-destructive px-3 py-1 text-xs font-medium">
                    Couldn't apply: {u}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Try:</span>
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => setQuery(e)} className="rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-muted transition-colors">
                {e}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Edit filters
              </Button>
              <Button size="sm" onClick={run} disabled={loading || !query.trim()} className="gap-1.5">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Screening…</> : <><Sparkles className="h-4 w-4" /> Run screener</>}
              </Button>
            </div>
          </div>
        </div>

        {/* Universe rail */}
        <aside className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h3 className="font-semibold">Universe</h3>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(UNIVERSES) as Array<keyof typeof UNIVERSES>).map((u) => {
              const active = universe === u;
              return (
                <button
                  key={u}
                  onClick={() => setUniverse(u)}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    active ? "bg-foreground text-background" : "border border-border bg-background hover:bg-muted"
                  }`}
                >
                  {u} <span className={active ? "opacity-70" : "text-muted-foreground"}>{UNIVERSES[u].length}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Quick presets</p>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setQuery(p.q)}
                className="block w-full text-left text-sm hover:text-primary transition-colors"
              >
                <span className="mr-1.5">{p.emoji}</span>
                {p.label}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {errorMsg && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center space-y-2">
          <h3 className="font-semibold text-destructive">Screener failed</h3>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <Button size="sm" variant="outline" onClick={run} disabled={loading}>Retry</Button>
        </div>
      )}

      {!errorMsg && ran && !loading && results.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-2">
          <h3 className="font-semibold">No instruments matched these filters — try widening them</h3>
          <p className="text-sm text-muted-foreground">
            Screened {meta?.total ?? 0} instruments in {universe}. Loosen a threshold, remove a constraint, or pick a broader universe.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-border">
            <h3 className="font-semibold">Results · {results.length} matches</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add all to watchlist
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <th className="px-5 py-3">Symbol</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Sector</th>
                  <th className="px-3 py-3 text-right">Price</th>
                  <th className="px-3 py-3 text-right">Rev gr</th>
                  <th className="px-3 py-3 text-right">P/E</th>
                  <th className="px-3 py-3 text-right">Div %</th>
                  <th className="px-3 py-3 text-right">ROE %</th>
                  <th className="px-3 py-3 text-center">Vela Score</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((r) => (
                  <tr key={r.symbol} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 font-bold tabular-nums">{r.symbol}</td>
                    <td className="px-3 py-3 text-muted-foreground">{r.name}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs">{r.sector ?? "-"}</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">€{r.price != null ? r.price.toFixed(2) : "-"}</td>
                    <td className={`px-3 py-3 text-right tabular-nums font-medium ${(r.revGrowth ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>{fmtPct(r.revGrowth)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtNum(r.pe)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.divYield != null ? (r.divYield * 100).toFixed(1) : "-"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.roe != null ? (r.roe * 100).toFixed(1) : "-"}</td>
                    <td className="px-3 py-3 text-center"><ScoreBadge score={scoreFor(r)} /></td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => toggle(r.symbol, r.name)}>
                          <span className="text-amber-500">{isWatched(r.symbol) ? "★" : "☆"}</span> Add
                        </Button>
                        <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                          <Link to={`/stock/${encodeURIComponent(r.symbol)}`}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-xs italic text-muted-foreground">
        {spec?.explanation && `"${spec.explanation}"`}
      </div>
    </div>
  );
};

export default Screener;