import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props { symbol: string; }
interface HotStrike {
  strike: number; kind: "call" | "put"; volume: number; openInterest: number;
  vOverOI: number; classification: "sweep-like" | "block-like" | "normal";
}
interface Snapshot {
  symbol: string; expiration: number | null;
  putCallRatio: number; callVolume: number; putVolume: number; callOI: number; putOI: number;
  bias: "bullish" | "bearish" | "neutral";
  hotStrikes: HotStrike[];
  fetchedAt: number;
  error?: string;
}

export function OptionsFlowCard({ symbol }: Props) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("flow-snapshot", { body: { symbol } });
      if (error) throw error;
      if ((data as any)?.error) setError((data as any).error);
      else setSnap(data as Snapshot);
    } catch (e: any) {
      setError(e?.message ?? "flow_unavailable");
    } finally { setLoading(false); }
  };

  useEffect(() => { setSnap(null); load(); /* eslint-disable-next-line */ }, [symbol]);

  const biasBg = snap?.bias === "bullish" ? "text-success" : snap?.bias === "bearish" ? "text-destructive" : "text-muted-foreground";

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Options flow snapshot</h3>
        </div>
        <div className="flex items-center gap-2">
          {snap && <Badge variant="outline" className={`uppercase ${biasBg}`}>
            {snap.bias === "bullish" ? <TrendingUp className="h-3 w-3 mr-1 inline" /> : snap.bias === "bearish" ? <TrendingDown className="h-3 w-3 mr-1 inline" /> : null}
            {snap.bias}
          </Badge>}
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> refresh
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-muted-foreground">Options data not available for {symbol}. This is expected for some non-US instruments.</p>}
      {!error && snap && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
            <div className="p-2 rounded border border-border">
              <p className="text-muted-foreground">Put/Call ratio</p>
              <p className="font-semibold text-base">{snap.putCallRatio.toFixed(2)}</p>
            </div>
            <div className="p-2 rounded border border-success/30 bg-success/5">
              <p className="text-muted-foreground">Call vol / OI</p>
              <p className="font-semibold">{snap.callVolume.toLocaleString()} / {snap.callOI.toLocaleString()}</p>
            </div>
            <div className="p-2 rounded border border-destructive/30 bg-destructive/5">
              <p className="text-muted-foreground">Put vol / OI</p>
              <p className="font-semibold">{snap.putVolume.toLocaleString()} / {snap.putOI.toLocaleString()}</p>
            </div>
            <div className="p-2 rounded border border-border">
              <p className="text-muted-foreground">Expiration</p>
              <p className="font-semibold">{snap.expiration ? new Date(snap.expiration).toLocaleDateString() : "—"}</p>
            </div>
          </div>

          <p className="text-xs uppercase text-muted-foreground mb-2">Unusual strikes</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {snap.hotStrikes.slice(0, 8).map((s, i) => (
              <div key={i} className={`p-2 rounded border text-xs flex items-center justify-between ${
                s.classification === "sweep-like" ? "border-primary/40 bg-primary/5" :
                s.classification === "block-like" ? "border-warning/40 bg-warning/5" :
                "border-border"
              }`}>
                <span>
                  <Badge variant="outline" className={`mr-2 text-[10px] ${s.kind === "call" ? "text-success" : "text-destructive"}`}>{s.kind.toUpperCase()}</Badge>
                  ${s.strike.toFixed(2)} · vol {s.volume.toLocaleString()} / OI {s.openInterest.toLocaleString()}
                </span>
                <Badge variant="secondary" className="text-[10px] uppercase">{s.classification}</Badge>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Sweep-like = vol &gt; 2× OI (aggressive buyer). Block-like = large volume vs OI change consistent with a single-print block trade.
          </p>
        </>
      )}
    </Card>
  );
}