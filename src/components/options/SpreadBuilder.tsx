import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Layers, Plus, Trash2, Copy, Check, AlertTriangle, ShieldAlert, Info } from "lucide-react";
import { blackScholes, type Greeks } from "@/lib/options/blackScholes";
import { buildPayoffCurve, type LegPricing } from "@/lib/options/payoff";
import { computeRegTMargin, validateLegs } from "@/lib/options/margin";
import { PayoffChart } from "./PayoffChart";

export interface ChainRow {
  strike: number;
  bid?: number;
  ask?: number;
  lastPrice?: number;
  iv?: number;
  greeks?: Greeks | null;
}

export interface SpreadLeg {
  id: string;
  side: "call" | "put";
  action: "buy" | "sell";
  strike: number;
  qty: number;
}

interface Props {
  symbol: string;
  expiration?: number;
  spot: number | null;
  T: number;
  riskFree: number;
  divYield: number;
  calls: ChainRow[];
  puts: ChainRow[];
}

const CONTRACT_MULT = 100;

function fmt(n: number, d = 2) { return Number.isFinite(n) ? n.toFixed(d) : "—"; }

export function SpreadBuilder({ symbol, expiration, spot, T, riskFree, divYield, calls, puts }: Props) {
  const [legs, setLegs] = useState<SpreadLeg[]>([]);
  const [copied, setCopied] = useState(false);

  const rowsFor = (side: "call" | "put") => (side === "call" ? calls : puts);

  function addLeg() {
    const rows = rowsFor("call");
    if (!rows.length) return;
    const near = spot != null
      ? rows.reduce((b, r) => Math.abs(r.strike - spot) < Math.abs(b.strike - spot) ? r : b, rows[0])
      : rows[0];
    setLegs((prev) => [
      ...prev,
      { id: crypto.randomUUID(), side: "call", action: "buy", strike: near.strike, qty: 1 },
    ]);
  }

  function updateLeg(id: string, patch: Partial<SpreadLeg>) {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function removeLeg(id: string) {
    setLegs((prev) => prev.filter((l) => l.id !== id));
  }

  const enriched = useMemo(() => {
    return legs.map((leg) => {
      const row = rowsFor(leg.side).find((r) => r.strike === leg.strike);
      const iv = row?.iv;
      const greeks = iv && spot && T
        ? blackScholes(leg.side, spot, leg.strike, T, riskFree, divYield, iv)
        : row?.greeks ?? null;
      const mid = row?.bid && row?.ask ? (row.bid + row.ask) / 2 : row?.lastPrice ?? greeks?.price ?? 0;
      const sign = leg.action === "buy" ? 1 : -1;
      const notionalPerContract = mid * CONTRACT_MULT;
      return { leg, row, iv, greeks, mid, sign, notional: sign * notionalPerContract * leg.qty };
    });
  }, [legs, calls, puts, spot, T, riskFree, divYield]);

  const combined = useMemo(() => {
    const acc = { delta: 0, gamma: 0, theta: 0, vega: 0, price: 0, cost: 0, contracts: 0 };
    enriched.forEach(({ leg, greeks, mid, sign }) => {
      const n = leg.qty * sign;
      if (greeks && Number.isFinite(greeks.delta)) {
        acc.delta += n * greeks.delta;
        acc.gamma += n * greeks.gamma;
        acc.theta += n * greeks.theta;
        acc.vega += n * greeks.vega;
        acc.price += n * greeks.price;
      }
      acc.cost += n * (mid ?? 0) * CONTRACT_MULT;
      acc.contracts += Math.abs(leg.qty);
    });
    return acc;
  }, [enriched]);

  const orderInstructions = useMemo(() => {
    if (!legs.length) return "";
    const expStr = expiration ? new Date(expiration * 1000).toISOString().slice(0, 10) : "N/A";
    const header = `# ${symbol} ${expStr} spread — ${legs.length} leg${legs.length > 1 ? "s" : ""}`;
    const rows = enriched.map(({ leg, mid }) => {
      const occ = `${symbol} ${expStr} ${leg.strike}${leg.side === "call" ? "C" : "P"}`;
      return `place_paper_order({ symbol: "${occ}", side: "${leg.action === "buy" ? "buy" : "sell"}", qty: ${leg.qty}, type: "limit", limit_price: ${mid.toFixed(2)}, asset_class: "option" })`;
    });
    const net = combined.cost >= 0 ? `net debit $${combined.cost.toFixed(2)}` : `net credit $${(-combined.cost).toFixed(2)}`;
    return [header, `# ${net}`, ...rows].join("\n");
  }, [legs, enriched, symbol, expiration, combined.cost]);

  const pricedLegs = useMemo<LegPricing[]>(
    () => enriched.map(({ leg, mid }) => ({ leg, mid })),
    [enriched],
  );

  const payoff = useMemo(
    () => (legs.length ? buildPayoffCurve(pricedLegs, spot) : null),
    [pricedLegs, spot, legs.length],
  );

  const margin = useMemo(
    () => (legs.length ? computeRegTMargin(pricedLegs, spot) : null),
    [pricedLegs, spot, legs.length],
  );

  const structuralWarnings = useMemo(() => validateLegs(legs), [legs]);
  const allWarnings = [...structuralWarnings, ...(margin?.warnings ?? [])];
  const hasBlocking = allWarnings.some((w) => w.severity === "danger");
  const strikes = useMemo(() => Array.from(new Set(legs.map((l) => l.strike))), [legs]);

  async function copyInstructions() {
    try {
      await navigator.clipboard.writeText(orderInstructions);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {/* noop */}
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Spread builder</h3>
          <Badge variant="outline" className="text-[10px]">{legs.length} leg{legs.length === 1 ? "" : "s"}</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addLeg} disabled={!calls.length}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add leg
          </Button>
          {legs.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setLegs([])}>Clear</Button>
          )}
        </div>
      </div>

      {legs.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add two or more legs to build a vertical, calendar, straddle, condor, etc. Combined Greeks and paper-order calls are generated below.
        </p>
      )}

      {legs.length > 0 && (
        <div className="space-y-2">
          {enriched.map(({ leg, mid, greeks }) => {
            const strikes = rowsFor(leg.side).map((r) => r.strike);
            return (
              <div key={leg.id} className="grid grid-cols-12 gap-2 items-end p-2 rounded-md bg-muted/30 border border-border">
                <div className="col-span-6 md:col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Action</Label>
                  <Select value={leg.action} onValueChange={(v) => updateLeg(leg.id, { action: v as "buy" | "sell" })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buy">Buy (long)</SelectItem>
                      <SelectItem value="sell">Sell (short)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-6 md:col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Type</Label>
                  <Select value={leg.side} onValueChange={(v) => updateLeg(leg.id, { side: v as "call" | "put" })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="put">Put</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-6 md:col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Strike</Label>
                  <Select value={String(leg.strike)} onValueChange={(v) => updateLeg(leg.id, { strike: Number(v) })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {strikes.map((s) => (
                        <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 md:col-span-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    value={leg.qty}
                    onChange={(e) => updateLeg(leg.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                    className="h-8"
                  />
                </div>
                <div className="col-span-3 md:col-span-1 text-right">
                  <div className="text-[10px] uppercase text-muted-foreground">Mid</div>
                  <div className="font-mono text-sm">{fmt(mid)}</div>
                </div>
                <div className="col-span-3 md:col-span-1 text-right">
                  <div className="text-[10px] uppercase text-muted-foreground">Δ leg</div>
                  <div className="font-mono text-sm">{greeks ? fmt(greeks.delta, 3) : "—"}</div>
                </div>
                <div className="col-span-3 md:col-span-2 text-right">
                  <div className="text-[10px] uppercase text-muted-foreground">Cost (×100)</div>
                  <div className="font-mono text-sm">
                    {leg.action === "buy" ? "-" : "+"}${fmt(mid * CONTRACT_MULT * leg.qty)}
                  </div>
                </div>
                <div className="col-span-12 md:col-span-1 flex md:justify-end">
                  <Button size="icon" variant="ghost" onClick={() => removeLeg(leg.id)} aria-label="Remove leg">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-3 rounded-md border border-primary/40 bg-primary/5">
            <Metric label="Net cost" value={`${combined.cost >= 0 ? "-" : "+"}$${fmt(Math.abs(combined.cost))}`} hint={combined.cost >= 0 ? "debit" : "credit"} />
            <Metric label="BS price" value={fmt(combined.price)} />
            <Metric label="Σ Delta" value={fmt(combined.delta, 3)} />
            <Metric label="Σ Gamma" value={fmt(combined.gamma, 4)} />
            <Metric label="Σ Theta/d" value={fmt(combined.theta, 3)} />
            <Metric label="Σ Vega/1%" value={fmt(combined.vega, 3)} />
          </div>

          {payoff && (
            <div className="p-3 rounded-md border border-border bg-background/40 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Expiration P/L across underlying
              </div>
              <PayoffChart
                points={payoff.points}
                breakevens={payoff.breakevens}
                spot={spot}
                strikes={strikes}
                maxProfit={payoff.maxProfit}
                maxLoss={payoff.maxLoss}
              />
            </div>
          )}

          {margin && (
            <div className="p-3 rounded-md border border-border bg-muted/20 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Reg-T risk check · {margin.structure}
                </div>
                <div className="flex gap-3 text-xs font-mono">
                  <span>
                    Net {margin.net >= 0 ? "debit" : "credit"}:{" "}
                    <b>${Math.abs(margin.net).toFixed(2)}</b>
                  </span>
                  <span>
                    Initial margin: <b>${margin.requirement.toFixed(0)}</b>
                  </span>
                  <span>
                    Max loss:{" "}
                    <b className={margin.unbounded ? "text-red-600" : ""}>
                      {Number.isFinite(margin.maxLoss) ? `$${margin.maxLoss.toFixed(0)}` : "unlimited"}
                    </b>
                  </span>
                </div>
              </div>
              {allWarnings.map((w, i) => (
                <Alert
                  key={i}
                  variant={w.severity === "danger" ? "destructive" : "default"}
                  className="py-2"
                >
                  {w.severity === "danger" ? (
                    <ShieldAlert className="h-4 w-4" />
                  ) : w.severity === "warn" ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <Info className="h-4 w-4" />
                  )}
                  <AlertDescription className="text-[11px]">{w.message}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] uppercase text-muted-foreground">Paper-order instructions</Label>
              <Button size="sm" variant="outline" onClick={copyInstructions} disabled={hasBlocking}>
                {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {hasBlocking ? "Blocked" : copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="text-[11px] font-mono bg-muted/40 rounded-md p-3 overflow-auto whitespace-pre-wrap">
{orderInstructions}
            </pre>
            <Alert>
              <AlertDescription className="text-[11px]">
                Paste each line to the Copilot to execute via <code>place_paper_order</code>. Multi-leg option orders are simulated as independent legs; the Reg-T check above is an educational estimate and your live broker may require more. Educational only.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono font-semibold text-sm">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}