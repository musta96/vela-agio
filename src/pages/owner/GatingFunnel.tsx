import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, TrendingUp, MousePointerClick, Timer, Eye, Download, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { ROUTE_FEATURE_MAP } from "@/lib/gating/routeFeatureMap";

type FunnelRow = {
  feature: string;
  required_plan: string | null;
  views: number;
  unique_viewers: number;
  cta_clicks: number;
  unique_clickers: number;
  ctr: number | null;
  avg_dwell_ms: number | null;
  median_dwell_ms: number | null;
  upgrades: number;
  conversion_rate: number | null;
  last_view: string | null;
};

type CtaRow = {
  feature: string;
  cta: string;
  clicks: number;
  unique_clickers: number;
  share_of_feature_clicks: number | null;
  last_click: string | null;
};

const ROUTE_BY_FEATURE: Record<string, string> = Object.entries(ROUTE_FEATURE_MAP)
  .reduce((acc, [route, key]) => { acc[key] ??= route; return acc; }, {} as Record<string, string>);

const CTA_LABELS: Record<string, string> = {
  primary_upgrade: "Primary upgrade",
  see_whats_inside: "See what's inside",
  compare_plans: "Compare plans",
  plan_card_cta: "Plan card",
  close_modal: "Closed modal",
  unknown: "Unlabelled",
};

function dwell(ms: number | null) {
  if (ms == null) return "—";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
function pct(v: number | null) {
  return v == null ? "—" : `${v}%`;
}
function toneFor(v: number | null, good: number, ok: number) {
  if (v == null) return "text-muted-foreground";
  if (v >= good) return "text-success";
  if (v >= ok) return "text-amber-500";
  return "text-destructive";
}

/**
 * Internal funnel dashboard: how each gated route's upgrade screen performs
 * (views → CTA clicks → paid conversion) plus per-CTA breakdown and dwell time.
 */
export default function GatingFunnel() {
  const [days, setDays] = useState("30");
  const [rows, setRows] = useState<FunnelRow[]>([]);
  const [ctas, setCtas] = useState<CtaRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const n = Number(days);
      const [funnelRes, ctaRes, catRes] = await Promise.all([
        supabase.rpc("admin_gating_funnel" as any, { _days: n }),
        supabase.rpc("admin_gating_cta_breakdown" as any, { _days: n }),
        supabase.from("feature_catalog").select("key,name"),
      ]);
      if (funnelRes.error) throw funnelRes.error;
      setRows((funnelRes.data as FunnelRow[]) ?? []);
      setCtas((ctaRes.data as CtaRow[]) ?? []);
      const map: Record<string, string> = {};
      ((catRes.data as any[]) ?? []).forEach((r) => { map[r.key] = r.name; });
      setNames(map);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load gating funnel");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const totals = useMemo(() => {
    const views = rows.reduce((s, r) => s + Number(r.views || 0), 0);
    const clicks = rows.reduce((s, r) => s + Number(r.cta_clicks || 0), 0);
    const upgrades = rows.reduce((s, r) => s + Number(r.upgrades || 0), 0);
    const viewers = rows.reduce((s, r) => s + Number(r.unique_viewers || 0), 0);
    const dwellRows = rows.filter((r) => r.avg_dwell_ms != null);
    const avgDwell = dwellRows.length
      ? dwellRows.reduce((s, r) => s + Number(r.avg_dwell_ms), 0) / dwellRows.length
      : null;
    return {
      views, clicks, upgrades, viewers, avgDwell,
      ctr: views ? Math.round((clicks / views) * 1000) / 10 : null,
      cvr: viewers ? Math.round((upgrades / viewers) * 1000) / 10 : null,
    };
  }, [rows]);

  const best = useMemo(
    () => [...rows].filter((r) => r.views >= 1).sort((a, b) => (b.conversion_rate ?? -1) - (a.conversion_rate ?? -1))[0],
    [rows],
  );
  const worst = useMemo(
    () => [...rows].filter((r) => r.views >= 1).sort((a, b) => (a.ctr ?? 999) - (b.ctr ?? 999))[0],
    [rows],
  );

  const ctasFor = (feature: string) => ctas.filter((c) => c.feature === feature);

  const exportCsv = () => {
    const head = ["feature", "route", "required_plan", "views", "unique_viewers", "cta_clicks", "ctr_pct", "avg_dwell_ms", "median_dwell_ms", "upgrades", "conversion_pct"];
    const lines = rows.map((r) => [
      r.feature, ROUTE_BY_FEATURE[r.feature] ?? "", r.required_plan ?? "", r.views, r.unique_viewers,
      r.cta_clicks, r.ctr ?? "", r.avg_dwell_ms ?? "", r.median_dwell_ms ?? "", r.upgrades, r.conversion_rate ?? "",
    ].join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gating-funnel-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">Upgrade funnel by gated route</h2>
          <p className="text-xs text-muted-foreground">
            Views, CTA click-through, dwell time and paid conversion for every locked screen.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={<Eye className="h-3.5 w-3.5" />} label="Locked views" value={totals.views.toLocaleString()} sub={`${totals.viewers.toLocaleString()} unique`} />
        <Kpi icon={<MousePointerClick className="h-3.5 w-3.5" />} label="CTA clicks" value={totals.clicks.toLocaleString()} sub={`${pct(totals.ctr)} CTR`} />
        <Kpi icon={<Timer className="h-3.5 w-3.5" />} label="Avg dwell" value={dwell(totals.avgDwell)} sub="time on locked screen" />
        <Kpi icon={<TrendingUp className="h-3.5 w-3.5" />} label="Upgrades" value={totals.upgrades.toLocaleString()} sub={`${pct(totals.cvr)} of viewers`} />
        <Kpi
          icon={<ArrowUpRight className="h-3.5 w-3.5" />}
          label="Best performer"
          value={best ? (names[best.feature] ?? best.feature) : "—"}
          sub={best ? `${pct(best.conversion_rate)} conversion` : "no data yet"}
        />
      </div>

      {worst && (
        <Card className="p-3 border-amber-500/30 bg-amber-500/5 text-xs">
          <span className="font-semibold text-amber-500">Weakest CTA: </span>
          <span className="text-muted-foreground">
            {names[worst.feature] ?? worst.feature} converts {pct(worst.ctr)} of views into clicks
            {worst.avg_dwell_ms != null ? ` with ${dwell(worst.avg_dwell_ms)} average dwell` : ""} — try a stronger headline or a cheaper entry plan.
          </span>
        </Card>
      )}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Gated route</TableHead>
              <TableHead className="text-right">Views</TableHead>
              <TableHead className="text-right">CTA clicks</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">Avg dwell</TableHead>
              <TableHead className="text-right">Median dwell</TableHead>
              <TableHead className="text-right">Upgrades</TableHead>
              <TableHead className="text-right">Conversion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const open = selected === r.feature;
              return (
                <Fragment key={r.feature}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setSelected(open ? null : r.feature)}
                  >
                    <TableCell>
                      <div className="font-medium">{names[r.feature] ?? r.feature}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {ROUTE_BY_FEATURE[r.feature] ?? r.feature}
                        {r.required_plan && <Badge variant="outline" className="ml-2 text-[9px]">{r.required_plan}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.views}<span className="text-muted-foreground text-[10px]"> / {r.unique_viewers}u</span></TableCell>
                    <TableCell className="text-right tabular-nums">{r.cta_clicks}</TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${toneFor(r.ctr, 40, 15)}`}>{pct(r.ctr)}</TableCell>
                    <TableCell className="text-right tabular-nums">{dwell(r.avg_dwell_ms)}</TableCell>
                    <TableCell className="text-right tabular-nums">{dwell(r.median_dwell_ms)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.upgrades}</TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${toneFor(r.conversion_rate, 10, 3)}`}>{pct(r.conversion_rate)}</TableCell>
                  </TableRow>
                  {open && (
                    <TableRow key={`${r.feature}-cta`} className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={8}>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">CTA breakdown</div>
                        {ctasFor(r.feature).length === 0 ? (
                          <p className="text-xs text-muted-foreground">No CTA clicks recorded in this window.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {ctasFor(r.feature).map((c) => (
                              <div key={c.cta} className="flex items-center gap-3 text-xs">
                                <span className="w-40 shrink-0">{CTA_LABELS[c.cta] ?? c.cta}</span>
                                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full bg-primary" style={{ width: `${c.share_of_feature_clicks ?? 0}%` }} />
                                </div>
                                <span className="tabular-nums w-28 text-right text-muted-foreground">
                                  {c.clicks} clicks · {pct(c.share_of_feature_clicks)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-10">
                  No locked-screen activity in this window yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}{label}
      </div>
      <div className="text-xl font-bold tabular-nums mt-1 truncate">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}
