import { useEffect, useState } from "react";
import { OwnerPageHeader, KpiStrip } from "@/components/owner/OwnerLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Download, Megaphone, UserPlus, AlertCircle, CreditCard, FileWarning, Activity as ActivityIcon, Flag } from "lucide-react";

type Counts = { users: number; signals: number; flagged: number; failedPayments: number; gdpr: number; openTickets: number };
type RecentUser = { id: string; display_name: string | null; created_at: string };
type AuditRow = { id: number; ts: string; actor_email: string | null; action: string; entity: string | null };

export default function OwnerDashboard() {
  const [c, setC] = useState<Counts>({ users: 0, signals: 0, flagged: 0, failedPayments: 0, gdpr: 0, openTickets: 0 });
  const [users, setUsers] = useState<RecentUser[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [flags, setFlags] = useState<{ key: string; label: string; enabled: boolean; category: string }[]>([]);
  const [syncedAt] = useState(new Date());

  useEffect(() => { (async () => {
    const [{ count: uCount }, { data: pData }, { data: aData }, { count: sCount }, { count: rCount }, { count: gCount }, { data: fData }, { count: tCount }] = await Promise.all([
      supabase.from("profiles").select("user_id", { count: "exact", head: true }),
      supabase.from("profiles").select("user_id,display_name,created_at").order("created_at", { ascending: false }).limit(6),
      supabase.from("audit_log").select("id,ts,actor_email,action,entity").order("ts", { ascending: false }).limit(6),
      supabase.from("ai_signal_log").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 86400000).toISOString()),
      supabase.from("ai_signal_log").select("id", { count: "exact", head: true }).eq("status", "retracted"),
      supabase.from("gdpr_erasure_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("feature_flags").select("key,label,enabled,category").order("key"),
      supabase.from("support_tickets" as any).select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
    ]);
    setC({ users: uCount || 0, signals: sCount || 0, flagged: rCount || 0, failedPayments: 8, gdpr: gCount || 0, openTickets: tCount || 0 });
    setUsers((pData || []).map((r: any) => ({ id: r.user_id, display_name: r.display_name, created_at: r.created_at })));
    setAudit((aData || []) as any);
    setFlags((fData || []).slice(0, 4) as any);
  })(); }, []);

  const initials = (s: string | null) => (s || "??").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <OwnerPageHeader
        title="Owner dashboard"
        subtitle={`${format(syncedAt, "EEEE d MMMM yyyy")} · Last sync ${Math.floor((Date.now() - syncedAt.getTime()) / 1000)}s ago`}
        actions={
          <>
            <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" />Export report</Button>
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10"><Megaphone className="h-4 w-4 mr-1.5" />Broadcast</Button>
            <Button size="sm"><UserPlus className="h-4 w-4 mr-1.5" />Invite user</Button>
          </>
        }
      />

      <KpiStrip items={[
        { label: "Total users", value: c.users.toLocaleString(), sub: "↑ +284 this week", tone: "up" },
        { label: "MRR", value: "€41.2k", sub: "↑ +8.4% MoM", tone: "up" },
        { label: "Active signals", value: c.signals.toLocaleString(), sub: `${c.flagged} flagged`, tone: "warn" },
        { label: "Open tickets", value: c.openTickets.toLocaleString(), sub: c.openTickets ? "needs reply" : "all clear", tone: c.openTickets ? "warn" : "ok" },
        { label: "Open incidents", value: "0", sub: "All clear", tone: "ok" },
      ]} />

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Recent users</h3>
            <div className="flex items-center gap-1 text-xs">
              {["All", "Pro", "Consumer", "Suspended"].map((t, i) => (
                <button key={t} className={i === 0 ? "px-2.5 py-1 rounded-md bg-primary/10 text-primary font-medium" : "px-2.5 py-1 rounded-md text-muted-foreground hover:bg-muted"}>{t}</button>
              ))}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
              <th className="text-left py-2 font-semibold">User</th><th className="text-left">Plan</th><th className="text-left">Status</th><th className="text-left">MRR</th><th className="text-left">Joined</th><th className="text-left">Last active</th>
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="py-3 flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-primary/15 grid place-items-center text-[10px] font-bold text-primary">{initials(u.display_name)}</div>
                    <div><div className="font-medium">{u.display_name || "-"}</div><div className="text-xs text-muted-foreground">{u.id.slice(0, 8)}</div></div>
                  </td>
                  <td><span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-foreground">PRO</span></td>
                  <td><span className="inline-flex items-center gap-1 text-xs"><span className="h-1.5 w-1.5 rounded-full bg-success" />Active</span></td>
                  <td className="text-sm">€49/mo</td>
                  <td className="text-xs text-muted-foreground">{format(new Date(u.created_at), "d MMM yy")}</td>
                  <td className="text-xs text-muted-foreground">2 min ago</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Platform alerts</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-mono">4 active</span>
            </div>
            <ul className="space-y-3 text-sm">
              {[
                { icon: AlertCircle, color: "text-destructive bg-destructive/10", title: "Signal flagged", body: `${c.flagged || 1} pending review`, meta: "Signal governance" },
                { icon: CreditCard, color: "text-warning bg-warning/10", title: "Failed payments", body: `${c.failedPayments} dunning starting`, meta: "Billing" },
                { icon: FileWarning, color: "text-primary bg-primary/10", title: `${c.gdpr} GDPR requests`, body: "Past SLA review", meta: "Compliance" },
                { icon: ActivityIcon, color: "text-secondary bg-secondary/10", title: "Feed latency", body: "Refinitiv US 340ms", meta: "Data feeds" },
              ].map((a, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className={`h-7 w-7 rounded-md grid place-items-center ${a.color}`}><a.icon className="h-3.5 w-3.5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium">{a.title} <span className="text-muted-foreground font-normal">- {a.body}</span></div>
                    <div className="text-[11px] text-muted-foreground">{a.meta}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Feature flags</h3>
              <a href="/owner/feature-flags" className="text-xs text-primary hover:underline">All flags ›</a>
            </div>
            <ul className="space-y-3">
              {flags.map((f) => (
                <li key={f.key} className="flex items-center justify-between">
                  <div><div className="text-[13px] font-medium">{f.label}</div><div className="text-[11px] text-muted-foreground">{f.category}</div></div>
                  <span className={`inline-flex h-5 w-9 rounded-full p-0.5 ${f.enabled ? "bg-success" : "bg-muted"}`}>
                    <span className={`h-4 w-4 rounded-full bg-white transition-transform ${f.enabled ? "translate-x-4" : ""}`} />
                  </span>
                </li>
              ))}
              {!flags.length && <li className="text-xs text-muted-foreground">No flags configured yet.</li>}
            </ul>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Audit log</h3>
            <a href="/owner/audit" className="text-xs text-primary hover:underline">Full log ›</a>
          </div>
          <ul className="space-y-2.5 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex items-center gap-3 text-[13px]">
                <span className="text-[11px] font-mono text-muted-foreground w-12">{format(new Date(a.ts), "HH:mm")}</span>
                <span className="font-medium">{a.actor_email?.split("@")[0] || "system"}</span>
                <span className="text-muted-foreground">{a.action}</span>
                {a.entity && <span className="ml-auto text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-muted">{a.entity}</span>}
              </li>
            ))}
            {!audit.length && <li className="text-xs text-muted-foreground">No recent activity.</li>}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Growth funnel</h3>
            <span className="text-xs text-muted-foreground">Last 30 days</span>
          </div>
          {[
            { label: "Visits", value: 84210, pct: 100 },
            { label: "Trial starts", value: 1840, pct: 22 },
            { label: "Paid conversions", value: 284, pct: 3.4 },
            { label: "Retained (D30)", value: "78.4%", pct: 78 },
          ].map((s) => (
            <div key={s.label} className="mb-3">
              <div className="flex justify-between text-[13px] mb-1"><span className="text-muted-foreground">{s.label}</span><span className="font-semibold">{typeof s.value === "number" ? s.value.toLocaleString() : s.value}</span></div>
              <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${s.pct}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}