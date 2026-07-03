import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gift, TrendingDown, PowerOff, XCircle } from "lucide-react";

type Summary = {
  since: string;
  offers_shown: number;
  offers_accepted: number;
  offers_declined: number;
  accept_rate: number | null;
  cancellations: number;
  auto_downgrades: number;
  by_reason: { reason: string; count: number }[];
};

type Event = {
  id: string;
  created_at: string;
  user_id: string;
  user_email: string | null;
  event_type: string;
  reason: string | null;
  feedback: string | null;
  accepted_offer: boolean;
  metadata: Record<string, unknown> | null;
  stripe_subscription_id: string | null;
};

const REASON_LABELS: Record<string, string> = {
  too_expensive: "Too expensive",
  missing_features: "Missing a feature",
  unused: "Not using enough",
  switched_service: "Switched tool",
  too_complex: "Too complex",
  low_quality: "Low quality",
  customer_service: "Customer service",
  other: "Other",
  unspecified: "Not answered",
};

const EVENT_LABELS: Record<string, { label: string; tone: string }> = {
  retention_offer_shown: { label: "Offer shown", tone: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  retention_offer_accepted: { label: "Offer accepted", tone: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  retention_offer_declined: { label: "Offer declined", tone: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  cancellation: { label: "Cancellation", tone: "bg-destructive/10 text-destructive border-destructive/30" },
  plan_downgraded: { label: "Auto-downgrade", tone: "bg-muted text-muted-foreground border-border" },
};

export default function RetentionAuditPanel() {
  const [days, setDays] = useState<number>(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
      const [{ data: s }, { data: ev }] = await Promise.all([
        supabase.rpc("admin_retention_audit", { _since: since }),
        supabase.rpc("admin_retention_events", { _limit: 200 }),
      ]);
      if (cancelled) return;
      setSummary((s as any) ?? null);
      setEvents(((ev as any[]) ?? []) as Event[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [days]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Retention audit</h2>
          <p className="text-sm text-muted-foreground">Offer impressions, accept and decline decisions, exit-survey reasons, and automatic period-end downgrades.</p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Offers shown" value={summary?.offers_shown ?? 0} icon={<Gift className="h-4 w-4" />} />
        <Kpi label="Accepted" value={summary?.offers_accepted ?? 0} tone="text-emerald-600" />
        <Kpi label="Declined" value={summary?.offers_declined ?? 0} tone="text-amber-600" icon={<XCircle className="h-4 w-4" />} />
        <Kpi label="Accept rate" value={summary?.accept_rate != null ? `${summary.accept_rate}%` : "—"} tone="text-primary" />
        <Kpi label="Auto-downgrades" value={summary?.auto_downgrades ?? 0} icon={<PowerOff className="h-4 w-4" />} />
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">Cancellations by reason ({summary?.cancellations ?? 0} total)</div>
        </div>
        {(!summary || summary.by_reason.length === 0) ? (
          <p className="text-xs text-muted-foreground">No cancellations in this window.</p>
        ) : (
          <div className="space-y-1.5">
            {summary.by_reason.map((r) => {
              const pct = summary.cancellations ? Math.round((r.count / summary.cancellations) * 100) : 0;
              return (
                <div key={r.reason} className="flex items-center gap-3 text-xs">
                  <div className="w-40 text-muted-foreground">{REASON_LABELS[r.reason] ?? r.reason}</div>
                  <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-16 text-right tabular-nums">{r.count} ({pct}%)</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="text-sm font-medium mb-2">Recent events</div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">When</TableHead>
                <TableHead className="w-40">Event</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Reason / detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={4} className="text-xs text-muted-foreground">Loading…</TableCell></TableRow>}
              {!loading && events.length === 0 && <TableRow><TableCell colSpan={4} className="text-xs text-muted-foreground">No events yet.</TableCell></TableRow>}
              {events.map((e) => {
                const meta = EVENT_LABELS[e.event_type] ?? { label: e.event_type, tone: "bg-muted" };
                return (
                  <TableRow key={e.id}>
                    <TableCell className="text-[11px] text-muted-foreground tabular-nums">{new Date(e.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline" className={meta.tone}>{meta.label}</Badge></TableCell>
                    <TableCell className="text-xs">{e.user_email ?? e.user_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs">
                      {e.reason && <div>{REASON_LABELS[e.reason] ?? e.reason}</div>}
                      {e.feedback && <div className="text-muted-foreground italic mt-0.5">"{e.feedback}"</div>}
                      {!e.reason && !e.feedback && e.metadata && (
                        <div className="text-muted-foreground text-[11px]">{JSON.stringify(e.metadata)}</div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: number | string; tone?: string; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${tone ?? ""}`}>{value}</div>
    </Card>
  );
}