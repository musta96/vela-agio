import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FlaskConical, ArrowRight, Sparkles } from "lucide-react";
import { StrategyBuilderCard } from "@/components/technical/StrategyBuilderCard";
import type { Condition, RiskConfig } from "@/lib/ta/strategyTypes";

interface Preset {
  id: string; slug: string; name: string; description: string | null;
  family: string; timeframe: string | null;
  entry_rules: Condition[]; exit_rules: Condition[]; risk_config: RiskConfig;
  tags: string[];
}

const FAMILY_LABEL: Record<string, string> = {
  smc: "SMC · liquidity", trend: "Algorithmic trend", news: "News-driven",
  volatility: "Volatility", fib: "Fibonacci", flow: "Order / AVWAP flow", pattern: "Chart pattern",
};

const FAMILY_STYLE: Record<string, string> = {
  smc: "border-primary/40 bg-primary/5",
  trend: "border-success/40 bg-success/5",
  news: "border-warning/40 bg-warning/5",
  volatility: "border-destructive/40 bg-destructive/5",
  fib: "border-accent-foreground/40 bg-accent/40",
  flow: "border-primary/40 bg-primary/5",
  pattern: "border-muted-foreground/40 bg-muted/40",
};

const StrategyLab = () => {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selected, setSelected] = useState<Preset | null>(null);
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState("1d");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).from("strategy_presets")
        .select("*")
        .order("family", { ascending: true });
      if (error) toast({ title: "Could not load presets", description: error.message, variant: "destructive" });
      else setPresets((data as Preset[]) ?? []);
      setLoading(false);
    })();
  }, [toast]);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Strategy Lab — Backtest complete trading plans" description="Turn liquidity sweeps, EMA-stack trends, news drift, volatility breakouts and Fibonacci zones into fully-defined trading plans, then backtest, walk-forward test, and compare versions." path="/strategy-lab" />
      <TopNav />
      <main>
        <section className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="mb-6">
            <h1 className="text-3xl sm:text-4xl font-bold mb-2 flex items-center gap-3">
              <FlaskConical className="h-8 w-8 text-primary" />
              Strategy Lab
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base max-w-3xl">
              Assemble a complete trading plan from proven presets — Smart Money Concepts, EMA-stack trends, news-drift, volatility breakouts, Fibonacci pullbacks, or AVWAP reclaims — then validate, backtest, walk-forward, and export the plan as PDF/JSON.
            </p>
          </div>

          <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div>
                <Label className="text-xs">Symbol</Label>
                <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="e.g. AAPL, ENEL.MI, BTC-USD" />
              </div>
              <div>
                <Label className="text-xs">Timeframe</Label>
                <Input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="e.g. 1d, 1h" />
              </div>
              <div className="flex items-end">
                <Button asChild variant="outline" size="sm">
                  <Link to="/backtest">Open full backtest page <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase text-muted-foreground">Preset library</h2>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading presets…</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected(p)}
                    className={`text-left p-3 rounded border transition-all ${FAMILY_STYLE[p.family] ?? "border-border"} ${selected?.id === p.id ? "ring-2 ring-primary" : ""}`}
                  >
                    <p className="text-[10px] uppercase text-muted-foreground">{FAMILY_LABEL[p.family] ?? p.family}</p>
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.tags.slice(0, 3).map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <p className="mt-3 text-xs p-2 rounded border border-primary/30 bg-primary/5">
                <span className="font-semibold">Selected preset:</span> {selected.name}. The builder below is pre-populated — tweak thresholds and hit <em>Preview backtest</em> or save to your library.
              </p>
            )}
          </Card>

          <StrategyBuilderCard
            key={selected?.id ?? "default"}
            symbol={symbol}
            timeframe={timeframe}
            presetName={selected?.name}
            presetEntry={selected?.entry_rules}
            presetExit={selected?.exit_rules}
            presetRisk={selected?.risk_config}
          />
        </section>
      </main>
    </div>
  );
};

export default StrategyLab;