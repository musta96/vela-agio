import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, Timer, Target, TrendingDown } from "lucide-react";

type EventRow = {
  event_type: string;
  user_id: string | null;
  payload: any;
  created_at: string;
};

const FUNNEL_STEPS: { key: string; label: string; events: string[] }[] = [
  { key: "started",  label: "1. Started onboarding",     events: ["onboarding_start"] },
  { key: "chosen",   label: "2. Picked a ticker",        events: ["onboarding_ticker_chosen", "onboarding_auto_default"] },
  { key: "revealed", label: "3. Saw first signal",       events: ["onboarding_signal_revealed"] },
  { key: "completed",label: "4. Completed / handed off", events: ["onboarding_complete"] },
];

function pct(n: number, d: number) {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}
function fmtMs(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function OnboardingFunnel() {
  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const stats = useMemo(() => {
    // Unique users per step (dedup by user_id when present; else by anon marker per event).
    const usersByStep: Record<string, Set<string>> = {};
    for (const s of FUNNEL_STEPS) usersByStep[s.key] = new Set();

    const ttfsMs: number[] = [];
    const viaCounts: Record<string, number> = {};
    const dropSymbols: Record<string, number> = {};
    const failCount = { failed: 0, retriedManually: 0, retriedAuto: 0 };

    for (const r of rows) {
      const uid = r.user_id ?? "anon";
      for (const s of FUNNEL_STEPS) {
        if (s.events.includes(r.event_type)) usersByStep[s.key].add(uid);
      }
      if (r.event_type === "onboarding_signal_revealed") {
        const t = Number(r.payload?.time_to_first_signal_ms);
        if (Number.isFinite(t) && t > 0) ttfsMs.push(t);
      }
      if (r.event_type === "onboarding_complete") {
        const via = String(r.payload?.via ?? "unknown");
        viaCounts[via] = (viaCounts[via] ?? 0) + 1;
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

    // Percentiles for TTFS
    ttfsMs.sort((a, b) => a - b);
    const q = (p: number) => (ttfsMs.length ? ttfsMs[Math.min(ttfsMs.length - 1, Math.floor(ttfsMs.length * p))] : null);
    const median = q(0.5);
    const p90 = q(0.9);
    const under30s = ttfsMs.filter((t) => t <= 30_000).length;

    return { counts, started, ttfsMs, median, p90, under30s, viaCounts, dropSymbols, failCount };
  }, [rows]);

  const started = stats.started;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Onboarding funnel</h2>
          <p className="text-xs text-muted-foreground mt-1">
            First-run journey drop-off and time-to-first-signal metrics from <code>ai_event_log</code>.
          </p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24 hours</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading events…
        </div>
      ) : error ? (
        <div className="text-sm text-destructive">Couldn't load funnel: {error}</div>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          No onboarding events in this window yet.
        </Card>
      ) : (
        <>
          {/* KPI tiles */}
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

          {/* Funnel table */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Step-by-step funnel</h3>
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
                    <TableRow key={s.key}>
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

          {/* Completion by "via" */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Completion path (via)</h3>
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
                  {Object.entries(stats.viaCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([via, n]) => {
                      const total = Object.values(stats.viaCounts).reduce((a, b) => a + b, 0);
                      return (
                        <TableRow key={via}>
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

          {/* Reliability */}
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