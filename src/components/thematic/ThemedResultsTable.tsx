import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, LineChart, Sparkles, Info } from "lucide-react";
import { SEGMENT_LABELS, type RankedCompany } from "@/lib/thematic/schema";

interface Props { rows: RankedCompany[]; discoveryMode: boolean; theme?: string; pageSize?: number; }

function fmtMcap(v: number | null | undefined): string {
  if (!v || !Number.isFinite(v)) return "—";
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toLocaleString();
}
function fmtPct(v: number | null | undefined, dp = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(dp)}%`;
}

const exposureStyle: Record<string, string> = {
  "pure-play": "border-success/40 text-success",
  partial: "border-primary/40 text-primary",
  adjacent: "border-border text-muted-foreground",
};

export function ThemedResultsTable({ rows, discoveryMode, theme, pageSize = 15 }: Props) {
  const [visible, setVisible] = useState(pageSize);
  const paged = useMemo(() => rows.slice(0, visible), [rows, visible]);
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No candidates match those filters. Try widening the region or size band.</p>;
  }
  const drillHref = (sym: string) =>
    `/explore/themes/company/${encodeURIComponent(sym)}${theme ? `?theme=${encodeURIComponent(theme)}` : ""}`;
  return (
    <div className="space-y-2">
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2">Ticker</th>
            <th className="text-left px-3 py-2 hidden md:table-cell">Segment</th>
            <th className="text-left px-3 py-2">Exposure</th>
            <th className="text-right px-3 py-2">Mkt cap</th>
            <th className="text-right px-3 py-2 hidden sm:table-cell">Rev g</th>
            <th className="text-right px-3 py-2 hidden sm:table-cell">P/E</th>
            <th className="text-right px-3 py-2">Score</th>
            <th className="text-right px-3 py-2 w-32">Actions</th>
          </tr>
        </thead>
        <tbody>
          {paged.map((r) => (
            <tr key={r.symbol} className="border-t border-border hover:bg-muted/20">
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <Link to={drillHref(r.symbol)} className="font-mono font-semibold hover:underline">
                    {r.symbol}
                  </Link>
                  {discoveryMode && r.discovery && (
                    <Badge variant="outline" className="text-[9px] border-primary/40 text-primary flex items-center gap-1">
                      <Sparkles className="h-2.5 w-2.5" /> discovery
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">{r.name}</div>
              </td>
              <td className="px-3 py-2 hidden md:table-cell text-xs">{SEGMENT_LABELS[r.segment]}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className={`text-[10px] ${exposureStyle[r.exposure] ?? ""}`}>{r.exposure}</Badge>
                  {r.exposurePct != null && (
                    <span className="text-[10px] font-mono text-muted-foreground">{r.exposurePct.toFixed(0)}%</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-right font-mono">{fmtMcap(r.marketCap)}</td>
              <td className="px-3 py-2 text-right font-mono hidden sm:table-cell">{fmtPct(r.revGrowth)}</td>
              <td className="px-3 py-2 text-right font-mono hidden sm:table-cell">
                {r.pe != null && Number.isFinite(r.pe) ? (r.pe as number).toFixed(1) : "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono font-semibold">{r.score.toFixed(0)}</td>
              <td className="px-3 py-2 text-right">
                <div className="flex justify-end gap-1">
                  <Button asChild size="icon" variant="ghost" className="h-7 w-7" title="Why it matched">
                    <Link to={drillHref(r.symbol)}><Info className="h-3.5 w-3.5" /></Link>
                  </Button>
                  <Button asChild size="icon" variant="ghost" className="h-7 w-7" title="Technical view">
                    <Link to={`/technical?symbol=${encodeURIComponent(r.symbol)}`}><LineChart className="h-3.5 w-3.5" /></Link>
                  </Button>
                  <Button asChild size="icon" variant="ghost" className="h-7 w-7" title="Full page">
                    <Link to={`/stock/${encodeURIComponent(r.symbol)}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {rows.length > visible && (
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <span>Showing {paged.length} of {rows.length}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setVisible((v) => v + pageSize)}>Load more</Button>
          <Button size="sm" variant="ghost" onClick={() => setVisible(rows.length)}>Show all</Button>
        </div>
      </div>
    )}
    </div>
  );
}

export default ThemedResultsTable;