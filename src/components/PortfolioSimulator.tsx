import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { runMonteCarlo, type MCResult } from "@/lib/monteCarlo";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { FlaskConical, Sparkles, RefreshCw } from "lucide-react";

interface Holding { symbol: string; shares: number; currentPrice: number; currency: string; }

interface Props {
  open: boolean;
  onClose: () => void;
  portfolioId: string;
  portfolioName: string;
  baseCurrency: string;
  holdings: Holding[];
  fxToBase: Record<string, number>;
}

export const PortfolioSimulator = ({ open, onClose, portfolioId, portfolioName, baseCurrency, holdings, fxToBase }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [horizon, setHorizon] = useState("252"); // 1 trading year
  const [runs, setRuns] = useState("500");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MCResult | null>(null);

  const sym = baseCurrency === "USD" ? "$" : baseCurrency === "GBP" ? "£" : baseCurrency === "EUR" ? "€" : baseCurrency + " ";

  const run = async () => {
    if (holdings.length === 0) {
      toast({ title: "No holdings", description: "Add positions before running a simulation.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // Fetch 1y daily bars for each symbol
      const history: Record<string, { t: number; close: number }[]> = {};
      await Promise.all(holdings.map(async (h) => {
        try {
          const { data } = await supabase.functions.invoke("market-data", {
            body: { action: "ohlc", symbol: h.symbol, range: "1y", interval: "1d" },
          });
          if (data?.bars) history[h.symbol] = data.bars;
        } catch { /* ignore */ }
      }));

      const horizonDays = Math.max(5, Math.min(1260, parseInt(horizon) || 252));
      const nRuns = Math.max(50, Math.min(5000, parseInt(runs) || 500));

      const res = runMonteCarlo({ holdings, fxToBase, history, horizonDays, runs: nRuns });
      setResult(res);

      // Persist
      if (user) {
        await (supabase as any).from("portfolio_simulations").insert({
          user_id: user.id,
          portfolio_id: portfolioId,
          name: `MC ${new Date().toLocaleString()}`,
          kind: "monte_carlo",
          params: { horizonDays, runs: nRuns, baseCurrency },
          results: {
            initialValue: res.initialValue,
            expected: res.expected,
            probLoss: res.probLoss,
            percentiles: res.percentiles,
          },
        });
      }
    } catch (e: any) {
      toast({ title: "Simulation failed", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const chartData = useMemo(() => {
    if (!result?.pathsSample?.length) return [];
    const len = result.pathsSample[0].length;
    return Array.from({ length: len }, (_, i) => {
      const row: any = { day: i + 1 };
      result.pathsSample.forEach((path, idx) => { row[`p${idx}`] = path[i]; });
      return row;
    });
  }, [result]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5 text-primary" /> Monte-Carlo simulation - {portfolioName}</DialogTitle>
          <DialogDescription>
            Simulates thousands of possible future paths using historical drift &amp; volatility (geometric Brownian motion). Results in {baseCurrency}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>Horizon (trading days)</Label>
            <Input type="number" value={horizon} onChange={(e) => setHorizon(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">252 ≈ 1 year</p>
          </div>
          <div>
            <Label>Simulation runs</Label>
            <Input type="number" value={runs} onChange={(e) => setRuns(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">More runs = smoother distribution</p>
          </div>
          <div className="flex items-end">
            <Button onClick={run} disabled={loading} className="w-full gap-2">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Simulating…" : "Run simulation"}
            </Button>
          </div>
        </div>

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Today</p>
                <p className="text-xl font-bold">{sym}{result.initialValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Expected (mean)</p>
                <p className="text-xl font-bold">{sym}{result.expected.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Median (P50)</p>
                <p className="text-xl font-bold">{sym}{result.percentiles.p50.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Prob. of loss</p>
                <p className="text-xl font-bold">{(result.probLoss * 100).toFixed(1)}%</p>
              </Card>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
              {[
                ["P05 (worst 5%)", result.percentiles.p05, "destructive"],
                ["P25", result.percentiles.p25, ""],
                ["P50", result.percentiles.p50, ""],
                ["P75", result.percentiles.p75, ""],
                ["P95 (best 5%)", result.percentiles.p95, "success"],
              ].map(([label, val, tone]) => (
                <Card key={label as string} className="p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">{label as string}</p>
                  <p className={`font-mono font-semibold ${tone === "destructive" ? "text-destructive" : tone === "success" ? "text-success" : ""}`}>
                    {sym}{(val as number).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </Card>
              ))}
            </div>

            <Card className="p-3">
              <p className="text-sm font-medium mb-2">Sample simulated paths</p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => `${sym}${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: any) => [`${sym}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, "Value"]}
                    labelFormatter={(d) => `Day ${d}`} />
                  <ReferenceLine y={result.initialValue} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                  {result.pathsSample.map((_, idx) => (
                    <Line key={idx} type="monotone" dataKey={`p${idx}`} stroke="hsl(var(--primary))" strokeOpacity={0.15} dot={false} strokeWidth={1} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">
                Each line is one simulated future. Dashed line = today's value.
              </p>
            </Card>

            <Badge variant="outline" className="text-xs">
              Saved to your simulation history
            </Badge>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
