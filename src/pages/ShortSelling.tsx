import { useEffect, useMemo, useState } from "react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowDownFromLine, AlertTriangle, TrendingDown, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { usePortfolios } from "@/hooks/usePortfolios";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { supabase } from "@/integrations/supabase/client";
import { SHORT_CANDIDATES } from "@/lib/shorts";
import { ShortPositionRow, type ShortPosition } from "@/components/shorts/ShortPositionManager";
import { AiDisclaimerStrip } from "@/components/AiDisclaimerStrip";

type Trade = { id: string; symbol: string; name: string | null; side: "buy" | "sell"; quantity: number; price: number; currency: string; executed_at: string; notes?: string | null };

export default function ShortSelling() {
  const { portfolios } = usePortfolios();
  const sims = useMemo(() => portfolios.filter((p) => p.is_simulation), [portfolios]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    if (!activeId && sims.length) setActiveId(sims[0].id);
  }, [sims, activeId]);

  useEffect(() => {
    if (!activeId) return;
    (async () => {
      const { data } = await (supabase as any).from("paper_trades").select("*").eq("portfolio_id", activeId).order("executed_at", { ascending: true });
      setTrades((data as Trade[]) || []);
    })();
  }, [activeId]);

  // Derive short positions: net qty negative
  const positions: ShortPosition[] = useMemo(() => {
    const map = new Map<string, ShortPosition & { openedAt: string }>();
    for (const t of trades) {
      const cur = map.get(t.symbol) || { symbol: t.symbol, name: t.name || t.symbol, qty: 0, avgCost: 0, currency: t.currency, openedAt: t.executed_at };
      const signed = t.side === "buy" ? t.quantity : -t.quantity;
      const newQty = cur.qty + signed;
      // Update weighted avg when growing exposure (same sign as trade direction)
      if ((cur.qty <= 0 && signed < 0) || (cur.qty >= 0 && signed > 0)) {
        const totalAbs = Math.abs(cur.qty) + Math.abs(signed);
        cur.avgCost = totalAbs > 0 ? (Math.abs(cur.qty) * cur.avgCost + Math.abs(signed) * t.price) / totalAbs : t.price;
      }
      cur.qty = newQty;
      cur.currency = t.currency;
      cur.name = t.name || cur.name;
      map.set(t.symbol, cur);
    }
    return Array.from(map.values()).filter((p) => p.qty < -1e-9);
  }, [trades]);

  const symbols = useMemo(
    () => Array.from(new Set([...positions.map((p) => p.symbol), ...SHORT_CANDIDATES.map((c) => c.symbol)])),
    [positions],
  );
  const { quotes } = useLiveQuotes(symbols, 60_000);

  return (
    <>
      <SEO title="Short Selling Desk | Vela" description="Screen short candidates, manage short paper positions and generate hedge overlays." path="/short-selling" />
      <div className="px-6 sm:px-8 py-6 max-w-7xl mx-auto space-y-4">
        <PageHeader
          icon={ArrowDownFromLine}
          title="Short Selling Desk"
          description="Illustrative short-candidate universe, active paper shorts with borrow/margin, and hedge overlays. Simulation only."
        />

        <Alert className="border-destructive/40 bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-xs">
            <strong>Educational surface.</strong> Short interest, borrow rates and hedge ideas are illustrative estimates — not a real short-locate feed. Live shorting exposes you to unlimited loss, forced buy-ins, dividend obligations and variable borrow fees.
          </AlertDescription>
        </Alert>

        <Card className="p-3 flex flex-wrap items-center gap-3">
          <Label className="text-xs">Paper portfolio</Label>
          <Select value={activeId || ""} onValueChange={setActiveId}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select a simulation" /></SelectTrigger>
            <SelectContent>
              {sims.map((p) => <SelectItem key={p.id} value={p.id}>🧪 {p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button asChild variant="outline" size="sm">
            <Link to="/trading?tab=paper">Open paper ticket <ExternalLink className="h-3 w-3 ml-1" /></Link>
          </Button>
        </Card>

        {/* My short positions */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive" /> My short positions ({positions.length})
          </h2>
          {positions.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground text-center">
              No open short positions in this simulation. Use the paper-trading ticket with side <em>SHORT</em>.
            </Card>
          ) : (
            <div className="space-y-3">
              {positions.map((p) => (
                <ShortPositionRow
                  key={p.symbol}
                  portfolioId={activeId!}
                  pos={p}
                  lastPrice={quotes[p.symbol]?.price || 0}
                />
              ))}
            </div>
          )}
        </section>

        {/* Candidates */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Short candidate universe</h2>
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2">Symbol</th>
                    <th className="text-left">Thesis</th>
                    <th className="text-right">Short int.</th>
                    <th className="text-right">Days to cover</th>
                    <th className="text-right">Borrow APR</th>
                    <th className="text-center">Locate</th>
                    <th className="text-right px-3">Last</th>
                  </tr>
                </thead>
                <tbody>
                  {SHORT_CANDIDATES.map((c) => {
                    const last = quotes[c.symbol]?.price;
                    return (
                      <tr key={c.symbol} className="border-t border-border/50 hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <div className="font-semibold">{c.symbol}</div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{c.name}</div>
                        </td>
                        <td className="text-xs text-muted-foreground max-w-[320px]">{c.thesis}</td>
                        <td className="text-right tabular-nums">{c.shortInterestPct.toFixed(1)}%</td>
                        <td className="text-right tabular-nums">{c.daysToCover.toFixed(1)}</td>
                        <td className="text-right tabular-nums">{(c.borrow.rate * 100).toFixed(2)}%</td>
                        <td className="text-center">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              c.borrow.difficulty === "easy"
                                ? "border-success/50 text-success"
                                : c.borrow.difficulty === "moderate"
                                ? "border-amber-500/50 text-amber-500"
                                : "border-destructive/50 text-destructive"
                            }`}
                          >
                            {c.borrow.difficulty}
                          </Badge>
                        </td>
                        <td className="text-right px-3 tabular-nums text-xs">
                          {last ? `$${last.toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        <AiDisclaimerStrip />
      </div>
    </>
  );
}