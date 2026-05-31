import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Sparkles, Loader2, MousePointerClick, ShieldAlert, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";

type EventRow = {
  id: number;
  event_type: string;
  user_id: string | null;
  payload: any;
  created_at: string;
};

const EVENT_LABELS: Record<string, string> = {
  ai_access_denied_shown: "Denied (shown)",
  ai_upgrade_cta_clicked: "Upgrade clicks",
  ai_byo_cta_clicked: "BYO clicks",
  ai_briefing_request: "Briefing requests",
  ai_briefing_error: "Briefing errors",
};

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export function AIMetricsAdmin() {
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const { data, error } = await (supabase as any)
      .from("ai_event_log")
      .select("id, event_type, user_id, payload, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[ai-metrics] load failed", error);
      setRows([]);
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of rows ?? []) t[r.event_type] = (t[r.event_type] ?? 0) + 1;
    return t;
  }, [rows]);

  const denials = totals.ai_access_denied_shown ?? 0;
  const upgradeClicks = totals.ai_upgrade_cta_clicked ?? 0;
  const byoClicks = totals.ai_byo_cta_clicked ?? 0;
  const ctr = denials > 0 ? ((upgradeClicks + byoClicks) / denials) * 100 : 0;

  const series = useMemo(() => {
    const buckets = new Map<string, Record<string, number>>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      buckets.set(d, { date: d as any, denied: 0, upgrade: 0, byo: 0, request: 0 } as any);
    }
    for (const r of rows ?? []) {
      const k = dayKey(r.created_at);
      const b = buckets.get(k);
      if (!b) continue;
      if (r.event_type === "ai_access_denied_shown") b.denied = (b.denied ?? 0) + 1;
      else if (r.event_type === "ai_upgrade_cta_clicked") b.upgrade = (b.upgrade ?? 0) + 1;
      else if (r.event_type === "ai_byo_cta_clicked") b.byo = (b.byo ?? 0) + 1;
      else if (r.event_type === "ai_briefing_request") b.request = (b.request ?? 0) + 1;
    }
    return Array.from(buckets.values());
  }, [rows, days]);

  const topReasons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows ?? []) {
      if (r.event_type !== "ai_access_denied_shown") continue;
      const reason = r.payload?.reason ?? "(unknown)";
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">AI funnel metrics</h2>
            <p className="text-xs text-muted-foreground">Denials shown, CTA clicks, and conversion from the market-briefing CTA.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[1, 7, 30].map(d => (
            <Button key={d} size="sm" variant={d === days ? "default" : "outline"} onClick={() => setDays(d)}>
              {d === 1 ? "24h" : `${d}d`}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Denials shown" value={denials} />
            <Kpi icon={<MousePointerClick className="h-3.5 w-3.5" />} label="Upgrade clicks" value={upgradeClicks} />
            <Kpi icon={<KeyRound className="h-3.5 w-3.5" />} label="BYO clicks" value={byoClicks} />
            <Kpi icon={<Sparkles className="h-3.5 w-3.5" />} label="Click-through" value={`${ctr.toFixed(1)}%`} sub={`${upgradeClicks + byoClicks} / ${denials}`} />
          </div>

          <Card className="p-5">
            <div className="text-sm font-semibold mb-3">Events per day</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" fontSize={10} />
                  <YAxis fontSize={10} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="denied" stroke="hsl(var(--destructive))" name="Denied" />
                  <Line type="monotone" dataKey="upgrade" stroke="hsl(var(--primary))" name="Upgrade" />
                  <Line type="monotone" dataKey="byo" stroke="hsl(var(--accent))" name="BYO" />
                  <Line type="monotone" dataKey="request" stroke="hsl(var(--muted-foreground))" name="Requests" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-sm font-semibold mb-3">Top denial reasons</div>
            {topReasons.length === 0 ? (
              <p className="text-xs text-muted-foreground">No denials in the selected window.</p>
            ) : (
              <div className="space-y-2">
                {topReasons.map(([reason, n]) => (
                  <div key={reason} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-foreground/90">{reason}</span>
                    <span className="tabular-nums font-mono text-muted-foreground">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="text-sm font-semibold mb-3">Recent events</div>
            <div className="space-y-1 max-h-80 overflow-auto text-[11px] font-mono">
              {(rows ?? []).slice(0, 30).map(r => (
                <div key={r.id} className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-foreground/70 shrink-0">{new Date(r.created_at).toLocaleString()}</span>
                  <span className="text-foreground shrink-0">{EVENT_LABELS[r.event_type] ?? r.event_type}</span>
                  <span className="truncate">{r.payload?.correlationId ? `cid=${r.payload.correlationId}` : ""} {r.payload?.reason ?? ""}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}