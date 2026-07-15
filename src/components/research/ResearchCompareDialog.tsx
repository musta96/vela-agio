import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitCompare, ArrowUp, ArrowDown, Minus } from "lucide-react";

interface Note {
  id: string;
  symbol: string;
  source_label?: string | null;
  mode: string;
  generated_at: string;
  report: any;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  notes: Note[];
}

function normLabel(s: string): string {
  return s.trim().toLowerCase().replace(/[\s\-_/]+/g, " ").replace(/[^\w %$.]/g, "").replace(/\s+/g, " ");
}

const guidanceIcon: Record<string, JSX.Element> = {
  raised: <ArrowUp className="h-3 w-3 text-bull" />,
  reiterated: <Minus className="h-3 w-3 text-muted-foreground" />,
  lowered: <ArrowDown className="h-3 w-3 text-bear" />,
  none: <Minus className="h-3 w-3 text-muted-foreground opacity-40" />,
};

export function ResearchCompareDialog({ open, onOpenChange, notes }: Props) {
  const sorted = useMemo(() => [...notes].sort((a, b) => new Date(a.generated_at).getTime() - new Date(b.generated_at).getTime()), [notes]);

  // Build union of metric labels across all notes (case/spacing normalized).
  const metricLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of sorted) {
      const list = (n.report?.keyMetrics ?? []) as any[];
      for (const m of list) {
        if (!m?.label) continue;
        const key = normLabel(m.label);
        if (!map.has(key)) map.set(key, m.label);
      }
    }
    return Array.from(map.entries()); // [normalizedKey, displayLabel]
  }, [sorted]);

  const getMetric = (n: Note, key: string) => {
    const list = (n.report?.keyMetrics ?? []) as any[];
    return list.find((m) => normLabel(m?.label ?? "") === key);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-primary" /> Compare research notes
            {sorted[0] && <Badge variant="outline">{sorted[0].symbol}</Badge>}
          </DialogTitle>
          <DialogDescription>
            Side-by-side view of AI-extracted metrics, guidance and sentiment across {sorted.length} filings — ordered oldest to newest.
          </DialogDescription>
        </DialogHeader>

        {sorted.length < 2 ? (
          <p className="text-sm text-muted-foreground">Select at least two saved notes to compare.</p>
        ) : (
          <ScrollArea className="flex-1">
            <div className="min-w-max">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-background z-10">
                  <tr>
                    <th className="text-left p-2 font-semibold w-56 border-b">Metric</th>
                    {sorted.map((n) => (
                      <th key={n.id} className="text-left p-2 font-semibold border-b whitespace-nowrap">
                        <div>{n.source_label || (n.mode === "transcript" ? "Earnings call" : "Filing")}</div>
                        <div className="text-[10px] font-normal text-muted-foreground">{new Date(n.generated_at).toLocaleDateString()}</div>
                        {n.report?.reportType && <Badge variant="secondary" className="text-[10px] mt-1">{n.report.reportType}</Badge>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-muted/30">
                    <td className="p-2 font-medium border-b">Guidance direction</td>
                    {sorted.map((n) => {
                      const dir = n.report?.guidance?.direction ?? "none";
                      return (
                        <td key={n.id} className="p-2 border-b">
                          <div className="flex items-center gap-1 capitalize">
                            {guidanceIcon[dir] ?? guidanceIcon.none} {dir}
                          </div>
                          {n.report?.guidance?.summary && (
                            <div className="text-[10px] text-muted-foreground line-clamp-2 max-w-[240px]">{n.report.guidance.summary}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="p-2 font-medium border-b">Management sentiment</td>
                    {sorted.map((n) => (
                      <td key={n.id} className="p-2 border-b capitalize">
                        {String(n.report?.managementTone?.sentiment ?? "-").replace(/-/g, " ")}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-2 font-medium border-b">Recommendation stance</td>
                    {sorted.map((n) => (
                      <td key={n.id} className="p-2 border-b capitalize">
                        {n.report?.recommendation?.stance ?? "-"}
                      </td>
                    ))}
                  </tr>
                  {metricLabels.map(([key, label]) => (
                    <tr key={key}>
                      <td className="p-2 font-medium border-b align-top">{label}</td>
                      {sorted.map((n) => {
                        const m = getMetric(n, key);
                        return (
                          <td key={n.id} className="p-2 border-b align-top">
                            {m ? (
                              <div>
                                <div className="font-mono text-sm">{m.value ?? "-"}</div>
                                {m.yoyChange && <div className="text-[10px] text-muted-foreground font-mono">YoY {m.yoyChange}</div>}
                              </div>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}