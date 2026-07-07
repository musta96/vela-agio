import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { SEGMENT_LABELS, type RankedCompany } from "@/lib/thematic/schema";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  theme: string;
  companies: RankedCompany[];
}

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

export function ThematicCompareDialog({ open, onOpenChange, theme, companies }: Props) {
  const rows: Array<{ key: string; label: string; render: (c: RankedCompany) => React.ReactNode }> = [
    { key: "name", label: "Name", render: (c) => <span className="text-muted-foreground">{c.name}</span> },
    { key: "segment", label: "Segment", render: (c) => <Badge variant="outline" className="text-[10px]">{SEGMENT_LABELS[c.segment]}</Badge> },
    { key: "exposure", label: "Exposure", render: (c) => (
        <div className="flex items-center gap-1 flex-wrap">
          <Badge variant="outline" className={`text-[10px] ${exposureStyle[c.exposure] ?? ""}`}>{c.exposure}</Badge>
          {c.exposurePct != null && <span className="text-[10px] font-mono text-muted-foreground">{c.exposurePct.toFixed(0)}%</span>}
        </div>
      ) },
    { key: "exposurePct", label: "Revenue exposure %", render: (c) => (
        <span className="font-mono">{c.exposurePct != null ? `${c.exposurePct.toFixed(0)}%` : "—"}</span>
      ) },
    { key: "mcap", label: "Market cap", render: (c) => <span className="font-mono">{fmtMcap(c.marketCap)}</span> },
    { key: "price", label: "Price", render: (c) => <span className="font-mono">{c.price != null ? `${c.price.toFixed(2)} ${c.currency ?? ""}` : "—"}</span> },
    { key: "revGrowth", label: "Revenue growth", render: (c) => <span className="font-mono">{fmtPct(c.revGrowth)}</span> },
    { key: "pe", label: "P/E", render: (c) => <span className="font-mono">{c.pe != null && Number.isFinite(c.pe) ? c.pe.toFixed(1) : "—"}</span> },
    { key: "sentiment", label: "Sentiment", render: (c) => <span className="font-mono">{c.sentiment != null ? c.sentiment.toFixed(2) : "—"}</span> },
    { key: "region", label: "Region", render: (c) => <span className="uppercase text-xs">{c.region ?? "—"}</span> },
    { key: "score", label: "Composite score", render: (c) => <span className="font-mono font-semibold">{c.score.toFixed(0)}</span> },
    { key: "thesis", label: "Thesis", render: (c) => <span className="text-xs text-muted-foreground">{c.thesis ?? "—"}</span> },
    { key: "evidence", label: "Supporting evidence", render: (c) => (
        c.evidence && c.evidence.length > 0
          ? <ul className="list-disc pl-4 space-y-0.5 text-xs">{c.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
          : <span className="text-xs text-muted-foreground">—</span>
      ) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Compare — {theme}</DialogTitle>
          <DialogDescription>Side-by-side thematic exposure, evidence and key metrics for {companies.length} selected companies.</DialogDescription>
        </DialogHeader>
        <div className="overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 w-40">Metric</th>
                {companies.map((c) => (
                  <th key={c.symbol} className="text-left px-3 py-2 font-mono">{c.symbol}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-border align-top">
                  <td className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">{row.label}</td>
                  {companies.map((c) => (
                    <td key={c.symbol} className="px-3 py-2">{row.render(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ThematicCompareDialog;