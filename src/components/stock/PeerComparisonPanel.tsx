import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, RefreshCw, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Peer = {
  symbol: string;
  name: string;
  pe: number | null;
  forwardPe: number | null;
  pb: number | null;
  dividendYield: number | null;
  evEbitda: number | null;
  revGrowth: number | null;
  grossMargin: number | null;
  roe: number | null;
  mcap: number | null;
};

function fmt(v: number | null, opts: { pct?: boolean; mc?: boolean } = {}) {
  if (v == null || !Number.isFinite(v)) return "-";
  if (opts.mc) {
    const a = Math.abs(v);
    if (a >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
    if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    return v.toString();
  }
  if (opts.pct) return `${(v * 100).toFixed(1)}%`;
  return v.toFixed(1);
}

export function PeerComparisonPanel({ symbol }: { symbol: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Peer[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!symbol) return;
    let active = true;
    setLoading(true);
    setError(null);
    // Peer discovery + metrics now happen server-side, in parallel and cached.
    supabase.functions
      .invoke("company-fundamentals", { body: { action: "peers", symbol } })
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) { setError(err.message); setRows([]); }
        else { setRows(((data?.rows ?? []) as Peer[])); setSource((data?.source as string) ?? null); }
      })
      .catch((e) => { if (active) setError(String(e?.message ?? e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [symbol, nonce]);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Discovering peers…</div>;
  }
  if (error || !rows.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <AlertTriangle className="h-5 w-5 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {error
              ? "Peer data could not be loaded right now."
              : "No comparable listed peers were found for this instrument (this is normal for ETFs, funds and very small listings)."}
          </p>
          <Button variant="outline" size="sm" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw className="h-4 w-4 mr-2" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const trends = (() => {
    const others = rows.filter((r) => r.symbol !== symbol);
    const avg = (k: keyof Peer) => {
      const vals = others.map((r) => r[k]).filter((v): v is number => typeof v === "number");
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const subj = rows.find((r) => r.symbol === symbol);
    if (!subj) return null;
    const lines: string[] = [];
    const pePeers = avg("pe");
    if (subj.pe != null && pePeers != null) {
      const diff = ((subj.pe - pePeers) / pePeers) * 100;
      lines.push(`Trades at ${Math.abs(diff).toFixed(0)}% ${diff >= 0 ? "premium" : "discount"} to peer-average P/E.`);
    }
    const gPeers = avg("revGrowth");
    if (subj.revGrowth != null && gPeers != null) {
      lines.push(`Revenue growth ${subj.revGrowth >= gPeers ? "above" : "below"} peer median (${fmt(subj.revGrowth, { pct: true })} vs ${fmt(gPeers, { pct: true })}).`);
    }
    const mPeers = avg("grossMargin");
    if (subj.grossMargin != null && mPeers != null) {
      lines.push(`Gross margin ${subj.grossMargin >= mPeers ? "stronger" : "weaker"} than peers (${fmt(subj.grossMargin, { pct: true })} vs ${fmt(mPeers, { pct: true })}).`);
    }
    return lines;
  })();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Peer comparison</CardTitle>
          <CardDescription>
            {source === "sector_screen"
              ? "Peers selected from the same sector and listing region, largest by market value. Subject highlighted."
              : "Peers discovered from market co-ownership data. Subject highlighted."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left py-2 font-medium">Symbol</th>
                <th className="text-left py-2 font-medium">Name</th>
                <th className="text-right py-2 font-medium">P/E</th>
                <th className="text-right py-2 font-medium">Fwd P/E</th>
                <th className="text-right py-2 font-medium">P/B</th>
                <th className="text-right py-2 font-medium">EV/EBITDA</th>
                <th className="text-right py-2 font-medium">Rev growth</th>
                <th className="text-right py-2 font-medium">Gross margin</th>
                <th className="text-right py-2 font-medium">ROE</th>
                <th className="text-right py-2 font-medium">Div yield</th>
                <th className="text-right py-2 font-medium">Mkt cap</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isSubj = r.symbol === symbol;
                return (
                  <tr key={r.symbol} className={`border-b last:border-0 ${isSubj ? "bg-primary/5 font-semibold" : ""}`}>
                    <td className="py-2 font-mono">{r.symbol}</td>
                    <td className="py-2 truncate max-w-[180px]">{r.name}</td>
                    <td className="text-right font-mono py-2">{fmt(r.pe)}</td>
                    <td className="text-right font-mono py-2">{fmt(r.forwardPe)}</td>
                    <td className="text-right font-mono py-2">{fmt(r.pb)}</td>
                    <td className="text-right font-mono py-2">{fmt(r.evEbitda)}</td>
                    <td className="text-right font-mono py-2">{fmt(r.revGrowth, { pct: true })}</td>
                    <td className="text-right font-mono py-2">{fmt(r.grossMargin, { pct: true })}</td>
                    <td className="text-right font-mono py-2">{fmt(r.roe, { pct: true })}</td>
                    <td className="text-right font-mono py-2">{fmt(r.dividendYield, { pct: true })}</td>
                    <td className="text-right font-mono py-2">{fmt(r.mcap, { mc: true })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {trends && trends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Industry trends & drivers</CardTitle>
            <CardDescription>Descriptive cross-sectional read-out - not advice.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm list-disc pl-5 space-y-1">
              {trends.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
            <p className="text-[10px] text-muted-foreground italic mt-3">
              Generated from comparative ratios. Not investment advice.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}