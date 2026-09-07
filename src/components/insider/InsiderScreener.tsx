import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Radar, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Row {
  symbol: string;
  name: string;
  stance: "long_candidate" | "short_candidate" | "no_edge";
  rationale: string;
  signal: {
    score: number; label: string; buys: number; sells: number;
    buyValue: number; sellValue: number; netValue: number;
    uniqueBuyers: number; uniqueSellers: number; cluster: boolean;
    lastDate: string | null; transactions: number;
  };
}

interface ScreenResult {
  universe: string;
  lookback_days: number;
  scanned: number;
  with_disclosures: number;
  results: Row[];
  buy_candidates: Row[];
  sell_candidates: Row[];
  no_data: string[];
}

const UNIVERSES = [
  { value: "us_megacap", label: "US mega caps" },
  { value: "us_growth", label: "US growth & tech" },
  { value: "us_value", label: "US value & income" },
  { value: "us_smallmid", label: "US small / mid caps" },
  { value: "europe", label: "Europe (slower — regulator filings)" },
];

const money = (n: number) => {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
};

/**
 * Ranks a universe by insider conviction and separates the names insiders are
 * accumulating (long candidates) from the ones they are unloading (short or
 * avoid candidates), with the reasoning behind each row.
 */
export const InsiderScreener = () => {
  const [universe, setUniverse] = useState("us_megacap");
  const [lookback, setLookback] = useState("90");
  const [size, setSize] = useState("20");
  const [data, setData] = useState<ScreenResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("insider-screener", {
        body: { universe, lookback_days: Number(lookback), max_symbols: Number(size) },
      });
      if (err) throw err;
      if ((res as any)?.error) throw new Error((res as any).error);
      setData(res as ScreenResult);
    } catch (e: any) {
      setError(e?.message ?? "Screen failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const scoreTone = (s: number) =>
    s >= 20 ? "text-success" : s <= -20 ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Screen for the strongest insider signals</CardTitle>
              <CardDescription>
                Scans a universe of filings and ranks the names insiders are buying against the ones they are selling.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">Universe</label>
            <Select value={universe} onValueChange={setUniverse}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNIVERSES.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36">
            <label className="mb-1 block text-xs text-muted-foreground">Lookback</label>
            <Select value={lookback} onValueChange={setLookback}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="180">6 months</SelectItem>
                <SelectItem value="365">12 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-36">
            <label className="mb-1 block text-xs text-muted-foreground">Names scanned</label>
            <Select value={size} onValueChange={setSize}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="40">40 (slower)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void run()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}
            Run screen
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && !data && <p className="text-sm text-muted-foreground">Reading filings across the universe — this can take a minute.</p>}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-success" /> Insiders are buying
                </CardTitle>
                <CardDescription>Highest conviction long candidates over {data.lookback_days} days.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {data.buy_candidates.length === 0 ? (
                  <p className="text-muted-foreground">No meaningful insider buying in this universe right now.</p>
                ) : data.buy_candidates.map((r) => (
                  <div key={r.symbol} className="rounded-lg border border-border/60 p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Link to={`/stock/${r.symbol}`} className="font-medium text-primary hover:underline">{r.symbol}</Link>
                      <span className="truncate text-xs text-muted-foreground">{r.name}</span>
                      <Badge variant="outline" className="border-success/40 bg-success/5 text-success">Signal +{r.signal.score}</Badge>
                      {r.signal.cluster && <Badge variant="secondary" className="text-[10px]">Cluster buying</Badge>}
                    </div>
                    <p className="text-muted-foreground">{r.rationale}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingDown className="h-4 w-4 text-destructive" /> Insiders are selling
                </CardTitle>
                <CardDescription>Short or avoid candidates — check whether sales are scheduled plans.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {data.sell_candidates.length === 0 ? (
                  <p className="text-muted-foreground">No heavy insider selling in this universe right now.</p>
                ) : data.sell_candidates.map((r) => (
                  <div key={r.symbol} className="rounded-lg border border-border/60 p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Link to={`/stock/${r.symbol}`} className="font-medium text-primary hover:underline">{r.symbol}</Link>
                      <span className="truncate text-xs text-muted-foreground">{r.name}</span>
                      <Badge variant="outline" className="border-destructive/40 bg-destructive/5 text-destructive">Signal {r.signal.score}</Badge>
                    </div>
                    <p className="text-muted-foreground">{r.rationale}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Full ranking</CardTitle>
              <CardDescription>
                {data.with_disclosures} of {data.scanned} names had disclosures in the window.
                {data.no_data.length > 0 && ` No filings: ${data.no_data.join(", ")}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Signal</TableHead>
                    <TableHead className="text-right">Net $</TableHead>
                    <TableHead className="text-right">Buyers</TableHead>
                    <TableHead className="text-right">Sellers</TableHead>
                    <TableHead className="text-right">Filings</TableHead>
                    <TableHead>Stance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.map((r) => (
                    <TableRow key={r.symbol}>
                      <TableCell>
                        <Link to={`/stock/${r.symbol}`} className="font-medium text-primary hover:underline">{r.symbol}</Link>
                      </TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${scoreTone(r.signal.score)}`}>
                        {r.signal.score > 0 ? "+" : ""}{r.signal.score}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${r.signal.netValue >= 0 ? "text-success" : "text-destructive"}`}>
                        {money(r.signal.netValue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.signal.uniqueBuyers}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.signal.uniqueSellers}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.signal.transactions}</TableCell>
                      <TableCell className="capitalize">{r.stance.replace(/_/g, " ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="text-xs italic text-muted-foreground">
            Insider filings are lagging and noisy: sales are often scheduled compensation plans. Educational research, not investment advice.
          </p>
        </>
      )}
    </div>
  );
};
