import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Download, Loader2, Target, Timer, TrendingDown, Users } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type EventRow = {
  event_type: string;
  user_id: string | null;
  payload: any;
  created_at: string;
};

const FUNNEL_STEPS: { key: "started" | "chosen" | "revealed" | "completed"; label: string; events: string[] }[] = [
  { key: "started",   label: "1. Started onboarding",     events: ["onboarding_start"] },
  { key: "chosen",    label: "2. Picked a ticker",        events: ["onboarding_ticker_chosen", "onboarding_auto_default"] },
  { key: "revealed",  label: "3. Saw first signal",       events: ["onboarding_signal_revealed"] },
  { key: "completed", label: "4. Completed / handed off", events: ["onboarding_complete"] },
];

const ALL = "__all__";

function pct(n: number, d: number) {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}
function fmtMs(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
function variantOf(p: any): string {
  return String(p?.variant ?? p?.experiment_variant ?? p?.flow_variant ?? "default");
}
function symbolOf(p: any): string | null {
  const s = p?.symbol;
  return s ? String(s).toUpperCase() : null;
}
function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCSV(rows: (string | number)[][]) {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}
function downloadText(name: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function bucketKey(iso: string, granularity: "hour" | "day") {
  const d = new Date(iso);
  if (granularity === "hour") d.setMinutes(0, 0, 0);
  else d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export default function OnboardingFunnel() {
  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symbolFilter, setSymbolFilter] = useState<string>(ALL);
  const [variantFilter, setVariantFilter] = useState<string>(ALL);
  const [drill, setDrill] = useState<null | { title: string; events: EventRow[] }>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("ai_event_log")
      .select("event_type,user_id,payload,created_at")
      .eq("feature", "onboarding_first_run")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(20000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setRows((data ?? []) as EventRow[]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [days]);

  // Symbol / variant option lists + a user→symbol map so filtering by symbol
  // still counts the "started" step (which has no symbol payload) for users
  // who later touched that symbol.
  const { symbolOptions, variantOptions, userSymbols } = useMemo(() => {
    const syms = new Set<string>();
    const vars = new Set<string>();
    const usym: Record<string, Set<string>> = {};
    for (const r of rows) {
      vars.add(variantOf(r.payload));
      const s = symbolOf(r.payload);
      if (s) {
        syms.add(s);
        const uid = r.user_id ?? "anon";
        (usym[uid] ??= new Set()).add(s);
      }
    }
    return { symbolOptions: [...syms].sort(), variantOptions: [...vars].sort(), userSymbols: usym };
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (variantFilter !== ALL && variantOf(r.payload) !== variantFilter) return false;
      if (symbolFilter !== ALL) {
        const s = symbolOf(r.payload);
        if (s) return s === symbolFilter;
        const uid = r.user_id ?? "anon";
        return userSymbols[uid]?.has(symbolFilter) ?? false;
      }
      return true;
    });
  }, [rows, symbolFilter, variantFilter, userSymbols]);

  const stats = useMemo(() => {
    const usersByStep: Record<string, Set<string>> = {};
    const eventsByStep: Record<string, EventRow[]> = {};
    for (const s of FUNNEL_STEPS) { usersByStep[s.key] = new Set(); eventsByStep[s.key] = []; }

    const ttfsMs: number[] = [];
    const viaCounts: Record<string, number> = {};
    const viaEvents: Record<string, EventRow[]> = {};
    const dropSymbols: Record<string, number> = {};
    const failCount = { failed: 0, retriedManually: 0, retriedAuto: 0 };

    for (const r of filteredRows) {
      const uid = r.user_id ?? "anon";
      for (const s of FUNNEL_STEPS) {
        if (s.events.includes(r.event_type)) {
          usersByStep[s.key].add(uid);
          eventsByStep[s.key].push(r);
        }
      }
      if (r.event_type === "onboarding_signal_revealed") {
        const t = Number(r.payload?.time_to_first_signal_ms);
        if (Number.isFinite(t) && t > 0) ttfsMs.push(t);
      }
      if (r.event_type === "onboarding_complete") {
        const via = String(r.payload?.via ?? "unknown");
        viaCounts[via] = (viaCounts[via] ?? 0) + 1;
        (viaEvents[via] ??= []).push(r);
      }
      if (r.event_type === "onboarding_skip_intro") {
        const step = String(r.payload?.step ?? "unknown");
        dropSymbols[`skip:${step}`] = (dropSymbols[`skip:${step}`] ?? 0) + 1;
      }
      if (r.event_type === "onboarding_signal_failed") failCount.failed++;
      if (r.event_type === "onboarding_signal_retry") {
        if (r.payload?.manual) failCount.retriedManually++;
        else failCount.retriedAuto++;
      }
    }

    const counts = FUNNEL_STEPS.map((s) => ({ key: s.key, label: s.label, users: usersByStep[s.key].size }));
    const started = counts[0].users;

    ttfsMs.sort((a, b) => a - b);
    const q = (p: number) => (ttfsMs.length ? ttfsMs[Math.min(ttfsMs.length - 1, Math.floor(ttfsMs.length * p))] : null);

    return {
      counts, started, ttfsMs,
      median: q(0.5), p90: q(0.9),
      under30s: ttfsMs.filter((t) => t <= 30_000).length,
      viaCounts, dropSymbols, failCount, eventsByStep, viaEvents,
    };
  }, [filteredRows]);

  // Trend: bucket per hour for 24h, per day otherwise.
  const trend = useMemo(() => {
    const granularity: "hour" | "day" = days <= 1 ? "hour" : "day";
    type Bucket = { started: Set<string>; chosen: Set<string>; revealed: Set<string>; completed: Set<string>; ttfs: number[] };
    const buckets: Record<string, Bucket> = {};
    const ensure = (k: string): Bucket => (buckets[k] ??= { started: new Set(), chosen: new Set(), revealed: new Set(), completed: new Set(), ttfs: [] });
    for (const r of filteredRows) {
      const uid = r.user_id ?? "anon";
      const b = ensure(bucketKey(r.created_at, granularity));
      for (const s of FUNNEL_STEPS) {
        if (s.events.includes(r.event_type)) b[s.key].add(uid);
      }
      if (r.event_type === "onboarding_signal_revealed") {
        const t = Number(r.payload?.time_to_first_signal_ms);
        if (Number.isFinite(t) && t > 0) b.ttfs.push(t);
      }
    }
    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ts, b]) => {
        const started = b.started.size;
        return {
          ts,
          label: granularity === "hour"
            ? new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" })
            : new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          started,
          picked_pct: started ? +((b.chosen.size / started) * 100).toFixed(1) : 0,
          signal_pct: started ? +((b.revealed.size / started) * 100).toFixed(1) : 0,
          complete_pct: started ? +((b.completed.size / started) * 100).toFixed(1) : 0,
          median_ttfs_s: b.ttfs.length ? +(median(b.ttfs)! / 1000).toFixed(2) : null,
        };
      });
  }, [filteredRows, days]);

  const started = stats.started;

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const totalCompletions = Object.values(stats.viaCounts).reduce((a, b) => a + b, 0);
    const lines: (string | number)[][] = [];
    lines.push([`Vela onboarding funnel — last ${days}d`]);
    lines.push([`Generated`, new Date().toISOString()]);
    lines.push([`Symbol filter`, symbolFilter === ALL ? "all" : symbolFilter]);
    lines.push([`Variant filter`, variantFilter === ALL ? "all" : variantFilter]);
    lines.push([]);
    lines.push(["KPI", "Value"]);
    lines.push(["Users started", started]);
    lines.push(["Reached signal", stats.counts[2].users]);
    lines.push(["Reached signal %", pct(stats.counts[2].users, started)]);
    lines.push(["30s success %", pct(stats.under30s, stats.ttfsMs.length)]);
    lines.push(["Median TTFS (ms)", stats.median ?? ""]);
    lines.push(["p90 TTFS (ms)", stats.p90 ?? ""]);
    lines.push([]);
    lines.push(["Step", "Users", "% of started", "Drop-off from previous"]);
    stats.counts.forEach((s, i) => {
      const prev = i === 0 ? s.users : stats.counts[i - 1].users;
      const drop = prev - s.users;
      lines.push([s.label, s.users, pct(s.users, started), i === 0 ? "" : `${drop} (${pct(drop, prev)})`]);
    });
    lines.push([]);
    lines.push(["Via", "Completions", "Share"]);
    Object.entries(stats.viaCounts).sort((a, b) => b[1] - a[1]).forEach(([via, n]) => {
      lines.push([via, n, pct(n, totalCompletions)]);
    });
    lines.push([]);
    lines.push(["Signal reliability", "Count"]);
    lines.push(["Auto-retries", stats.failCount.retriedAuto]);
    lines.push(["Manual retries", stats.failCount.retriedManually]);
    lines.push(["Failed after retries", stats.failCount.failed]);
    lines.push(["Skips", Object.values(stats.dropSymbols).reduce((a, b) => a + b, 0)]);
    lines.push([]);
    lines.push(["Trend bucket", "Started", "Picked %", "Signal %", "Complete %", "Median TTFS (s)"]);
    trend.forEach((t) => lines.push([t.ts, t.started, t.picked_pct, t.signal_pct, t.complete_pct, t.median_ttfs_s ?? ""]));
    downloadText(`onboarding-funnel-${days}d-${stamp}.csv`, toCSV(lines));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Onboarding funnel</h2>
          <p className="text-xs text-muted-foreground mt-1">
            First-run journey drop-off and time-to-first-signal metrics from <code>ai_event_log</code>.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={symbolFilter} onValueChange={setSymbolFilter}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Symbol" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All symbols</SelectItem>
              {symbolOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={variantFilter} onValueChange={setVariantFilter}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Variant" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All variants</SelectItem>
              {variantOptions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading || !!error || rows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading events…
        </div>
      ) : error ? (
        <div className="text-sm text-destructive">Couldn't load funnel: {error}</div>
      ) : filteredRows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          No onboarding events match the current filters.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile icon={<Users className="h-3.5 w-3.5" />} label="Users started" value={String(started)} />
            <KpiTile
              icon={<Target className="h-3.5 w-3.5" />}
              label="Reached signal"
              value={String(stats.counts[2].users)}
              hint={pct(stats.counts[2].users, started)}
            />
            <KpiTile
              icon={<Timer className="h-3.5 w-3.5" />}
              label="30-second success"
              value={pct(stats.under30s, stats.ttfsMs.length)}
              hint={`${stats.under30s}/${stats.ttfsMs.length} signals`}
            />
            <KpiTile
              icon={<TrendingDown className="h-3.5 w-3.5" />}
              label="Median TTFS · p90"
              value={`${fmtMs(stats.median)} · ${fmtMs(stats.p90)}`}
            />
          </div>

          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Conversion trend</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                  <Tooltip formatter={(v: any) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="picked_pct"   name="Picked ticker" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="signal_pct"   name="Saw signal"    stroke="hsl(200 80% 55%)"   dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="complete_pct" name="Completed"     stroke="hsl(142 70% 45%)"   dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <h3 className="text-sm font-semibold mt-6 mb-3">Median time-to-first-signal</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="s" />
                  <Tooltip formatter={(v: any) => (v == null ? "—" : `${v}s`)} />
                  <Line type="monotone" dataKey="median_ttfs_s" name="Median TTFS" stroke="hsl(var(--primary))" dot={{ r: 2 }} strokeWidth={2} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">
              Step-by-step funnel <span className="text-xs font-normal text-muted-foreground">(click a row to drill in)</span>
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Step</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">% of started</TableHead>
                  <TableHead className="text-right">Drop-off from previous</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.counts.map((s, i) => {
                  const prev = i === 0 ? s.users : stats.counts[i - 1].users;
                  const drop = prev - s.users;
                  return (
                    <TableRow
                      key={s.key}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setDrill({ title: `${s.label} · underlying events`, events: stats.eventsByStep[s.key] ?? [] })}
                    >
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.users}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(s.users, started)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {i === 0 ? "—" : `${drop} (${pct(drop, prev)})`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">
              Completion path (via) <span className="text-xs font-normal text-muted-foreground">(click a row to drill in)</span>
            </h3>
            {Object.keys(stats.viaCounts).length === 0 ? (
              <p className="text-xs text-muted-foreground">No completions in this window.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Path</TableHead>
                    <TableHead className="text-right">Completions</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(stats.viaCounts).sort((a, b) => b[1] - a[1]).map(([via, n]) => {
                    const total = Object.values(stats.viaCounts).reduce((a, b) => a + b, 0);
                    return (
                      <TableRow
                        key={via}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setDrill({ title: `Completions via "${via}"`, events: stats.viaEvents[via] ?? [] })}
                      >
                        <TableCell className="font-medium capitalize">{via.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-right tabular-nums">{n}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(n, total)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Signal reliability</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <MiniStat label="Auto-retries" value={stats.failCount.retriedAuto} />
              <MiniStat label="Manual retries" value={stats.failCount.retriedManually} />
              <MiniStat label="Failed after retries" value={stats.failCount.failed} tone={stats.failCount.failed > 0 ? "warn" : undefined} />
              <MiniStat label="Skips" value={Object.entries(stats.dropSymbols).reduce((a, [, n]) => a + n, 0)} />
            </div>
          </Card>
        </>
      )}

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{drill?.title}</DialogTitle>
            <DialogDescription>
              {drill?.events.length ?? 0} events · {new Set((drill?.events ?? []).map((e) => e.user_id ?? "anon")).size} unique users
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Payload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(drill?.events ?? []).slice(0, 500).map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs tabular-nums whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{e.event_type}</TableCell>
                    <TableCell className="text-xs font-mono">{(e.user_id ?? "anon").slice(0, 8)}</TableCell>
                    <TableCell className="text-xs font-mono truncate max-w-[280px]">{JSON.stringify(e.payload ?? {})}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(drill?.events.length ?? 0) > 500 && (
              <p className="text-xs text-muted-foreground mt-2">Showing first 500 of {drill?.events.length} events.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiTile({ icon, label, value, hint }: { icon?: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}
function MiniStat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-0.5 ${tone === "warn" ? "text-amber-500" : ""}`}>{value}</div>
    </div>
  );
}
