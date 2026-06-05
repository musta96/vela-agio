import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Activity, RefreshCw, Info } from "lucide-react";
import { AiDisclaimerStrip } from "@/components/AiDisclaimerStrip";
import { FeedFallback } from "@/components/FeedFallback";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { INDICES, type IndexKey } from "@/data/marketTaxonomy";

/**
 * Top gainers / losers / most active across an index or globally per region.
 * Backed by the `market-movers` edge function; refreshes every 60s.
 */

type Mover = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  currency?: string;
  exchange?: string;
};

type Scope = { kind: "index"; indexKey: IndexKey } | { kind: "region"; region: string };

// Each region maps to one or more index constituent buckets so we ALWAYS rank
// against region-correct tickers (Yahoo's "most_actives" screener is US-only).
const REGION_INDICES: Record<string, IndexKey[]> = {
  us: ["sp500", "nasdaq100", "dow"],
  it: ["ftse_mib"],
  gb: ["ftse100"],
  de: ["dax"],
  fr: ["cac40"],
  eu: ["stoxx50", "dax", "cac40", "ftse_mib"],
  jp: ["nikkei"],
  hk: ["hangseng"],
};
const REGION_OPTS = [
  { v: "us", label: "United States" },
  { v: "eu", label: "Europe (broad)" },
  { v: "it", label: "Italy" },
  { v: "gb", label: "United Kingdom" },
  { v: "de", label: "Germany" },
  { v: "fr", label: "France" },
  { v: "jp", label: "Japan" },
  { v: "hk", label: "Hong Kong" },
];

function fmt(n: number | undefined, digits = 2) {
  if (n == null || !isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export default function Movers() {
  const navigate = useNavigate();
  const [scopeKind, setScopeKind] = useState<"index" | "global">("index");
  const [indexKey, setIndexKey] = useState<IndexKey>("sp500");
  const [region, setRegion] = useState<string>("us");
  const [movers, setMovers] = useState<Mover[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const scope: Scope = useMemo(() => scopeKind === "index" ? { kind: "index", indexKey } : { kind: "region", region }, [scopeKind, indexKey, region]);

  async function load() {
    setLoading(true);
    try {
      let symbols: string[];
      if (scope.kind === "index") {
        symbols = INDICES[scope.indexKey].constituents;
      } else {
        // Aggregate all major indices in the region for ranking.
        const keys = REGION_INDICES[scope.region] || ["sp500"];
        symbols = Array.from(new Set(keys.flatMap((k) => INDICES[k].constituents)));
      }
      const { data, error } = await supabase.functions.invoke("market-movers", {
        body: { scope: "index", symbols },
      });
      if (error) console.error("market-movers error", error);
      if (data?.movers) setMovers(data.movers as Mover[]);
      else setMovers([]);
      setLastUpdated(Date.now());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKind, indexKey, region]);

  const gainers = [...movers].filter((m) => isFinite(m.changePercent)).sort((a, b) => b.changePercent - a.changePercent).slice(0, 15);
  const losers = [...movers].filter((m) => isFinite(m.changePercent)).sort((a, b) => a.changePercent - b.changePercent).slice(0, 15);
  const actives = [...movers].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 15);

  function Row({ m, side }: { m: Mover; side: "up" | "down" | "vol" }) {
    const pct = m.changePercent;
    const tone = pct > 0 ? "text-success" : pct < 0 ? "text-destructive" : "text-muted-foreground";
    return (
      <button onClick={() => navigate(`/stock/${encodeURIComponent(m.symbol)}`)} className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/50 text-left">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{m.symbol} <span className="text-xs font-normal text-muted-foreground">{m.name}</span></div>
          {m.exchange && <div className="text-[10px] text-muted-foreground">{m.exchange}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold tabular-nums">{fmt(m.price)}</div>
          <div className={`text-xs font-semibold tabular-nums ${tone}`}>{pct > 0 ? "+" : ""}{fmt(pct)}%</div>
        </div>
      </button>
    );
  }

  return (
    <>
      <SEO title="Market Movers — Vela" description="Top gainers, losers and most-active stocks across global indices and regions, refreshed every minute." path="/movers" />
      <div className="px-6 sm:px-8 py-6 max-w-7xl mx-auto">
        <PageHeader
          icon={Activity}
          title="Market Movers"
          description="Top gainers, losers and most actives. Auto-refresh every 60s."
          actions={<Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>}
        />

        <Card className="p-3 mb-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            <Badge variant={scopeKind === "index" ? "default" : "outline"} className="cursor-pointer" onClick={() => setScopeKind("index")}>By index</Badge>
            <Badge variant={scopeKind === "global" ? "default" : "outline"} className="cursor-pointer" onClick={() => setScopeKind("global")}>By region</Badge>
          </div>
          {scopeKind === "index" ? (
            <Select value={indexKey} onValueChange={(v) => setIndexKey(v as IndexKey)}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(INDICES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REGION_OPTS.map((r) => <SelectItem key={r.v} value={r.v}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {lastUpdated && <span className="text-xs text-muted-foreground ml-auto">Updated {new Date(lastUpdated).toLocaleTimeString()}</span>}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-success/5">
              <TrendingUp className="h-4 w-4 text-success" />
              <h3 className="text-sm font-semibold">Top gainers</h3>
            </div>
            <div className="divide-y divide-border">{
              loading && gainers.length === 0
                ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="px-4 py-3"><Skeleton className="h-4 w-full" /></div>)
                : gainers.length
                  ? gainers.map((m) => <Row key={m.symbol} m={m} side="up" />)
                  : <div className="p-4"><FeedFallback label="gainers" onRetry={load} /></div>
            }</div>
          </Card>
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-destructive/5">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <h3 className="text-sm font-semibold">Top losers</h3>
            </div>
            <div className="divide-y divide-border">{
              loading && losers.length === 0
                ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="px-4 py-3"><Skeleton className="h-4 w-full" /></div>)
                : losers.length
                  ? losers.map((m) => <Row key={m.symbol} m={m} side="down" />)
                  : <div className="p-4"><FeedFallback label="losers" onRetry={load} /></div>
            }</div>
          </Card>
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-primary/5">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Most active</h3>
            </div>
            <div className="divide-y divide-border">{
              loading && actives.length === 0
                ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="px-4 py-3"><Skeleton className="h-4 w-full" /></div>)
                : actives.length
                  ? actives.map((m) => <Row key={m.symbol} m={m} side="vol" />)
                  : <div className="p-4"><FeedFallback label="most-active" onRetry={load} /></div>
            }</div>
          </Card>
        </div>

        <div className="mt-4 text-xs text-muted-foreground flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <p>Data sourced from Yahoo Finance, delayed up to 15 minutes. Past performance is not indicative of future results. For informational purposes only.</p>
        </div>
        <AiDisclaimerStrip />
      </div>
    </>
  );
}