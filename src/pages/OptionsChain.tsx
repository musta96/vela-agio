import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sigma, TrendingDown, TrendingUp, Search, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { blackScholes, impliedVol, yearsBetween } from "@/lib/options/blackScholes";
import { SpreadBuilder, type ChainRow } from "@/components/options/SpreadBuilder";

interface ContractRow {
  strike: number;
  lastPrice?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
}
interface ChainPayload {
  symbol: string;
  name: string;
  spot: number | null;
  currency: string;
  expirations: number[];
  selectedExpiration: number | null;
  strikes: number[];
  calls: ContractRow[];
  puts: ContractRow[];
}

const RISK_FREE = 0.045;
const DIV_YIELD = 0.0;

export default function OptionsChain() {
  const { symbol: routeSymbol } = useParams<{ symbol?: string }>();
  const navigate = useNavigate();
  const initial = (routeSymbol ?? "").toUpperCase();
  const [input, setInput] = useState(initial);
  const [symbol, setSymbol] = useState(initial);
  const [expiration, setExpiration] = useState<number | undefined>(undefined);
  const [side, setSide] = useState<"call" | "put">("call");
  const [data, setData] = useState<ChainPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true); setError(null);
    supabase.functions.invoke<ChainPayload>("options-chain", { body: { symbol, expiration } })
      .then(({ data: d, error: e }) => {
        if (e || !d) throw new Error(e?.message ?? "options fetch failed");
        setData(d);
        if (!expiration && d.selectedExpiration) setExpiration(d.selectedExpiration);
        // pick nearest to spot as default selected strike
        if (d.spot != null) {
          const rows = side === "call" ? d.calls : d.puts;
          const nearest = rows.reduce<ContractRow | null>((best, r) =>
            !best || Math.abs(r.strike - d.spot!) < Math.abs(best.strike - d.spot!) ? r : best, null);
          if (nearest) setSelectedStrike(nearest.strike);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [symbol, expiration, side]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = input.trim().toUpperCase();
    if (!v) return;
    setSymbol(v); setExpiration(undefined); setSelectedStrike(null);
    navigate(`/options/${encodeURIComponent(v)}`, { replace: true });
  }

  const T = useMemo(() => {
    if (!expiration) return 0;
    return yearsBetween(Date.now(), expiration * 1000);
  }, [expiration]);

  const rows = side === "call" ? data?.calls ?? [] : data?.puts ?? [];

  const enriched = useMemo(() => {
    if (!data?.spot || !T) return [];
    return rows.map((r) => {
      let iv = r.impliedVolatility;
      const mid = r.bid && r.ask ? (r.bid + r.ask) / 2 : r.lastPrice;
      if ((!iv || !Number.isFinite(iv)) && mid && mid > 0) {
        iv = impliedVol(side, mid, data.spot!, r.strike, T, RISK_FREE, DIV_YIELD) ?? undefined;
      }
      const greeks = iv && iv > 0
        ? blackScholes(side, data.spot!, r.strike, T, RISK_FREE, DIV_YIELD, iv)
        : null;
      return { ...r, iv, greeks };
    });
  }, [rows, data?.spot, T, side]);

  // Enrich both sides for the spread builder (independent of the displayed side).
  const bothEnriched = useMemo(() => {
    if (!data?.spot || !T) return { calls: [] as ChainRow[], puts: [] as ChainRow[] };
    const enrich = (kind: "call" | "put", src: ContractRow[]): ChainRow[] => src.map((r) => {
      let iv = r.impliedVolatility;
      const mid = r.bid && r.ask ? (r.bid + r.ask) / 2 : r.lastPrice;
      if ((!iv || !Number.isFinite(iv)) && mid && mid > 0) {
        iv = impliedVol(kind, mid, data.spot!, r.strike, T, RISK_FREE, DIV_YIELD) ?? undefined;
      }
      const greeks = iv && iv > 0
        ? blackScholes(kind, data.spot!, r.strike, T, RISK_FREE, DIV_YIELD, iv)
        : null;
      return { strike: r.strike, bid: r.bid, ask: r.ask, lastPrice: r.lastPrice, iv, greeks };
    });
    return { calls: enrich("call", data.calls), puts: enrich("put", data.puts) };
  }, [data, T]);

  const selected = enriched.find((r) => r.strike === selectedStrike) ?? null;

  return (
    <div className="px-6 sm:px-8 py-6 max-w-7xl mx-auto space-y-4">
      <SEO
        title={symbol ? `${symbol} options chain — Delta, Gamma, Theta, Vega` : "Options chain viewer"}
        description={`Live options chain for ${symbol || "any ticker"} with Black-Scholes Greeks (delta, gamma, theta, vega) for the selected expiration and strike.`}
        path={`/options${symbol ? `/${symbol}` : ""}`}
      />
      <PageHeader icon={Sigma} title="Options chain" description="Pick a strike and expiration to inspect delta, gamma, theta and vega. Educational — not a recommendation." />

      <Card className="p-4">
        <form onSubmit={submit} className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <Label className="text-xs">Underlying (Yahoo ticker)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="AAPL, MSFT, ^SPX…" />
            </div>
          </div>
          <Button type="submit" disabled={!input.trim()}>Load chain</Button>
          {data && (
            <>
              <div>
                <Label className="text-xs">Expiration</Label>
                <Select value={String(expiration ?? "")} onValueChange={(v) => setExpiration(Number(v))}>
                  <SelectTrigger className="w-[180px] mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {data.expirations.map((exp) => (
                      <SelectItem key={exp} value={String(exp)}>
                        {new Date(exp * 1000).toISOString().slice(0, 10)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-1">
                <Badge variant={side === "call" ? "default" : "outline"} className="cursor-pointer" onClick={() => setSide("call")}>Calls</Badge>
                <Badge variant={side === "put" ? "default" : "outline"} className="cursor-pointer" onClick={() => setSide("put")}>Puts</Badge>
              </div>
            </>
          )}
        </form>
      </Card>

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      )}

      {error && !loading && (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3"><div className="text-[11px] uppercase text-muted-foreground">Underlying</div><div className="text-lg font-bold">{data.symbol}</div><div className="text-xs text-muted-foreground truncate">{data.name}</div></Card>
            <Card className="p-3"><div className="text-[11px] uppercase text-muted-foreground">Spot</div><div className="text-lg font-bold tabular-nums">{data.spot != null ? `${data.spot.toFixed(2)} ${data.currency}` : "—"}</div></Card>
            <Card className="p-3"><div className="text-[11px] uppercase text-muted-foreground">Expiry</div><div className="text-lg font-bold tabular-nums">{expiration ? new Date(expiration * 1000).toISOString().slice(0, 10) : "—"}</div></Card>
            <Card className="p-3"><div className="text-[11px] uppercase text-muted-foreground">Days to expiry</div><div className="text-lg font-bold tabular-nums">{(T * 365).toFixed(0)}</div></Card>
          </div>

          {selected && selected.greeks && (
            <Card className="p-4 border-primary/40">
              <div className="flex items-center gap-2 mb-2">
                {side === "call" ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                <h3 className="text-sm font-semibold">Selected: {side.toUpperCase()} {selected.strike} · {new Date((expiration ?? 0) * 1000).toISOString().slice(0, 10)}</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                <Metric label="Price (BS)" value={selected.greeks.price.toFixed(2)} />
                <Metric label="IV" value={selected.iv ? `${(selected.iv * 100).toFixed(1)}%` : "—"} />
                <Metric label="Delta" value={selected.greeks.delta.toFixed(3)} />
                <Metric label="Gamma" value={selected.greeks.gamma.toFixed(4)} />
                <Metric label="Theta / day" value={selected.greeks.theta.toFixed(3)} />
                <Metric label="Vega / 1% IV" value={selected.greeks.vega.toFixed(3)} />
              </div>
            </Card>
          )}

          <SpreadBuilder
            symbol={data.symbol}
            expiration={expiration}
            spot={data.spot}
            T={T}
            riskFree={RISK_FREE}
            divYield={DIV_YIELD}
            calls={bothEnriched.calls}
            puts={bothEnriched.puts}
          />

          <Card className="p-0 overflow-hidden">
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-right px-3 py-2">Strike</th>
                    <th className="text-right px-3 py-2">Bid</th>
                    <th className="text-right px-3 py-2">Ask</th>
                    <th className="text-right px-3 py-2">Last</th>
                    <th className="text-right px-3 py-2">IV</th>
                    <th className="text-right px-3 py-2">Δ</th>
                    <th className="text-right px-3 py-2">Γ</th>
                    <th className="text-right px-3 py-2">Θ/d</th>
                    <th className="text-right px-3 py-2">Vega</th>
                    <th className="text-right px-3 py-2">OI</th>
                  </tr>
                </thead>
                <tbody>
                  {enriched.map((r) => {
                    const isSpot = data.spot != null && Math.abs(r.strike - data.spot) === Math.min(...enriched.map((x) => Math.abs(x.strike - (data.spot ?? 0))));
                    return (
                      <tr
                        key={r.strike}
                        onClick={() => setSelectedStrike(r.strike)}
                        className={`border-t border-border cursor-pointer hover:bg-muted/40 ${selectedStrike === r.strike ? "bg-primary/10" : ""} ${isSpot ? "font-semibold" : ""}`}
                      >
                        <td className="text-right px-3 py-1.5 font-mono">{r.strike}</td>
                        <td className="text-right px-3 py-1.5 font-mono">{r.bid?.toFixed(2) ?? "—"}</td>
                        <td className="text-right px-3 py-1.5 font-mono">{r.ask?.toFixed(2) ?? "—"}</td>
                        <td className="text-right px-3 py-1.5 font-mono">{r.lastPrice?.toFixed(2) ?? "—"}</td>
                        <td className="text-right px-3 py-1.5 font-mono">{r.iv ? `${(r.iv * 100).toFixed(1)}%` : "—"}</td>
                        <td className="text-right px-3 py-1.5 font-mono">{r.greeks?.delta.toFixed(3) ?? "—"}</td>
                        <td className="text-right px-3 py-1.5 font-mono">{r.greeks?.gamma.toFixed(4) ?? "—"}</td>
                        <td className="text-right px-3 py-1.5 font-mono">{r.greeks?.theta.toFixed(3) ?? "—"}</td>
                        <td className="text-right px-3 py-1.5 font-mono">{r.greeks?.vega.toFixed(3) ?? "—"}</td>
                        <td className="text-right px-3 py-1.5 font-mono">{r.openInterest ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Greeks are computed with a Black-Scholes model (risk-free rate {(RISK_FREE * 100).toFixed(1)}%, dividend yield {(DIV_YIELD * 100).toFixed(1)}%). Provider data can be delayed. For education only — not investment advice.
            </AlertDescription>
          </Alert>
        </>
      )}

      {!symbol && !loading && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Enter a ticker above to load its options chain (e.g. AAPL, MSFT, NVDA, SPY).
          <div className="mt-2 text-xs">Note: only tickers with listed US options are supported.</div>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono font-semibold">{value}</div>
    </div>
  );
}