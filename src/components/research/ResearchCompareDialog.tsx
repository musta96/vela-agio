import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { diffWords, diffRisks, narrativeDiffs } from "@/lib/research/diff";
import { GitCompare, ArrowUp, ArrowDown, Minus, LineChart as LineChartIcon } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip,
  CartesianGrid, ReferenceLine,
} from "recharts";

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

// Extract a signed numeric magnitude from strings like "$4.2B", "12.3%", "1,234 M", "-5bps".
// Returns null if no number is present.
function parseMetricNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/-?\$?\s*[\d,]+(?:\.\d+)?/);
  if (!m) return null;
  const nStr = m[0].replace(/[$,\s]/g, "");
  let n = parseFloat(nStr);
  if (!isFinite(n)) return null;
  const lower = s.toLowerCase();
  if (/\btrillion\b|\btn\b|\bt\b(?![a-z])/i.test(s)) n *= 1e12;
  else if (/\bbillion\b|\bbn?\b(?![a-z])/i.test(s)) n *= 1e9;
  else if (/\bmillion\b|\bmm?\b(?![a-z])/i.test(s)) n *= 1e6;
  else if (/\bthousand\b|\bk\b(?![a-z])/i.test(s)) n *= 1e3;
  if (lower.includes("bps")) n = n / 100; // basis points → percent-equivalent
  return n;
}

function metricUnit(raw: unknown): string {
  const s = String(raw ?? "");
  if (s.includes("%")) return "%";
  if (s.includes("$")) return "$";
  return "";
}

function formatShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}

const guidanceScore: Record<string, number> = {
  raised: 1, reiterated: 0, none: 0, lowered: -1,
};

const sentimentScore: Record<string, number> = {
  positive: 2, "cautiously-positive": 1, neutral: 0, cautious: -1, negative: -2,
};

const guidanceIcon: Record<string, JSX.Element> = {
  raised: <ArrowUp className="h-3 w-3 text-bull" />,
  reiterated: <Minus className="h-3 w-3 text-muted-foreground" />,
  lowered: <ArrowDown className="h-3 w-3 text-bear" />,
  none: <Minus className="h-3 w-3 text-muted-foreground opacity-40" />,
};

export function ResearchCompareDialog({ open, onOpenChange, notes }: Props) {
  const sorted = useMemo(() => [...notes].sort((a, b) => new Date(a.generated_at).getTime() - new Date(b.generated_at).getTime()), [notes]);

  const latestPair = useMemo(() => ({
    previous: sorted[sorted.length - 2],
    latest: sorted[sorted.length - 1],
  }), [sorted]);
  const riskDelta = useMemo(
    () => diffRisks(latestPair.previous?.report, latestPair.latest?.report),
    [latestPair],
  );
  const narrative = useMemo(
    () => narrativeDiffs(latestPair.previous?.report, latestPair.latest?.report),
    [latestPair],
  );

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

  // Timeline dataset (guidance + sentiment) — one entry per note in chronological order.
  const timeline = useMemo(() => sorted.map((n) => ({
    id: n.id,
    label: n.source_label || (n.mode === "transcript" ? "Call" : "Filing"),
    date: new Date(n.generated_at).toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    guidance: guidanceScore[n.report?.guidance?.direction ?? "none"] ?? 0,
    guidanceLabel: n.report?.guidance?.direction ?? "none",
    sentiment: sentimentScore[n.report?.managementTone?.sentiment ?? "neutral"] ?? 0,
    sentimentLabel: n.report?.managementTone?.sentiment ?? "neutral",
  })), [sorted]);

  // Numeric metric trends — keep only labels where ≥2 notes have parseable values.
  const metricTrends = useMemo(() => {
    return metricLabels
      .map(([key, label]) => {
        const unit = (() => {
          for (const n of sorted) {
            const m = getMetric(n, key);
            if (m?.value) return metricUnit(m.value);
          }
          return "";
        })();
        const points = sorted.map((n) => {
          const m = getMetric(n, key);
          const value = parseMetricNumber(m?.value);
          return {
            date: new Date(n.generated_at).toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
            label: n.source_label || (n.mode === "transcript" ? "Call" : "Filing"),
            value,
            display: m?.value ?? null,
          };
        });
        const nonNull = points.filter((p) => p.value != null).length;
        return { key, label, unit, points, nonNull };
      })
      .filter((t) => t.nonNull >= 2)
      .sort((a, b) => b.nonNull - a.nonNull)
      .slice(0, 8);
  }, [metricLabels, sorted]);

  const yFmt = (unit: string) => (v: number) => unit === "%" ? `${v.toFixed(1)}%` : (unit === "$" ? `$${formatShort(v)}` : formatShort(v));

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
            <div className="min-w-max space-y-6">
              {/* Latest vs previous textual diff */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <GitCompare className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">What changed — latest vs previous</h3>
                  <Badge variant="outline" className="text-[10px]">
                    {latestPair.previous.source_label || new Date(latestPair.previous.generated_at).toLocaleDateString()} →{" "}
                    {latestPair.latest.source_label || new Date(latestPair.latest.generated_at).toLocaleDateString()}
                  </Badge>
                </div>

                <div className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-3">
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <Badge variant="destructive">{riskDelta.added.length} new risks</Badge>
                    <Badge variant="secondary">{riskDelta.escalated.length} escalated</Badge>
                    <Badge variant="outline">{riskDelta.deescalated.length} eased</Badge>
                    <Badge variant="outline">{riskDelta.removed.length} dropped</Badge>
                    <Badge variant="outline">{riskDelta.unchanged} unchanged</Badge>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {[
                      { label: "New risks", items: riskDelta.added.map((r) => `${r.title} (${r.severity})`), tone: "text-bear" },
                      { label: "Escalated", items: riskDelta.escalated.map((e) => `${e.risk.title}: ${e.from} → ${e.to}`), tone: "text-warning" },
                      { label: "Eased", items: riskDelta.deescalated.map((e) => `${e.risk.title}: ${e.from} → ${e.to}`), tone: "text-bull" },
                      { label: "No longer disclosed", items: riskDelta.removed.map((r) => r.title), tone: "text-muted-foreground" },
                    ].filter((g) => g.items.length > 0).map((g) => (
                      <div key={g.label}>
                        <p className={`text-xs font-medium ${g.tone}`}>{g.label}</p>
                        <ul className="ml-4 list-disc text-xs text-muted-foreground">
                          {g.items.map((t, i) => <li key={i}>{t}</li>)}
                        </ul>
                      </div>
                    ))}
                    {riskDelta.added.length + riskDelta.removed.length + riskDelta.escalated.length + riskDelta.deescalated.length === 0 && (
                      <p className="text-xs text-muted-foreground">Risk disclosure is materially unchanged between these two reports.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {narrative.map((d) => (
                    <div key={d.field} className="rounded-lg border border-border/60 bg-card/40 p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <p className="text-xs font-medium">{d.label}</p>
                        <Badge variant={d.changed ? "secondary" : "outline"} className="text-[10px]">{d.changed ? "changed" : "unchanged"}</Badge>
                      </div>
                      <p className="max-w-[70ch] whitespace-pre-wrap text-xs leading-relaxed">
                        {diffWords(d.before, d.after).map((t, i) => (
                          <span
                            key={i}
                            className={
                              t.op === "added" ? "rounded bg-bull/15 text-bull" :
                              t.op === "removed" ? "rounded bg-bear/15 text-bear line-through" : ""
                            }
                          >{t.text}</span>
                        ))}
                      </p>
                    </div>
                  ))}
                  {narrative.length === 0 && <p className="text-xs text-muted-foreground">No narrative sections available to diff.</p>}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Green = wording added in the latest report, struck red = wording dropped. Diff is textual — always confirm against the cited source.
                </p>
              </section>

              {/* Trend charts */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <LineChartIcon className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Trends over time</h3>
                  <Badge variant="outline" className="text-[10px]">{sorted.length} data points</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Guidance timeline */}
                  <div className="rounded-lg border border-border/60 p-3 bg-card/40">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium">Guidance direction</p>
                      <span className="text-[10px] text-muted-foreground">-1 lowered · 0 reiterated · +1 raised</span>
                    </div>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timeline} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis domain={[-1.2, 1.2]} ticks={[-1, 0, 1]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 4" />
                          <ReTooltip
                            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, borderRadius: 6 }}
                            formatter={(_v: any, _n: any, p: any) => [p.payload?.guidanceLabel, "Guidance"]}
                          />
                          <Line type="monotone" dataKey="guidance" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {/* Sentiment timeline */}
                  <div className="rounded-lg border border-border/60 p-3 bg-card/40">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium">Management sentiment</p>
                      <span className="text-[10px] text-muted-foreground">-2 negative … +2 positive</span>
                    </div>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timeline} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis domain={[-2.2, 2.2]} ticks={[-2, -1, 0, 1, 2]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 4" />
                          <ReTooltip
                            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, borderRadius: 6 }}
                            formatter={(_v: any, _n: any, p: any) => [String(p.payload?.sentimentLabel).replace(/-/g, " "), "Sentiment"]}
                          />
                          <Line type="monotone" dataKey="sentiment" stroke="hsl(var(--bull))" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {/* Numeric metric trends */}
                  {metricTrends.map((t) => (
                    <div key={t.key} className="rounded-lg border border-border/60 p-3 bg-card/40">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium">{t.label}</p>
                        <span className="text-[10px] text-muted-foreground">{t.nonNull}/{sorted.length} disclosed</span>
                      </div>
                      <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={t.points} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                            <YAxis tickFormatter={yFmt(t.unit)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={54} />
                            <ReTooltip
                              contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, borderRadius: 6 }}
                              formatter={(_v: any, _n: any, p: any) => [p.payload?.display ?? "-", t.label]}
                            />
                            <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ))}
                </div>
                {metricTrends.length === 0 && (
                  <p className="text-xs text-muted-foreground">No numeric metrics were disclosed in at least two selected notes — trend charts will appear as more filings are analyzed.</p>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">Metric-by-metric detail</h3>
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
              </section>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}