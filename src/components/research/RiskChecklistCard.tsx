import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, ShieldCheck, Quote as QuoteIcon } from "lucide-react";
import { Citation } from "./Citation";
import {
  classifyRisks, summarizeRisks, readChecked, writeChecked,
  type RiskSeverity, type ClassifiedRisk,
} from "@/lib/research/riskChecklist";

interface Props {
  risks: unknown;
  sourceUrl?: string;
  /** Stable key used to persist the reviewed state of this note's checklist. */
  noteKey: string;
}

const severityStyle: Record<RiskSeverity, string> = {
  high: "text-bear",
  medium: "text-warning",
  low: "text-muted-foreground",
};

const severityBadge: Record<RiskSeverity, "destructive" | "secondary" | "outline"> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

export function RiskChecklistCard({ risks, sourceUrl, noteKey }: Props) {
  const classified = useMemo(() => classifyRisks(risks as any), [risks]);
  const summary = useMemo(() => summarizeRisks(classified), [classified]);
  const [severityFilter, setSeverityFilter] = useState<RiskSeverity | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(() => readChecked(noteKey));

  useEffect(() => { setChecked(readChecked(noteKey)); }, [noteKey]);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      writeChecked(noteKey, next);
      return next;
    });
  };

  const visible = classified.filter((r) =>
    (severityFilter === "all" || r.severity === severityFilter) &&
    (categoryFilter === "all" || r.category === categoryFilter) &&
    (!onlyOpen || !checked.has(r.id))
  );

  const reviewed = classified.filter((r) => checked.has(r.id)).length;
  const pct = classified.length ? Math.round((reviewed / classified.length) * 100) : 0;

  if (classified.length === 0) {
    return <p className="text-sm text-muted-foreground">No risks extracted from this document.</p>;
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 font-medium"><ShieldCheck className="h-4 w-4 text-primary" /> Risk checklist</span>
            <Badge variant="destructive">{summary.high} high</Badge>
            <Badge variant="secondary">{summary.medium} medium</Badge>
            <Badge variant="outline">{summary.low} low</Badge>
            <Badge variant="outline" className="ml-auto">
              {summary.cited}/{summary.total} cited ({Math.round(summary.citedShare * 100)}%)
            </Badge>
          </div>
          <div className="space-y-1">
            <Progress value={pct} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground">{reviewed} of {classified.length} risks reviewed</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", "high", "medium", "low"] as const).map((s) => (
              <Button key={s} size="sm" variant={severityFilter === s ? "default" : "outline"} className="h-7 px-2 text-xs capitalize"
                onClick={() => setSeverityFilter(s)}>{s}</Button>
            ))}
            <Button size="sm" variant={categoryFilter === "all" ? "default" : "outline"} className="h-7 px-2 text-xs"
              onClick={() => setCategoryFilter("all")}>all areas</Button>
            {summary.byCategory.map((c) => (
              <Button key={c.category} size="sm" variant={categoryFilter === c.category ? "default" : "outline"} className="h-7 px-2 text-xs capitalize"
                onClick={() => setCategoryFilter(c.category)}>{c.category} ({c.count})</Button>
            ))}
            <Button size="sm" variant={onlyOpen ? "default" : "outline"} className="h-7 px-2 text-xs ml-auto"
              onClick={() => setOnlyOpen((v) => !v)}>Open only</Button>
          </div>
        </CardContent>
      </Card>

      {visible.map((r: ClassifiedRisk) => (
        <Card key={r.id} className={checked.has(r.id) ? "opacity-60" : undefined}>
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <Checkbox className="mt-1" checked={checked.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Mark "${r.title}" reviewed`} />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 ${severityStyle[r.severity]}`} />
                  <span className="text-sm font-medium">{r.title}</span>
                  <Citation citation={r.citation} sourceUrl={sourceUrl} />
                  <Badge variant="outline" className="ml-auto capitalize">{r.category}</Badge>
                  <Badge variant={severityBadge[r.severity]} className="capitalize">
                    {r.severity}{r.severityInferred ? " (inferred)" : ""}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{r.detail}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <QuoteIcon className="h-3 w-3" />
                  {r.cited ? <>Cited paragraph — {r.section}</> : <>No verbatim citation returned; verify in the source document.</>}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {visible.length === 0 && <p className="text-sm text-muted-foreground">No risks match the current filters.</p>}
    </div>
  );
}
