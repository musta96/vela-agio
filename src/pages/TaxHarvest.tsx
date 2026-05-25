import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { Receipt } from "lucide-react";

export default function TaxHarvest() {
  const { user } = useAuth();
  const [holdings, setHoldings] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("portfolio_holdings").select("*").eq("user_id", user.id).then(({ data }) => setHoldings(data ?? []));
  }, [user]);

  const symbols = holdings.map(h => h.symbol);
  const { quotes } = useLiveQuotes(symbols, 60_000);

  const candidates = holdings.map(h => {
    const q = quotes[h.symbol];
    if (!q) return null;
    const cost = h.shares * h.avg_price; const mkt = h.shares * q.price;
    const pnl = mkt - cost; const pnlPct = cost ? (pnl / cost) * 100 : 0;
    return { ...h, price: q.price, cost, mkt, pnl, pnlPct };
  }).filter(Boolean).sort((a: any, b: any) => a.pnl - b.pnl);

  const losers = candidates.filter((x: any) => x.pnl < 0);
  const totalLoss = losers.reduce((s: number, x: any) => s + x.pnl, 0);
  const taxBenefit = -totalLoss * 0.26; // Italian capital gains

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Tax-Loss Harvesting | FTSE MIB Analytics" description="Realise losses to offset capital gains" path="/tax-harvest" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><Receipt className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Tax-Loss Harvesting</h1></div>
        <Card><CardContent className="p-6 grid md:grid-cols-3 gap-4">
          <div><div className="text-sm text-muted-foreground">Unrealised losses</div><div className="text-2xl font-mono text-bear">€{totalLoss.toFixed(0)}</div></div>
          <div><div className="text-sm text-muted-foreground">Estimated tax benefit (26% IT)</div><div className="text-2xl font-mono text-bull">€{taxBenefit.toFixed(0)}</div></div>
          <div><div className="text-sm text-muted-foreground">Eligible positions</div><div className="text-2xl font-mono">{losers.length}</div></div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Harvest candidates</CardTitle></CardHeader><CardContent className="space-y-2">
          {losers.map((x: any) => (
            <div key={x.symbol} className="flex items-center justify-between border-b pb-2">
              <div><div className="font-semibold">{x.symbol}</div><div className="text-xs text-muted-foreground">{x.name}</div></div>
              <div className="flex items-center gap-4 text-sm font-mono">
                <span>Cost €{x.cost.toFixed(0)}</span>
                <span>Mkt €{x.mkt.toFixed(0)}</span>
                <Badge variant="destructive">{x.pnlPct.toFixed(1)}%</Badge>
              </div>
            </div>
          ))}
          {!losers.length && <p className="text-muted-foreground">No losing positions detected.</p>}
        </CardContent></Card>
        <p className="text-xs text-muted-foreground">Heuristic only. Watch the 30-day wash-sale equivalent and Italian "minusvalenze" 4-year window. This is not financial advice.</p>
      </main>
    </div>
  );
}