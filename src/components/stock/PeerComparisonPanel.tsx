import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users } from "lucide-react";

type Peer = {
  symbol: string;
  name: string;
  pe: number | null;
  evEbitda: number | null;
  revGrowth: number | null;
  grossMargin: number | null;
  roe: number | null;
  mcap: number | null;
};

const PROXY = "https://api.allorigins.win/raw?url=";

function num(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v?.raw === "number") return v.raw;
  return null;
}

function fmt(v: number | null, opts: { pct?: boolean; mc?: boolean } = {}) {
  if (v == null || !Number.isFinite(v)) return "—";
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

async function fetchPeer(symbol: string): Promise<Peer | null> {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,summaryDetail,defaultKeyStatistics,financialData`;
  try {
    const j = await fetch(`${PROXY}${encodeURIComponent(url)}`).then((r) => r.json());
    const r = j?.quoteSummary?.result?.[0];
    if (!r) return null;
    return {
      symbol,
      name: r.price?.shortName ?? r.price?.longName ?? symbol,
      pe: num(r.summaryDetail?.trailingPE),
      evEbitda: num(r.defaultKeyStatistics?.enterpriseToEbitda),
      revGrowth: num(r.financialData?.revenueGrowth),
      grossMargin: num(r.financialData?.grossMargins),
      roe: num(r.financialData?.returnOnEquity),
      mcap: num(r.price?.marketCap),
    };
  } catch {
    return null;
  }
}

export function PeerComparisonPanel({ symbol }: { symbol: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Peer[]>([]);

  useEffect(() => {
    if (!symbol) return;
    let active = true;
    setLoading(true);
    (async () => {
      // Discover peers via Yahoo's recommendations endpoint.
      const recUrl = `https://query1.finance.yahoo.com/v6/finance/recommendationsbysymbol/${encodeURIComponent(symbol)}`;
      const rec = await fetch(`${PROXY}${encodeURIComponent(recUrl)}`).then((r) => r.json()).catch(() => null);
      const peerSyms: string[] = (rec?.finance?.result?.[0]?.recommendedSymbols ?? [])
        .map((x: any) => x?.symbol)
        .filter(Boolean)
        .slice(0, 5);
      const syms = Array.from(new Set([symbol, ...peerSyms]));
      const out: Peer[] = [];
      for (const s of syms) {
        const p = await fetchPeer(s);
        if (p) out.push(p);
      }
      if (active) { setRows(out); setLoading(false); }
    })();
    return () => { active = false; };
  }, [symbol]);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Discovering peers…</div>;
  }
  if (!rows.length) {
    return <div className="text-sm text-muted-foreground py-6">No peer data available for this symbol.</div>;
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
          <CardDescription>Peers discovered via Yahoo Finance recommendations. Subject highlighted.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left py-2 font-medium">Symbol</th>
                <th className="text-left py-2 font-medium">Name</th>
                <th className="text-right py-2 font-medium">P/E</th>
                <th className="text-right py-2 font-medium">EV/EBITDA</th>
                <th className="text-right py-2 font-medium">Rev growth</th>
                <th className="text-right py-2 font-medium">Gross margin</th>
                <th className="text-right py-2 font-medium">ROE</th>
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
                    <td className="text-right font-mono py-2">{fmt(r.evEbitda)}</td>
                    <td className="text-right font-mono py-2">{fmt(r.revGrowth, { pct: true })}</td>
                    <td className="text-right font-mono py-2">{fmt(r.grossMargin, { pct: true })}</td>
                    <td className="text-right font-mono py-2">{fmt(r.roe, { pct: true })}</td>
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
            <CardDescription>Descriptive cross-sectional read-out — not advice.</CardDescription>
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