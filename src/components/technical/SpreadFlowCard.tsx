import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftRight, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Bar } from "@/lib/ta/types";
import { computeOrderFlow } from "@/lib/flow/orderFlow";

interface Props { symbol: string; bars: Bar[]; }
interface Quote { bid?: number; ask?: number; last?: number; }

export function SpreadFlowCard({ symbol, bars }: Props) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const { data, error } = await supabase.functions.invoke("flow-snapshot", { body: { symbol } });
        if (error) throw error;
        if (cancel) return;
        const q = (data as any)?.quote ?? data;
        setQuote({
          bid: q?.bid ?? q?.regularMarketBid,
          ask: q?.ask ?? q?.regularMarketAsk,
          last: q?.last ?? q?.regularMarketPrice,
        });
      } catch (e: any) { if (!cancel) setError(e?.message ?? "quote_unavailable"); }
      finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [symbol]);

  const flow = useMemo(() => computeOrderFlow(bars.slice(-60)), [bars]);
  const spreadBps = quote?.bid && quote?.ask && quote.ask > 0
    ? ((quote.ask - quote.bid) / ((quote.ask + quote.bid) / 2)) * 10000
    : null;

  // Sweep-activity proxy = magnitude of the last few bars' signed delta.
  const sweepActivity = useMemo(() => {
    const last = flow.points.slice(-10);
    if (!last.length) return 0;
    return last.reduce((s, p) => s + Math.abs(p.delta), 0) / last.length;
  }, [flow]);

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center gap-2 mb-3">
        <ArrowLeftRight className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Bid/ask spread & sweep activity</h3>
        {loading && <Badge variant="outline" className="text-[10px] ml-auto">Loading…</Badge>}
        {error && <Badge variant="destructive" className="text-[10px] ml-auto">{error}</Badge>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Kpi label="Bid" value={quote?.bid?.toFixed(2) ?? "—"} />
        <Kpi label="Ask" value={quote?.ask?.toFixed(2) ?? "—"} />
        <Kpi label="Spread" value={spreadBps != null ? `${spreadBps.toFixed(1)} bps` : "—"} />
        <Kpi label="Bias" value={flow.bias} tone={flow.bias === "bullish" ? "success" : flow.bias === "bearish" ? "destructive" : "muted"} />
      </div>

      {quote?.bid && quote?.ask && (
        <div className="mt-4">
          <p className="text-[11px] text-muted-foreground mb-1">Book snapshot</p>
          <div className="relative h-8 rounded overflow-hidden border border-border flex">
            <div className="flex-1 bg-success/20 flex items-center justify-end pr-2 text-[11px] font-semibold text-success">{quote.bid.toFixed(2)}</div>
            <div className="w-px bg-border" />
            <div className="flex-1 bg-destructive/20 flex items-center pl-2 text-[11px] font-semibold text-destructive">{quote.ask.toFixed(2)}</div>
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <p className="text-[11px] text-muted-foreground">Sweep activity — buy vs sell pressure (last 60 bars)</p>
        </div>
        <div className="relative h-3 rounded overflow-hidden border border-border bg-muted/30">
          <div className="absolute inset-y-0 left-0 bg-success" style={{ width: `${flow.buyPct}%` }} />
          <div className="absolute inset-y-0 right-0 bg-destructive" style={{ width: `${flow.sellPct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] mt-1">
          <span className="text-success">Buy {flow.buyPct.toFixed(0)}%</span>
          <span className="text-muted-foreground">Avg |Δ| {sweepActivity.toFixed(0)}</span>
          <span className="text-destructive">Sell {flow.sellPct.toFixed(0)}%</span>
        </div>
        {flow.divergence && (
          <p className="text-[11px] mt-2">
            <Badge variant="outline" className={flow.divergence === "bullish" ? "border-success/40 text-success" : "border-destructive/40 text-destructive"}>
              {flow.divergence} divergence
            </Badge>
            <span className="text-muted-foreground ml-2">Price and cumulative delta disagree — sweep may be trapping traders.</span>
          </p>
        )}
      </div>
    </Card>
  );
}

function Kpi({ label, value, tone = "muted" }: { label: string; value: string; tone?: "success" | "destructive" | "muted" }) {
  const cls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="p-2 rounded border border-border">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${cls}`}>{value}</p>
    </div>
  );
}