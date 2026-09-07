import { useState } from "react";
import { Link } from "react-router-dom";
import { Scale, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolios } from "@/hooks/usePortfolios";
import { useToast } from "@/hooks/use-toast";
import { readEdgeError } from "@/lib/edgeError";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  symbol: string;
  name?: string | null;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary";
}

interface FitResult {
  verdict: "diversifying" | "neutral" | "overlapping" | "duplicate";
  empty?: boolean;
  message?: string;
  narrative: string | null;
  aiAvailable: boolean;
  aiReason: string | null;
  metrics: {
    targetWeight: number;
    holdingsCount: number;
    coveredCount: number;
    candidateVolatility: number | null;
    portfolioVolatility: number | null;
    portfolioVolatilityAfter: number | null;
    volatilityDelta: number | null;
    correlationWithPortfolio: number | null;
    mostCorrelated: { symbol: string; correlation: number | null }[];
    leastCorrelated: { symbol: string; correlation: number | null }[];
    hhi: number; hhiAfter: number;
    alreadyHeld: { shares: number; avgPrice: number; weight: number } | null;
    candidateVenue: string;
    venueWeightAfter: number;
    noPriceHistory: boolean;
  };
}

const VERDICT: Record<FitResult["verdict"], { label: string; tone: string; blurb: string }> = {
  diversifying: { label: "Adds diversification", tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", blurb: "It moves differently from what you already own." },
  neutral: { label: "Partly overlapping", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400", blurb: "Some overlap with your book — size it carefully." },
  overlapping: { label: "Largely duplicates your book", tone: "bg-destructive/15 text-destructive", blurb: "It tracks your existing holdings closely, so it adds risk more than diversification." },
  duplicate: { label: "You already hold this", tone: "bg-primary/15 text-primary", blurb: "Adding more increases an existing position." },
};

const pct = (v: number | null | undefined, d = 1) => (v == null || !isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
const nn = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? "—" : v.toFixed(d));

/** "Does this instrument make sense in my portfolio?" — works for any instrument type. */
export const PortfolioFitButton = ({ symbol, name, size = "sm", variant = "outline" }: Props) => {
  const { user } = useAuth();
  const { portfolios, activeId, primaryId } = usePortfolios();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [portfolioId, setPortfolioId] = useState<string>("");
  const [weight, setWeight] = useState("5");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FitResult | null>(null);

  const openDialog = () => {
    setResult(null);
    setPortfolioId(activeId || primaryId || portfolios[0]?.id || "");
    setOpen(true);
  };

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("portfolio-fit", {
        body: { symbol, name, portfolioId: portfolioId || null, weightPct: Number(weight) || 5 },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).reason ?? (data as any).error);
      setResult(data as FitResult);
    } catch (e: any) {
      const info = await readEdgeError(e);
      toast({
        title: info.isEntitlement ? "This check needs a paid plan" : "Couldn't run the check",
        description: info.message,
        variant: info.isEntitlement ? "default" : "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const m = result?.metrics;

  return (
    <>
      <Button size={size} variant={variant} className="gap-1.5" onClick={openDialog}>
        <Scale className="h-4 w-4" /> Does it fit my portfolio?
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Would {symbol} fit your portfolio?</DialogTitle>
            <DialogDescription>
              We compare a year of price behaviour against what you already own: overlap, effect on risk and concentration.
            </DialogDescription>
          </DialogHeader>

          {!user ? (
            <div className="space-y-3 py-2 text-sm">
              <p className="text-muted-foreground">Sign in to compare this instrument with your holdings.</p>
              <Button asChild size="sm"><Link to="/auth">Sign in</Link></Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                {portfolios.length > 1 && (
                  <div className="min-w-[200px] flex-1">
                    <label className="mb-1 block text-xs text-muted-foreground">Portfolio</label>
                    <Select value={portfolioId} onValueChange={setPortfolioId}>
                      <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                      <SelectContent>
                        {portfolios.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="w-32">
                  <label className="mb-1 block text-xs text-muted-foreground">Intended weight %</label>
                  <Input type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
                </div>
                <Button onClick={() => void run()} disabled={loading}>
                  {loading ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Checking…</> : "Run the check"}
                </Button>
              </div>

              {result?.empty ? (
                <p className="text-sm text-muted-foreground">{result.message}</p>
              ) : result && m ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={VERDICT[result.verdict].tone}>{VERDICT[result.verdict].label}</Badge>
                    <span className="text-sm text-muted-foreground">{VERDICT[result.verdict].blurb}</span>
                  </div>

                  {m.noPriceHistory && (
                    <p className="text-xs text-muted-foreground">
                      No usable price history for {symbol} yet, so the correlation figures are unavailable.
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Fact label="Correlation with your book" value={nn(m.correlationWithPortfolio)} />
                    <Fact label="Its yearly swing" value={pct(m.candidateVolatility)} />
                    <Fact label="Portfolio swing now" value={pct(m.portfolioVolatility)} />
                    <Fact
                      label={`After adding ${(m.targetWeight * 100).toFixed(0)}%`}
                      value={pct(m.portfolioVolatilityAfter)}
                      hint={m.volatilityDelta != null ? `${m.volatilityDelta >= 0 ? "+" : ""}${(m.volatilityDelta * 100).toFixed(2)} pts` : undefined}
                    />
                    <Fact label="Concentration now" value={nn(m.hhi)} />
                    <Fact label="Concentration after" value={nn(m.hhiAfter)} />
                    <Fact label={`${m.candidateVenue} exposure after`} value={pct(m.venueWeightAfter)} />
                    <Fact label="Holdings compared" value={`${m.coveredCount} of ${m.holdingsCount}`} />
                  </div>

                  {m.alreadyHeld && (
                    <p className="text-sm text-muted-foreground">
                      You already hold {m.alreadyHeld.shares} at an average of {m.alreadyHeld.avgPrice.toFixed(2)} — about {pct(m.alreadyHeld.weight)} of the portfolio.
                    </p>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">Closest to what you own</div>
                      {m.mostCorrelated.length === 0 ? <p className="text-xs text-muted-foreground">—</p> :
                        m.mostCorrelated.map((r) => (
                          <div key={r.symbol} className="flex justify-between text-sm"><span>{r.symbol}</span><span className="tabular-nums">{nn(r.correlation)}</span></div>
                        ))}
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">Most different from what you own</div>
                      {m.leastCorrelated.length === 0 ? <p className="text-xs text-muted-foreground">—</p> :
                        m.leastCorrelated.map((r) => (
                          <div key={r.symbol} className="flex justify-between text-sm"><span>{r.symbol}</span><span className="tabular-nums">{nn(r.correlation)}</span></div>
                        ))}
                    </div>
                  </div>

                  {result.narrative ? (
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm leading-relaxed">
                      {result.narrative}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {result.aiReason ?? "Written commentary is available on the paid plans."}
                    </p>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    Educational analysis of your own data, not personal investment advice.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

const Fact = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-lg border border-border/60 bg-card/40 p-3">
    <div className="text-[11px] text-muted-foreground">{label}</div>
    <div className="text-sm font-semibold tabular-nums">{value}</div>
    {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
  </div>
);
