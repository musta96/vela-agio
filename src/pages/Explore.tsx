import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Compass, Search, ExternalLink, Info } from "lucide-react";
import { AiDisclaimerStrip } from "@/components/AiDisclaimerStrip";
import { ASSET_CLASSES, REGIONS, type AssetClass, type RegionKey } from "@/data/marketTaxonomy";

/**
 * Universal Instrument Explorer. Search across ~150k instruments via the
 * `symbol-search` edge function (Yahoo Finance autocomplete). Client-side
 * filters by asset class, region/exchange and currency.
 *
 * Note: bond coverage is limited (mostly via mutual funds and ETFs); OTC
 * single-name bonds aren't indexed by Yahoo. We disclose that on-page.
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

  return (
    <>
      <SEO title="Explore Instruments — Vela" description="Search 150,000+ stocks, ETFs, funds, bonds, crypto, FX and indices across global exchanges." />
      <div className="px-6 sm:px-8 py-6 max-w-7xl mx-auto">
        <PageHeader icon={Compass} title="Explore Instruments" description="Search across ~150,000 instruments worldwide — stocks, ETFs, mutual funds, bonds, crypto, FX, futures and indices." />

        <Card className="p-4 mb-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any ticker or name — AAPL, Eni, MSCI World, Bitcoin, EUR/USD…" className="border-0 shadow-none focus-visible:ring-0 px-0 text-base" />
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant={assetFilter === "all" ? "default" : "outline"} className="cursor-pointer" onClick={() => setAssetFilter("all")}>All assets</Badge>
            {ASSET_CLASSES.map((c) => (
              <Badge key={c.key} variant={assetFilter === c.key ? "default" : "outline"} className="cursor-pointer" onClick={() => setAssetFilter(c.key)}>{c.label}</Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant={regionFilter === "all" ? "default" : "outline"} className="cursor-pointer" onClick={() => setRegionFilter("all")}>All regions</Badge>
            {REGIONS.filter((r) => r.key !== "global").map((r) => (
              <Badge key={r.key} variant={regionFilter === r.key ? "default" : "outline"} className="cursor-pointer" onClick={() => setRegionFilter(r.key)}>{r.label}</Badge>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          {loading && <div className="px-6 py-10 text-sm text-muted-foreground text-center">Searching…</div>}
          {!loading && q.trim().length < 2 && (
            <div className="px-6 py-10 text-sm text-muted-foreground text-center">Type at least 2 characters to start exploring.</div>
          )}
          {!loading && q.trim().length >= 2 && filtered.length === 0 && (
            <div className="px-6 py-10 text-sm text-muted-foreground text-center">No matches for those filters.</div>
          )}
          {filtered.length > 0 && (
            <ul className="divide-y divide-border">
              {filtered.map((h) => (
                <li key={`${h.symbol}-${h.exchange}`} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{h.symbol}</span>
                      <Badge variant="outline" className="text-[10px]">{h.type || "—"}</Badge>
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
          <p>
            Coverage uses Yahoo Finance's universal symbol index. Single-name OTC bonds and many illiquid private instruments are not indexed and may not appear. Data is delayed and provided for informational purposes only — not investment advice.
          </p>
        </div>
        <AiDisclaimerStrip />
      </div>
    </>
  );
}