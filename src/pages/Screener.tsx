import { useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, ExternalLink, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { STOCK_CATALOG } from "@/data/stockCatalog";
import { useWatchlist } from "@/hooks/useWatchlist";

const UNIVERSES = {
  "FTSE MIB": STOCK_CATALOG.filter((s) => s.market === "FTSE MIB").map((s) => s.symbol),
  Europe: STOCK_CATALOG.filter((s) => s.market === "Europe").map((s) => s.symbol),
  "S&P 500": STOCK_CATALOG.filter((s) => s.market === "S&P 500").map((s) => s.symbol),
  NASDAQ: STOCK_CATALOG.filter((s) => s.market === "NASDAQ").map((s) => s.symbol),
  ETF: STOCK_CATALOG.filter((s) => s.market === "ETF").map((s) => s.symbol),
} as const;

const EXAMPLES = [
  "FTSE MIB names with P/E below 12 and dividend yield above 5%",
  "US megacaps with ROE above 20% and net margin above 15%",
  "Stocks with PEG below 1 and revenue growth above 15%",
  "European blue chips with debt-to-equity below 50 and operating margin above 20%",
];

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
  const [query, setQuery] = useState("");
  const [universe, setUniverse] = useState<keyof typeof UNIVERSES>("FTSE MIB");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [spec, setSpec] = useState<any>(null);

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    setSpec(null);
    try {
      const { data, error } = await supabase.functions.invoke("nl-screener", {
        body: { query, symbols: UNIVERSES[universe].slice(0, 40) },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResults((data as any).results || []);
      setSpec((data as any).spec);
      if ((data as any).results?.length === 0) {
        toast({ title: "No matches", description: `Tried ${(data as any).total ?? "?"} symbols in ${universe}.` });
      }
    } catch (e: any) {
      toast({ title: "Screener failed", description: e?.message || "Try again later", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fmtPct = (v?: number) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
  const fmtNum = (v?: number, d = 2) => (v == null ? "—" : v.toFixed(d));
  const fmtCap = (v?: number) => (v == null ? "—" : v > 1e9 ? `${(v / 1e9).toFixed(1)}B` : `${(v / 1e6).toFixed(0)}M`);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Natural-Language Stock Screener — Powered by AI" description="Describe what you want in plain English. AI translates your query into filters and screens stocks across global markets in seconds." path="/screener" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Sparkles className="h-7 w-7 text-primary" /> AI Stock Screener</h1>
          <p className="text-muted-foreground mt-1">Describe what you're looking for. AI translates it into filters and ranks the results.</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your query</CardTitle>
            <CardDescription>Plain English. Example: "Italian banks with dividend yield above 6%".</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. FTSE MIB stocks with P/E under 10 and ROE above 12%"
              className="min-h-[80px]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Universe:</span>
              {(Object.keys(UNIVERSES) as Array<keyof typeof UNIVERSES>).map((u) => (
                <Badge
                  key={u}
                  variant={universe === u ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setUniverse(u)}
                >
                  {u} ({UNIVERSES[u].length})
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <Button key={e} variant="ghost" size="sm" className="text-xs h-7" onClick={() => setQuery(e)}>{e}</Button>
              ))}
            </div>
            <Button onClick={run} disabled={loading || !query.trim()} className="gap-1.5">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Screening…</> : <><Search className="h-4 w-4" /> Run screener</>}
            </Button>
          </CardContent>
        </Card>

        {spec && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Interpreted filters</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {Array.isArray(spec.filters) && spec.filters.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {spec.filters.map((f: any, i: number) => (
                    <Badge key={i} variant="outline" className="font-mono">{f.metric} {f.op} {f.value}</Badge>
                  ))}
                </div>
              )}
              {spec.rankBy && <p className="text-xs text-muted-foreground">Ranked by <span className="font-mono">{spec.rankBy}</span> {spec.direction === "asc" ? "ascending" : "descending"}.</p>}
              {spec.explanation && <p className="text-xs text-foreground/80 italic">"{spec.explanation}"</p>}
            </CardContent>
          </Card>
        )}

        {results.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{results.length} matches</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-border text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3">Symbol</th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Sector</th>
                      <th className="py-2 pr-3 text-right">Mkt cap</th>
                      <th className="py-2 pr-3 text-right">P/E</th>
                      <th className="py-2 pr-3 text-right">Fwd P/E</th>
                      <th className="py-2 pr-3 text-right">Div Y</th>
                      <th className="py-2 pr-3 text-right">ROE</th>
                      <th className="py-2 pr-3 text-right">Op marg</th>
                      <th className="py-2 pr-3 text-right">Rev gr</th>
                      <th className="py-2 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.symbol} className="border-b border-border/40">
                        <td className="py-2 pr-3 font-mono font-semibold">{r.symbol}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{r.name}</td>
                        <td className="py-2 pr-3 text-xs">{r.sector ?? "—"}</td>
                        <td className="py-2 pr-3 text-right font-mono">{fmtCap(r.marketCap)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{fmtNum(r.pe)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{fmtNum(r.forwardPe)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{fmtPct(r.divYield)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{fmtPct(r.roe)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{fmtPct(r.opMargin)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{fmtPct(r.revGrowth)}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-1 justify-end">
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => toggle(r.symbol, r.name)}>
                              {isWatched(r.symbol) ? "★" : "☆"}
                            </Button>
                            <Link to={`/stock/${encodeURIComponent(r.symbol)}`} className="text-primary inline-flex items-center gap-1 hover:underline text-xs">Open <ExternalLink className="h-3 w-3" /></Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Screener;