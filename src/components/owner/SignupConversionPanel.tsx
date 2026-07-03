import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, Timer, Rocket, TrendingDown } from "lucide-react";

type EventRow = {
  event_type: string;
  user_id: string | null;
  payload: any;
  created_at: string;
};

/**
 * Conversion funnel: trial signup started → onboarding completed → first core action.
 *
 * Reads `ai_event_log` entries emitted by `src/lib/signupAnalytics.ts`
 * (features `signup_funnel` and `onboarding`). Percentiles are computed on
 * the `duration_ms` payload field written by the client at each milestone.
 */

const STEPS: { key: string; label: string; events: string[]; durationFrom?: string }[] = [
  { key: "signup_started",     label: "1. Trial signup started",  events: ["trial_signup_started"] },
  { key: "signup_completed",   label: "2. Trial signup completed", events: ["trial_signup_completed"], durationFrom: "trial_signup_completed" },
  { key: "onboarding_started", label: "3. Onboarding started",    events: ["onboarding_started"] },
  { key: "onboarding_done",    label: "4. Onboarding completed",  events: ["onboarding_completed"], durationFrom: "onboarding_completed" },
  { key: "first_action",       label: "5. First core action",     events: ["first_core_action"], durationFrom: "first_core_action" },
];

function pct(n: number, d: number) {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}
function fmtMs(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

export default function SignupConversionPanel() {
  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    // Pull both features in one round-trip.
    supabase
      .from("ai_event_log")
      .select("event_type,user_id,payload,created_at")
      .in("feature", ["signup_funnel", "onboarding"])
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
    // Users per step (dedup by user_id; anonymous grouped as one bucket per event id).
    const usersByStep: Record<string, Set<string>> = {};
    for (const s of STEPS) usersByStep[s.key] = new Set();

    // Duration samples per milestone (ms).
    const durByEvent: Record<string, number[]> = {};
    // Signup failure count for context.
    let signupFailed = 0;
    // Hit-30s-goal counts for onboarding.
    let onboardingUnder30s = 0;
    let onboardingWithGoalPayload = 0;

    for (const r of rows) {
      const uid = r.user_id ?? `anon:${r.created_at}`;
      for (const s of STEPS) {
        if (s.events.includes(r.event_type)) usersByStep[s.key].add(uid);
      }
      const d = Number(r.payload?.duration_ms ?? r.payload?.time_to_first_action_ms);
      if (Number.isFinite(d) && d >= 0) {
        (durByEvent[r.event_type] ??= []).push(d);
      }
      if (r.event_type === "trial_signup_failed") signupFailed++;
      if (r.event_type === "onboarding_completed") {
        onboardingWithGoalPayload++;
        if (r.payload?.hit_30s_goal) onboardingUnder30s++;
      }
    }

    const counts = STEPS.map((s) => ({
      key: s.key,
      label: s.label,
      durationFrom: s.durationFrom,
      users: usersByStep[s.key].size,
    }));
    const started = counts[0].users;

    const durationSummary = STEPS.filter((s) => s.durationFrom).map((s) => {
      const arr = (durByEvent[s.durationFrom!] ?? []).slice().sort((a, b) => a - b);
      return {
        key: s.key,
        label: s.label,
        samples: arr.length,
        p50: percentile(arr, 0.5),
        p90: percentile(arr, 0.9),
        p95: percentile(arr, 0.95),
      };
    });

    return { counts, started, durationSummary, signupFailed, onboardingUnder30s, onboardingWithGoalPayload };
  }, [rows]);

  const started = stats.started;
  const firstAction = stats.counts[stats.counts.length - 1].users;
  const conversion = pct(firstAction, started);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Signup → activation conversion</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Trial signup → onboarding completed → first core action. Sourced from <code>ai_event_log</code> events
            emitted by <code>signupAnalytics.ts</code>.
          </p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
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
          No signup or onboarding events in the last {days} day{days === 1 ? "" : "s"}.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile icon={<Users className="h-3.5 w-3.5" />} label="Trials started" value={String(started)} />
            <KpiTile
              icon={<Rocket className="h-3.5 w-3.5" />}
              label="Activated (first action)"
              value={String(firstAction)}
              hint={conversion}
            />
            <KpiTile
              icon={<Timer className="h-3.5 w-3.5" />}
              label="Hit 30s onboarding goal"
              value={pct(stats.onboardingUnder30s, stats.onboardingWithGoalPayload)}
              hint={`${stats.onboardingUnder30s}/${stats.onboardingWithGoalPayload} completions`}
            />
            <KpiTile
              icon={<TrendingDown className="h-3.5 w-3.5" />}
              label="Signup failures"
              value={String(stats.signupFailed)}
              hint="Declines / errors"
            />
          </div>

          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Step-by-step conversion</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Step</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">% of started</TableHead>
                  <TableHead className="text-right">Step conversion</TableHead>
                  <TableHead className="text-right">Drop-off from previous</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.counts.map((s, i) => {
                  const prev = i === 0 ? s.users : stats.counts[i - 1].users;
                  const drop = Math.max(0, prev - s.users);
                  return (
                    <TableRow key={s.key}>
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.users}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(s.users, started)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {i === 0 ? "—" : pct(s.users, prev)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {i === 0 ? "—" : (
                          <span className={drop > 0 ? "text-amber-500" : "text-muted-foreground"}>
                            {drop} ({pct(drop, prev)})
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">
              Duration percentiles <span className="text-xs font-normal text-muted-foreground">(from step start to event fired)</span>
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Milestone</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                  <TableHead className="text-right">p50</TableHead>
                  <TableHead className="text-right">p90</TableHead>
                  <TableHead className="text-right">p95</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.durationSummary.map((d) => (
                  <TableRow key={d.key}>
                    <TableCell className="font-medium">{d.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.samples}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMs(d.p50)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMs(d.p90)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMs(d.p95)}</TableCell>
                  </TableRow>
                ))}
                {stats.durationSummary.every((d) => d.samples === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
                      No duration samples yet. Ensure the client is firing <code>duration_ms</code> in the
                      trial-signup, onboarding-completed and first-core-action payloads.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">signup_completed = signup start → finalize</Badge>
              <Badge variant="outline" className="text-[10px]">onboarding_completed = onboarding start → completed (target ≤ 30s)</Badge>
              <Badge variant="outline" className="text-[10px]">first_core_action = onboarding start → first meaningful action</Badge>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiTile({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {icon}{label}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {hint && <div className="text-[10px] mt-1 text-muted-foreground">{hint}</div>}
    </Card>
  );
}