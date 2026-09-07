import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { findPeers } from "@/lib/fundUniverse";
import { toMetrics, useFundPeers, type PeerMetrics } from "@/hooks/useFundPeers";
import type { FundProfileData } from "@/hooks/useFundProfile";

interface Props { data: FundProfileData }

const pctVal = (v: number | null) =>
  v == null ? "—" : `${(Math.abs(v) <= 1.5 ? v * 100 : v).toFixed(2)}%`;
const compact = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v);
const norm = (v: number | null) => (v == null ? null : Math.abs(v) <= 1.5 ? v * 100 : v);

interface Alternative {
  peer: PeerMetrics;
  edge: number;
  reasons: string[];
  caveats: string[];
}

/**
 * Similar vehicles with the same underlying exposure, plus an aggregate check
 * of whether any of them is objectively a better way to buy that exposure.
 */
export const FundPeersTab = ({ data }: Props) => {
  const self = useMemo(() => toMetrics(data), [data]);
  const match = useMemo(
    () => findPeers({
      symbol: data.symbol,
      category: data.profile?.category ?? data.ratings?.morningstarCategory ?? null,
      name: data.profile?.name ?? null,
      description: data.profile?.description ?? null,
    }),
    [data],
  );

  const { peers, loading, error, reload } = useFundPeers(match.symbols, match.symbols.length > 0);

  const alternatives = useMemo<Alternative[]>(() => {
    const out: Alternative[] = [];
    for (const p of peers) {
      const reasons: string[] = [];
      const caveats: string[] = [];
      let edge = 0;

      if (p.ter != null && self.ter != null) {
        const diff = (self.ter - p.ter) * 10000; // basis points
        if (diff >= 3) { edge += Math.min(diff / 3, 20); reasons.push(`Costs ${diff.toFixed(0)} bps less each year (${(p.ter * 100).toFixed(2)}% vs ${(self.ter * 100).toFixed(2)}%).`); }
        else if (diff <= -3) { edge -= Math.min(-diff / 3, 20); caveats.push(`More expensive: ${(p.ter * 100).toFixed(2)}% vs ${(self.ter * 100).toFixed(2)}%.`); }
      }

      for (const [k, label] of [["threeYear", "3-year"], ["fiveYear", "5-year"]] as const) {
        const a = norm(p[k]); const b = norm(self[k]);
        if (a != null && b != null) {
          const d = a - b;
          if (d >= 0.5) { edge += Math.min(d * 2, 20); reasons.push(`${label} return ahead by ${d.toFixed(2)} percentage points a year.`); }
          else if (d <= -0.5) { edge -= Math.min(-d * 2, 20); caveats.push(`${label} return behind by ${Math.abs(d).toFixed(2)} points a year.`); }
        }
      }

      if (p.velaScore != null && self.velaScore != null) {
        const d = p.velaScore - self.velaScore;
        if (d >= 5) { edge += Math.min(d, 20); reasons.push(`Higher Vela quality score (${p.velaScore} vs ${self.velaScore}).`); }
        else if (d <= -5) { edge -= Math.min(-d, 20); caveats.push(`Lower Vela quality score (${p.velaScore} vs ${self.velaScore}).`); }
      }

      if (p.riskScore != null && self.riskScore != null) {
        const d = self.riskScore - p.riskScore;
        if (d >= 8) { edge += 6; reasons.push("Lower risk score for comparable exposure."); }
        else if (d <= -8) caveats.push("Higher risk score — expect larger swings.");
      }

      if (p.size != null && self.size != null) {
        if (p.size >= self.size * 3) { edge += 5; reasons.push(`Much larger (${compact(p.size)}) — tighter spreads and lower closure risk.`); }
        else if (p.size * 3 <= self.size) caveats.push(`Smaller fund (${compact(p.size)}) — wider spreads possible.`);
      }

      if (p.morningstar != null && self.morningstar != null && p.morningstar > self.morningstar) {
        edge += 4; reasons.push(`Morningstar ${p.morningstar}/5 versus ${self.morningstar}/5.`);
      }

      if (self.ucits && p.ucits === false) caveats.push("Not UCITS — usually not buyable by EU retail investors and taxed differently.");
      if (p.currency && self.currency && p.currency !== self.currency) caveats.push(`Quoted in ${p.currency} — currency conversion applies.`);
      if (p.distribution && self.distribution && p.distribution !== self.distribution) {
        caveats.push(`${p.distribution} share class instead of ${self.distribution}.`);
      }

      out.push({ peer: p, edge, reasons, caveats });
    }
    return out.sort((a, b) => b.edge - a.edge);
  }, [peers, self]);

  const better = alternatives.filter((a) => a.edge >= 8 && a.reasons.length >= 2).slice(0, 3);

  if (!match.group) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Similar vehicles</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          We could not identify a comparable group for this vehicle from its published category and objective.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Similar vehicles — {match.group.label}</CardTitle>
            <CardDescription>Same underlying exposure, compared on cost, scale, record and quality.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {loading && !peers.length ? (
            <p className="text-sm text-muted-foreground">Loading comparable funds…</p>
          ) : error && !peers.length ? (
            <p className="text-sm text-muted-foreground">{error}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="text-right">Ongoing charge</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="text-right">3y</TableHead>
                    <TableHead className="text-right">5y</TableHead>
                    <TableHead className="text-right">Vela</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[{ ...self, isSelf: true }, ...peers.map((p) => ({ ...p, isSelf: false }))].map((r) => (
                    <TableRow key={r.symbol} className={r.isSelf ? "bg-muted/40" : undefined}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {r.isSelf ? (
                            <span className="font-medium">{r.symbol}</span>
                          ) : (
                            <Link to={`/fund/${encodeURIComponent(r.symbol)}`} className="font-medium text-primary hover:underline">
                              {r.symbol}
                            </Link>
                          )}
                          {r.isSelf && <Badge variant="secondary" className="text-[10px]">This fund</Badge>}
                        </div>
                        <div className="max-w-[260px] truncate text-xs text-muted-foreground">{r.name}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.ter == null ? "—" : `${(r.ter * 100).toFixed(2)}%`}</TableCell>
                      <TableCell className="text-right tabular-nums">{compact(r.size)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pctVal(r.threeYear)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pctVal(r.fiveYear)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.velaScore ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Is there a better way to buy this exposure?</CardTitle>
              <CardDescription>
                Aggregate of cost, track record, quality score, risk and scale across the comparable group.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {loading && !peers.length ? (
            <p className="text-muted-foreground">Running the comparison…</p>
          ) : !better.length ? (
            <p className="text-muted-foreground">
              Nothing in the comparable group is clearly better on the published data — {self.name} holds up against its peers on cost,
              record and quality. Differences that do exist are small enough to be noise.
            </p>
          ) : (
            better.map((a) => (
              <div key={a.peer.symbol} className="rounded-lg border border-border/60 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Link to={`/fund/${encodeURIComponent(a.peer.symbol)}`} className="font-medium text-primary hover:underline">
                    {a.peer.name} ({a.peer.symbol})
                  </Link>
                  <Badge variant="outline" className="text-success border-success/40 bg-success/5">
                    Advantage {a.edge.toFixed(0)}
                  </Badge>
                  {a.peer.isin && <Badge variant="secondary" className="text-[10px]">{a.peer.isin}</Badge>}
                </div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-success">Why it may be better</p>
                <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                  {a.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
                {a.caveats.length > 0 && (
                  <>
                    <p className="mb-1 mt-2 text-xs font-medium uppercase tracking-wide text-destructive">Trade-offs</p>
                    <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                      {a.caveats.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </>
                )}
                <Button asChild size="sm" variant="ghost" className="mt-2 px-0">
                  <Link to={`/fund/${encodeURIComponent(a.peer.symbol)}`}>
                    Open full data sheet <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))
          )}
          <p className="text-xs italic text-muted-foreground">
            Educational comparison based on published fund data — not investment advice. Check tax treatment, dealing costs and your
            existing exposure before switching.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
