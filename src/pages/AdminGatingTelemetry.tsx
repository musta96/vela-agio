import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SEO } from "@/components/SEO";
import {
  getGatingTelemetryCounters,
  getRecentGatingMismatches,
  onGatingMismatch,
  type GatingMismatchEvent,
} from "@/lib/gating/telemetry";

/**
 * Admin/debug surface for gating-mismatch telemetry.
 *
 * Shows the recent event buffer and pipeline counters (attempted, dedupe,
 * sampling, rate-limit, emitted) with live updates driven by the
 * `vela:gating-mismatch` DOM event + a 1s poll for counter refresh.
 */
export default function AdminGatingTelemetry() {
  const [events, setEvents] = useState<readonly GatingMismatchEvent[]>(() => getRecentGatingMismatches());
  const [counters, setCounters] = useState(() => getGatingTelemetryCounters());

  useEffect(() => {
    const off = onGatingMismatch(() => {
      setEvents(getRecentGatingMismatches());
      setCounters(getGatingTelemetryCounters());
    });
    const id = window.setInterval(() => {
      setCounters(getGatingTelemetryCounters());
      setEvents(getRecentGatingMismatches());
    }, 1000);
    return () => { off(); window.clearInterval(id); };
  }, []);

  const fmt = (n: number) => n.toLocaleString();
  const stats: { label: string; value: number; tone?: string }[] = [
    { label: "Attempted", value: counters.attempted },
    { label: "Emitted", value: counters.emitted, tone: "text-primary" },
    { label: "Suppressed · dedupe", value: counters.suppressedByDedupe, tone: "text-muted-foreground" },
    { label: "Suppressed · sample", value: counters.suppressedBySample, tone: "text-muted-foreground" },
    { label: "Suppressed · rate limit", value: counters.suppressedByRateLimit, tone: "text-destructive" },
  ];

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <SEO
        title="Gating Telemetry · Admin"
        description="Recent gating-mismatch events and rate-limit counters."
        path="/admin/gating-telemetry"
      />
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Gating telemetry</h1>
        <p className="text-sm text-muted-foreground">
          Live view of <code>RouteFeatureGate</code> mismatches and the telemetry pipeline counters.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${s.tone ?? ""}`}>{fmt(s.value)}</p>
          </Card>
        ))}
      </section>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold">Recent mismatches</h2>
            <p className="text-xs text-muted-foreground">
              Deduped buffer of the last {events.length} events (max 50). Newest first.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEvents(getRecentGatingMismatches());
              setCounters(getGatingTelemetryCounters());
            }}
          >
            Refresh
          </Button>
        </div>
        {events.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            No mismatches recorded in this session. 🎉
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Pathname</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...events].reverse().map((ev, i) => (
                <TableRow key={`${ev.timestamp}-${i}`}>
                  <TableCell className="tabular-nums text-xs text-muted-foreground">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </TableCell>
                  <TableCell><code className="text-xs">{ev.pathname}</code></TableCell>
                  <TableCell><Badge variant="secondary">{ev.expectedFeature}</Badge></TableCell>
                  <TableCell><Badge variant="destructive">{ev.receivedFeature}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}