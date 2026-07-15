import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, AlertTriangle, TrendingUp, TrendingDown, Minus, RefreshCw, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { FullAnalysis } from "@/lib/ta";

interface Props {
  symbol: string;
  name?: string;
  timeframe: string;
  lastBarTs: number;
  lastPrice: number;
  analysis: FullAnalysis;
}

export function AITradeThesisCard({ symbol, name, timeframe, lastBarTs, lastPrice, analysis }: Props) {
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const run = async (force = false) => {
    setLoading(true); setError(null);
    try {
      // Trim the analysis payload to keep tokens reasonable.
      const trimmed = {
        candlestickPatterns: analysis.candlestickPatterns.slice(-8),
        supportResistance: analysis.supportResistance,
        trendlines: analysis.trendlines,
        fvgs: analysis.fvgs.slice(-8),
        orderBlocks: analysis.orderBlocks.slice(-6),
        liquidityGrabs: analysis.liquidityGrabs.slice(-6),
        supplyDemand: analysis.supplyDemand.slice(-6),
        chartPatterns: analysis.chartPatterns,
        structure: analysis.structure.slice(-6),
        insights: analysis.insights,
      };
      const { data, error } = await supabase.functions.invoke("technical-analysis-brief", {
        body: {
          symbol, name, timeframe,
          lastBarTs, lastPrice,
          analysis: trimmed,
          focus: focus.trim() || undefined,
          force,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setResult(data?.thesis ?? null);
      setCached(!!data?.cached);
    } catch (e: any) {
      setError(e?.message || "AI thesis failed");
    } finally {
      setLoading(false);
    }
  };

  const biasIcon = (b: string) => b === "bullish"
    ? <TrendingUp className="h-4 w-4 text-success" />
    : b === "bearish"
    ? <TrendingDown className="h-4 w-4 text-destructive" />
    : <Minus className="h-4 w-4 text-muted-foreground" />;

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">AI trade thesis</h3>
        {cached && result && <Badge variant="outline" className="gap-1"><Zap className="h-3 w-3" /> Cached</Badge>}
        <div className="ml-auto">
          {result && (
            <Button size="sm" variant="ghost" onClick={() => run(true)} disabled={loading}>
              <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
            </Button>
          )}
        </div>
      </div>

      {!result && !loading && (
        <div className="space-y-3">
          <Input
            placeholder="Optional focus (e.g. swing entry, risk of trend break, options-friendly)"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
          />
          <Button onClick={() => run(false)} className="w-full">
            <Sparkles className="h-4 w-4 mr-2" /> Generate AI trade thesis
          </Button>
          <p className="text-xs text-muted-foreground">
            The AI reads the detected patterns, structure and indicators and drafts a portfolio-manager style thesis with entry, stop, target and invalidation. Repeat runs on the same bar are served from cache.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Analyzing detected patterns and drafting thesis…</p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="capitalize flex items-center gap-1">{biasIcon(result.bias)} {result.bias}</Badge>
            {result.conviction && <Badge variant="outline" className="capitalize">Conviction: {result.conviction}</Badge>}
            {result.entryPlan?.rr != null && <Badge variant="secondary">R:R {Number(result.entryPlan.rr).toFixed(2)}</Badge>}
          </div>
          {result.headline && <h4 className="text-base font-semibold">{result.headline}</h4>}
          {result.thesis && <p className="text-sm leading-relaxed whitespace-pre-line">{result.thesis}</p>}

          {result.entryPlan && (
            <div className="grid grid-cols-3 gap-3">
              {["entry", "stop", "target"].map((k) => (
                <div key={k} className="p-2 rounded-md border border-border/60">
                  <p className="text-[10px] text-muted-foreground uppercase">{k}</p>
                  <p className="text-sm font-mono font-semibold">{result.entryPlan?.[k] ?? "—"}</p>
                </div>
              ))}
            </div>
          )}

          {Array.isArray(result.keyLevels) && result.keyLevels.length > 0 && (
            <div>
              <h5 className="text-sm font-semibold mb-1">Key levels</h5>
              <div className="flex flex-wrap gap-2">
                {result.keyLevels.map((l: any, i: number) => (
                  <Badge key={i} variant="outline" className="capitalize">
                    {l.role}: {l.label} @ {l.price}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(result.signals) && result.signals.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-sm font-semibold">Signals in play</h5>
              {result.signals.map((s: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {biasIcon(s.bias)}
                  <div><span className="font-medium">{s.name}:</span> <span className="text-muted-foreground">{s.detail}</span></div>
                </div>
              ))}
            </div>
          )}

          {result.invalidation && (
            <div className="flex items-start gap-2 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div><span className="font-medium">Invalidation:</span> {result.invalidation}</div>
            </div>
          )}

          {Array.isArray(result.risks) && result.risks.length > 0 && (
            <div>
              <h5 className="text-sm font-semibold mb-1">Risks</h5>
              <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
                {result.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
          {Array.isArray(result.confirmations) && result.confirmations.length > 0 && (
            <div>
              <h5 className="text-sm font-semibold mb-1">Confirmations to watch</h5>
              <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
                {result.confirmations.map((c: string, i: number) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}