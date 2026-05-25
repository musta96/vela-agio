import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { classifyRegime } from "@/lib/riskMetrics";
import type { OHLCBar } from "@/lib/technicalIndicators";

export const MarketRegimeBanner = ({ symbol = "FTSEMIB.MI", label = "FTSE MIB" }) => {
  const [bars, setBars] = useState<OHLCBar[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("market-data", { body: { action: "ohlc", symbol, range: "1y", interval: "1d" } })
      .then(({ data }) => !cancelled && data?.bars && setBars(data.bars));
    return () => { cancelled = true; };
  }, [symbol]);

  if (bars.length < 60) return null;
  const r = classifyRegime(bars);

  const tone =
    r.regime === "strong-trend"
      ? "text-success border-success/30 bg-success/10"
      : r.regime === "trending"
      ? "text-primary border-primary/30 bg-primary/10"
      : r.regime === "ranging"
      ? "text-muted-foreground border-border bg-muted/30"
      : "text-destructive border-destructive/30 bg-destructive/10";

  const advice =
    r.regime === "strong-trend" ? "Trend-following favored — let winners run."
    : r.regime === "trending" ? "Trend setups favored — buy pullbacks, sell rallies."
    : r.regime === "ranging" ? "Mean-reversion preferred — fade extremes."
    : "Choppy — reduce size or stand aside.";

  return (
    <Card className="p-4 mb-6 flex items-center gap-3 flex-wrap">
      <Activity className="h-5 w-5 text-primary" />
      <div>
        <p className="text-xs text-muted-foreground">{label} regime</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="outline" className={tone}>{r.regime.replace("-", " ").toUpperCase()}</Badge>
          <span className="text-xs text-muted-foreground">ADX {r.adx?.toFixed(1) ?? "—"} · σ {r.vol.toFixed(1)}%</span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground ml-auto">{advice}</p>
    </Card>
  );
};

export default MarketRegimeBanner;