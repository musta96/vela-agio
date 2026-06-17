import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Search, ExternalLink, Info, X } from "lucide-react";
import { AiDisclaimerStrip } from "@/components/AiDisclaimerStrip";
import { ASSET_CLASSES, REGIONS, type AssetClass, type RegionKey } from "@/data/marketTaxonomy";
import { RAIL_GROUPS } from "@/data/curatedLists";
import { SpotlightStrip } from "@/components/explore/SpotlightStrip";
import { RailGroup } from "@/components/explore/RailGroup";
import { CategoryChips } from "@/components/explore/CategoryChips";

/**
 * Discovery hub à la Trading 212. Sticky search bar at the top - typing
 * expands the full search experience. When the search is empty we show a
 * spotlight strip and a column of curated 3-tab rails (Most owned / bought
 * / sold, themes, movers, regions, crypto/FX/commodities, bonds/futures…).
 *
 * Coverage uses Yahoo Finance for live quotes - supports stocks, ETFs,
 * funds, bonds (mainly via ETFs/yield indices), crypto, FX, commodities,
 * futures and indices across every exchange Yahoo tracks.
 */

type Hit = {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  currency: string;
};

function classifyType(t: string): AssetClass | "other" {
  const u = (t || "").toUpperCase();
  for (const c of ASSET_CLASSES) if (c.yahooTypes.includes(u)) return c.key;
  return "other";
}

function inferRegion(symbol: string): RegionKey {
  const s = (symbol || "").toUpperCase();
  for (const r of REGIONS) {
    if (r.key === "global" || r.key === "us") continue;
    if (r.exchangeSuffixes.some((suf) => suf && s.endsWith(suf))) return r.key;
  }
  return s.includes(".") ? "global" : "us";
}

export default function Explore() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [assetFilter, setAssetFilter] = useState<AssetClass | "all">("all");
  const [regionFilter, setRegionFilter] = useState<RegionKey | "all">("all");

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/symbol-search?q=${encodeURIComponent(term)}`;
        const r = await fetch(url);
        const j = await r.json();
        if (!cancelled) setHits((j?.results as Hit[]) || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const filtered = useMemo(() => {
    return hits.filter((h) => {
      if (assetFilter !== "all" && classifyType(h.type) !== assetFilter) return false;
      if (regionFilter !== "all" && inferRegion(h.symbol) !== regionFilter) return false;
      return true;
    });
  }, [hits, assetFilter, regionFilter]);

  const searchActive = q.trim().length >= 2;

  return (
    <>
      <SEO title="Explore - Stocks, ETFs, Crypto, FX & more" description="Discover what's trending: most bought, most owned, top movers, themes (Big tech, EU defence, Quantum), crypto, FX, commodities, bonds and futures across global exchanges." path="/explore" />
      <div className="px-4 sm:px-8 py-4 sm:py-6 max-w-7xl mx-auto">
        {/* Sticky search bar */}
        <div className="sticky top-0 z-20 -mx-4 sm:mx-0 px-4 sm:px-0 py-2 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-2 rounded-full glass-card px-4 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search any ticker - AAPL, Eni, Bitcoin, EUR/USD, Gold…"
              className="border-0 shadow-none focus-visible:ring-0 px-0 text-base bg-transparent h-auto"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {searchActive ? (
          <div className="mt-3">
            <div className="flex flex-wrap gap-2 mb-2">
              <Badge variant={assetFilter === "all" ? "default" : "outline"} className="cursor-pointer" onClick={() => setAssetFilter("all")}>All</Badge>
              {ASSET_CLASSES.map((c) => (
                <Badge key={c.key} variant={assetFilter === c.key ? "default" : "outline"} className="cursor-pointer" onClick={() => setAssetFilter(c.key)}>{c.label}</Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant={regionFilter === "all" ? "default" : "outline"} className="cursor-pointer" onClick={() => setRegionFilter("all")}>All regions</Badge>
              {REGIONS.filter((r) => r.key !== "global").map((r) => (
                <Badge key={r.key} variant={regionFilter === r.key ? "default" : "outline"} className="cursor-pointer" onClick={() => setRegionFilter(r.key)}>{r.label}</Badge>
              ))}
            </div>
            <Card className="overflow-hidden glass-card">
              {loading && <div className="px-6 py-10 text-sm text-muted-foreground text-center">Searching…</div>}
              {!loading && filtered.length === 0 && (
                <div className="px-6 py-10 text-sm text-muted-foreground text-center">No matches for those filters.</div>
              )}
              {filtered.length > 0 && (
                <ul className="divide-y divide-border">
                  {filtered.map((h) => (
                    <li key={`${h.symbol}-${h.exchange}`} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">{h.symbol}</span>
                          <Badge variant="outline" className="text-[10px]">{h.type || "-"}</Badge>
                          {h.exchange && <span className="text-xs text-muted-foreground">{h.exchange}</span>}
                          {h.currency && <span className="text-xs text-muted-foreground">· {h.currency}</span>}
                        </div>
                        <div className="text-sm text-foreground truncate">{h.name}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/stock/${encodeURIComponent(h.symbol)}`)} className="gap-1.5">
                        Open <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <div className="mt-4 text-xs text-muted-foreground flex items-start gap-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <p>Coverage uses Yahoo Finance's universal symbol index across global exchanges including NYSE, NASDAQ, TSX, LSE, Euronext, Xetra, Borsa Italiana, SIX, Tokyo, HKEX, ASX, Singapore, Korea, India, Brazil and more. Single-name OTC bonds and options chains aren't included on the free tier. Data is delayed.</p>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-10">
            <header className="space-y-1">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Discover</div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Explore the market</h1>
              <p className="text-sm text-muted-foreground max-w-xl">
                Stocks, ETFs, crypto, FX, commodities, bonds and futures - curated rails refreshed throughout the day.
              </p>
            </header>
            <SpotlightStrip />
            <div className="space-y-10">
              {RAIL_GROUPS.map((g) => <RailGroup key={g.id} group={g} />)}
            </div>
            <CategoryChips onBrowse={(key) => { setQ(" "); setAssetFilter(key as AssetClass); setTimeout(() => setQ(""), 0); }} />
            <div className="text-xs text-muted-foreground flex items-start gap-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <p>Lists are informational, refreshed throughout the day, and not investment advice. Crypto, FX and commodities are inherently more volatile than equities.</p>
            </div>
          </div>
        )}

        <AiDisclaimerStrip />
      </div>
    </>
  );
}