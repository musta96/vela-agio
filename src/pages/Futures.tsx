import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingDown, TrendingUp, AlertTriangle, LineChart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface FuturesRow {
  symbol: string;
  label: string;
  category: string;
  exchange: string;
  contractSize: string;
  tickSize: string;
  currency: string;
  hedgeUseCase: string;
  price: number | null;
  changePct: number | null;
  previousClose: number | null;
  updatedAt: number | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  energy: "Energy", metals: "Metals", agri: "Agriculture", index: "Indices", rates: "Rates", fx: "FX",
};

export default function Futures() {
  const [rows, setRows] = useState<FuturesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("all");

  useEffect(() => {
    supabase.functions.invoke<{ contracts: FuturesRow[] }>("futures-quotes", { body: {} })
      .then(({ data, error: e }) => {
        if (e || !data) throw new Error(e?.message ?? "futures fetch failed");
        setRows(data.contracts);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = category === "all" ? rows : rows.filter((r) => r.category === category);

  return (
    <div className="px-6 sm:px-8 py-6 max-w-7xl mx-auto space-y-4">
      <SEO
        title="Futures viewer — Commodities, indices & rate hedges"
        description="Live quotes for major commodity, index, rate and FX continuous futures with contract specs and typical hedge use-cases."
        path="/futures"
      />
      <PageHeader icon={BarChart3} title="Futures viewer" description="Live quotes for major commodity, index, rate and FX continuous futures with contract specs and typical hedge use-cases." />

      <div className="flex flex-wrap gap-1.5">
        {["all", "energy", "metals", "agri", "index", "rates", "fx"].map((k) => (
          <Badge
            key={k}
            variant={category === k ? "default" : "outline"}
            className="cursor-pointer capitalize"
            onClick={() => setCategory(k)}
          >
            {k === "all" ? "All" : CATEGORY_LABEL[k]}
          </Badge>
        ))}
      </div>

      {loading && (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      )}
      {error && !loading && (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
      )}

      {!loading && !error && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Contract</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">Exchange</th>
                <th className="text-right px-3 py-2">Last</th>
                <th className="text-right px-3 py-2">Change</th>
                <th className="text-left px-3 py-2 hidden lg:table-cell">Contract size</th>
                <th className="text-left px-3 py-2 hidden lg:table-cell">Tick</th>
                <th className="text-left px-3 py-2">Typical hedge</th>
                <th className="text-right px-3 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const up = (c.changePct ?? 0) >= 0;
                return (
                  <tr key={c.symbol} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{c.label}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{c.symbol} · {CATEGORY_LABEL[c.category]}</div>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-xs">{c.exchange}</td>
                    <td className="px-3 py-2 text-right font-mono">{c.price != null ? c.price.toFixed(2) : "—"}</td>
                    <td className={`px-3 py-2 text-right font-mono ${up ? "text-success" : "text-destructive"}`}>
                      {c.changePct != null ? (
                        <span className="inline-flex items-center gap-1 justify-end">
                          {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {up ? "+" : ""}{c.changePct.toFixed(2)}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell text-xs">{c.contractSize}</td>
                    <td className="px-3 py-2 hidden lg:table-cell text-xs">{c.tickSize}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.hedgeUseCase}</td>
                    <td className="px-3 py-2 text-right">
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                        <Link to={`/technical?symbol=${encodeURIComponent(c.symbol)}`}><LineChart className="h-3.5 w-3.5" /></Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Continuous futures ("=F") are stitched front-month contracts — useful for charts and hedge sizing, not for exact expiry P&L. For actual hedging, roll to a specific expiry contract with your broker.
        </AlertDescription>
      </Alert>
    </div>
  );
}