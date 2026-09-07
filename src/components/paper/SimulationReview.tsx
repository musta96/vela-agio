import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Activity, ArrowLeftRight, Loader2, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { readEdgeError } from "@/lib/edgeError";
import { PortfolioInsights } from "@/components/PortfolioInsights";

export interface ReviewPosition {
  symbol: string;
  name: string;
  qty: number;
  avgCost: number;
  last: number;
  currency: string;
}

interface Props {
  positions: ReviewPosition[];
  cash: number;
  currency: string;
}

interface SimOut {
  cagrMedian: number;
  cvar95: number;
  maxDrawdownP95: number;
  probLoss: number;
  medianValue: number;
}
interface DoctorOut {
  concerns?: string[];
  strengths?: string[];
  proposed_trades?: string[];
}
interface SwapOut {
  symbol: string;
  ideas: Array<{ symbol: string; name?: string; reason?: string }>;
}

/**
 * Turns the paper book into an analysable strategy: Monte Carlo projection of
 * the current weights, a quantitative risk/diversification read, an AI review
 * with concrete trade proposals, and per-holding swap candidates.
 */
export function SimulationReview({ positions, cash, currency }: Props) {
  const [years, setYears] = useState("10");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sim, setSim] = useState<SimOut | null>(null);
  const [doctor, setDoctor] = useState<DoctorOut | null>(null);
  const [doctorNote, setDoctorNote] = useState<string | null>(null);
  const [swaps, setSwaps] = useState<SwapOut[]>([]);
  const [swapNote, setSwapNote] = useState<string | null>(null);

  const invested = positions.reduce((s, p) => s + p.last * p.qty, 0);
  const equity = invested + cash;

  const weights = useMemo(() => {
    if (invested <= 0) return [] as Array<{ symbol: string; weight: number }>;
    return positions
      .filter((p) => p.last > 0 && p.qty !== 0)
      .map((p) => ({ symbol: p.symbol, weight: (p.last * p.qty) / invested }));
  }, [positions, invested]);

  const holdings = useMemo(
    () => positions.map((p) => ({ symbol: p.symbol, shares: p.qty, avgPrice: p.avgCost, currentPrice: p.last, currency: p.currency })),
    [positions],
  );

  async function runAll() {
    if (weights.length === 0) return;
    setRunning(true);
    setError(null);
    setDoctorNote(null);
    setSwapNote(null);

    // 1. Monte Carlo on the current weights (no AI required).
    try {
      const { data, error: e } = await supabase.functions.invoke("advanced-simulation", {
        body: {
          mode: "single",
          assets: weights,
          config: { years: Math.min(30, Math.max(1, Number(years) || 10)), initial: Math.round(equity) || 100000, paths: 8000, history: "10y" },
        },
      });
      if (e) throw e;
      const r = data?.result;
      if (r) setSim({ cagrMedian: r.cagrMedian, cvar95: r.cvar95, maxDrawdownP95: r.maxDrawdownP95, probLoss: r.probLoss, medianValue: r.medianValue });
      else setError(data?.error || "The projection could not be built for these instruments.");
    } catch (err) {
      const info = await readEdgeError(err);
      setError(info.message);
    }

    // 2. AI review with concrete trade proposals (needs AI access).
    try {
      const { data, error: e } = await supabase.functions.invoke("portfolio-doctor", {
        body: {
          portfolio: { cash, currency, equity, holdings: positions.map((p) => ({ symbol: p.symbol, name: p.name, qty: p.qty, price: p.last, value: p.last * p.qty, weightPct: invested ? +((p.last * p.qty / invested) * 100).toFixed(2) : 0 })) },
          risk: { investedPct: equity ? +((invested / equity) * 100).toFixed(1) : 0, positions: positions.length },
        },
      });
      if (e) throw e;
      setDoctor(data || null);
    } catch (err) {
      const info = await readEdgeError(err);
      setDoctorNote(info.message);
    }

    // 3. Swap candidates for the three largest holdings.
    const top = [...positions].sort((a, b) => b.last * b.qty - a.last * a.qty).slice(0, 3);
    const found: SwapOut[] = [];
    for (const p of top) {
      try {
        const { data, error: e } = await supabase.functions.invoke("related-instruments", { body: { symbol: p.symbol } });
        if (e) throw e;
        const groups = data?.groups || {};
        const ideas = [...(groups.thematic || []), ...(groups.sector_etf || []), ...(groups.peers || [])].slice(0, 5);
        if (ideas.length) found.push({ symbol: p.symbol, ideas });
      } catch (err) {
        const info = await readEdgeError(err);
        setSwapNote(info.message);
        break;
      }
    }
    setSwaps(found);
    setRunning(false);
  }

  return (
    <Card className="p-4 mt-4">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4" /> Does this strategy make sense?</h3>
          <p className="text-xs text-muted-foreground">Project the current mix forward, check its risk, and get swap ideas.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Horizon (years)</Label>
            <Input type="number" min="1" max="30" value={years} onChange={(e) => setYears(e.target.value)} className="w-24" />
          </div>
          <Button onClick={runAll} disabled={running || weights.length === 0}>
            {running ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Running…</> : "Run analysis"}
          </Button>
        </div>
      </div>

      {weights.length === 0 && (
        <p className="text-xs text-muted-foreground">Add at least one position with a live price to analyse this simulation.</p>
      )}

      {error && (
        <Alert className="mb-3 border-destructive/40 bg-destructive/5"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>
      )}

      {sim && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Median growth p.a.</div><div className="text-xl font-bold tabular-nums">{sim.cagrMedian}%</div></Card>
          <Card className="p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Bad-case loss (CVaR 95)</div><div className="text-xl font-bold tabular-nums text-destructive">{sim.cvar95}%</div></Card>
          <Card className="p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Worst drop (p95)</div><div className="text-xl font-bold tabular-nums">{sim.maxDrawdownP95}%</div></Card>
          <Card className="p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Chance of losing money</div><div className="text-xl font-bold tabular-nums">{sim.probLoss}%</div></Card>
        </div>
      )}

      {doctorNote && <Alert className="mb-3"><AlertDescription className="text-xs">{doctorNote}</AlertDescription></Alert>}

      {doctor && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Card className="p-3">
            <div className="text-xs font-semibold mb-1 flex items-center gap-1"><Stethoscope className="h-3.5 w-3.5" /> Concerns</div>
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">{(doctor.concerns || []).map((c, i) => <li key={i}>{c}</li>)}</ul>
          </Card>
          <Card className="p-3">
            <div className="text-xs font-semibold mb-1">Strengths</div>
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">{(doctor.strengths || []).map((c, i) => <li key={i}>{c}</li>)}</ul>
          </Card>
          <Card className="p-3">
            <div className="text-xs font-semibold mb-1">Proposed trades</div>
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">{(doctor.proposed_trades || []).map((c, i) => <li key={i}>{c}</li>)}</ul>
          </Card>
        </div>
      )}

      {swapNote && <Alert className="mb-3"><AlertDescription className="text-xs">{swapNote}</AlertDescription></Alert>}

      {swaps.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1"><ArrowLeftRight className="h-3.5 w-3.5" /> Possible swaps</div>
          <div className="space-y-2">
            {swaps.map((s) => (
              <div key={s.symbol} className="rounded-md border border-border/60 p-2.5">
                <div className="text-xs font-semibold mb-1">Instead of {s.symbol}</div>
                <div className="flex flex-wrap gap-1.5">
                  {s.ideas.map((i) => (
                    <a key={i.symbol} href={`/stock/${encodeURIComponent(i.symbol)}`} title={i.reason || i.name || ""}>
                      <Badge variant="outline" className="cursor-pointer hover:bg-muted">{i.symbol}{i.name ? ` · ${i.name}` : ""}</Badge>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Swap ideas are research starting points, not recommendations. Open an instrument to compare it before trading.</p>
        </div>
      )}

      {holdings.length > 0 && <PortfolioInsights holdings={holdings} />}
    </Card>
  );
}
