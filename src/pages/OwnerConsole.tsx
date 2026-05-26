import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Users, Activity, ShieldCheck, Briefcase, Crown, Power, AlertTriangle, Megaphone, Bot,
  ScrollText, Scale, FileDown, Trash2, Ban, Shield, Flag, Database, Mail, TrendingUp,
  LayoutDashboard, KeyRound, CreditCard, Wallet, AlertCircle, Search, BellRing, Settings,
  CircleDot, FileText, ChevronRight,
} from "lucide-react";

type Stats = { total: number; confirmed: number; signedInLast24h: number; signedInLast7d: number; newLast7d: number; portfolios: number; holdings: number; netWorthAccounts: number };
type UserRow = { id: string; email: string; created_at: string; last_sign_in_at: string | null; email_confirmed_at: string | null; provider?: string; portfolios: number; suspended?: boolean; roles?: string[] };
type Control = { key: string; enabled: boolean; reason: string | null; updated_at: string };
type Banner = { id: string; message: string; severity: "info"|"warning"|"critical"; active: boolean; created_at: string; expires_at: string | null };
type Signal = { id: string; user_id: string | null; signal_type: string; symbol: string | null; status: string; confidence: number | null; created_at: string; disclaimer: string | null; retracted_reason: string | null };
type Flag = { key: string; label: string; description: string | null; category: string; enabled: boolean };
type Incident = { id: number; ts: string; actor_email: string | null; category: string; action: string; reason: string | null };
type Consent = { id: string; user_id: string; tos_version: string; privacy_version: string; marketing_opt_in: boolean; accepted_at: string };
type AuditEntry = { id: number; ts: string; actor_email: string | null; action: string; entity: string | null; entity_id: string | null; payload: any };
type AiConfig = {
  min_confidence?: number;
  ticker_blacklist?: string[];
  mandatory_disclaimers?: Record<string, string>;
  rate_limits?: { free?: number; pro?: number; team?: number };
};

const KILL_SWITCHES: { key: string; label: string; description: string }[] = [
  { key: "maintenance_mode", label: "Maintenance mode", description: "Lock the entire platform. Only admins keep access." },
  { key: "ai_signals_halted", label: "Halt all AI signals", description: "Stops every AI-generated output platform-wide." },
  { key: "emails_paused", label: "Pause outbound email", description: "No transactional or marketing email is sent." },
  { key: "signups_disabled", label: "Disable new signups", description: "Existing users keep working; new registrations are blocked." },
  { key: "live_trading_disabled", label: "Block live trading", description: "Prevents any real-money order from being submitted." },
  { key: "data_feeds_frozen", label: "Freeze data feeds", description: "Stops new market data ingestion — shows stale prices." },
];

export default function OwnerConsole() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ stats: Stats; users: UserRow[]; recentAudit: any[]; controls: Control[]; banners: Banner[]; signals: Signal[]; incidents: Incident[]; flags: Flag[]; consents?: Consent[]; audit?: AuditEntry[] } | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("owner-console", { method: "GET" });
    if (error || !res) toast.error("Failed to load owner console");
    else setData(res);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    const { error } = await supabase.functions.invoke("owner-console", { body: { action, ...payload } });
    if (error) { toast.error(error.message || "Action failed"); return false; }
    toast.success("Done");
    load();
    return true;
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading owner console…</div>
    );
  }
  const { stats, users, controls, banners, signals, incidents, flags, recentAudit, consents = [], audit = [] } = data;
  const filteredUsers = users.filter((u) => !q || u.email?.toLowerCase().includes(q.toLowerCase()));
  const controlByKey = (k: string) => controls.find((c) => c.key === k);
  const aiConfig: AiConfig = ((controls.find((c) => c.key === "ai_config") as any)?.value) || {};

  const downloadAuditCsv = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/owner-console`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ action: "export_audit_csv" }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportUserData = async (user_id: string, email: string) => {
    const { data: res, error } = await supabase.functions.invoke("owner-console", { body: { action: "export_user_data", user_id } });
    if (error || !res?.bundle) return toast.error("Export failed");
    const blob = new Blob([JSON.stringify(res.bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `gdpr-export-${email}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Export ready");
  };

  // ---------- Section content blocks (reused across sidebar nav) ----------
  const killSection = (
    <div className="space-y-3">
            <Card className="p-4 border-destructive/40 bg-destructive/5">
              <div className="flex items-center gap-2 text-destructive font-semibold">
                <AlertTriangle className="h-4 w-4" /> Critical controls — changes take effect instantly for every user.
              </div>
            </Card>
            <div className="grid md:grid-cols-2 gap-3">
              {KILL_SWITCHES.map((s) => {
                const c = controlByKey(s.key);
                return (
                  <KillSwitchCard
                    key={s.key}
                    label={s.label}
                    description={s.description}
                    enabled={!!c?.enabled}
                    reason={c?.reason || ""}
                    updatedAt={c?.updated_at}
                    onToggle={(enabled, reason) => act("toggle_control", { key: s.key, enabled, reason })}
                  />
                );
              })}
            </div>
    </div>
  );
  const aiSection = (
    <div className="space-y-3">
            <AiGovernanceConfig config={aiConfig} onSave={(value) => act("set_ai_config", { value })} />
            <Card className="p-4">
              <h3 className="font-semibold flex items-center gap-2"><Bot className="h-4 w-4" /> AI signal log</h3>
              <p className="text-xs text-muted-foreground">Every AI output served to a user. Retract anything that shouldn't be live.</p>
            </Card>
            <Card>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>When</TableHead><TableHead>Type</TableHead><TableHead>Symbol</TableHead>
                  <TableHead>Confidence</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {signals.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{s.signal_type}</TableCell>
                      <TableCell className="text-xs font-mono">{s.symbol || "—"}</TableCell>
                      <TableCell className="text-xs">{s.confidence != null ? `${Math.round(s.confidence * 100)}%` : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "retracted" ? "destructive" : s.status === "flagged" ? "outline" : "secondary"} className="text-[10px]">{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {s.status !== "retracted" && (
                          <RetractDialog onConfirm={(reason) => act("retract_signal", { id: s.id, reason })} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {signals.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No AI signals logged yet. Signals will appear here as the AI gateway emits them.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
    </div>
  );
  const usersSection = (
    <div className="space-y-3">
            <Input placeholder="Search by email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
            <Card>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Email</TableHead><TableHead>Roles</TableHead><TableHead>Joined</TableHead>
                  <TableHead>Last sign-in</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium text-sm">{u.email}</TableCell>
                      <TableCell className="text-xs space-x-1">
                        {(u.roles || []).map((r) => <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>)}
                        {!u.roles?.length && <span className="text-muted-foreground">viewer</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>
                        {u.suspended ? <Badge variant="destructive" className="text-[10px]">suspended</Badge>
                          : u.email_confirmed_at ? <Badge className="bg-success/20 text-success text-[10px]">active</Badge>
                          : <Badge variant="outline" className="text-[10px]">unverified</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <UserActionsMenu user={u} act={act} onExport={() => exportUserData(u.id, u.email)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
    </div>
  );
  const flagsSection = (
    <div className="space-y-3">
            <Card>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Flag</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Enabled</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {flags.map((f) => (
                    <TableRow key={f.key}>
                      <TableCell className="text-sm font-medium">{f.label}<div className="text-[10px] text-muted-foreground font-mono">{f.key}</div></TableCell>
                      <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{f.category}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{f.description || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Switch checked={f.enabled} onCheckedChange={(v) => act("set_feature_flag", { key: f.key, label: f.label, enabled: v, category: f.category, description: f.description })} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {flags.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No feature flags configured yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
    </div>
  );
  const commsSection = (
    <div className="space-y-3">
            <Card className="p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2"><Megaphone className="h-4 w-4" /> Push announcement banner</h3>
              <BannerComposer onCreate={(message, severity) => act("create_banner", { message, severity })} />
            </Card>
            <Card>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>When</TableHead><TableHead>Severity</TableHead><TableHead>Message</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {banners.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{b.severity}</Badge></TableCell>
                      <TableCell className="text-sm">{b.message}</TableCell>
                      <TableCell>{b.active ? <Badge className="bg-success/20 text-success text-[10px]">live</Badge> : <Badge variant="outline" className="text-[10px]">ended</Badge>}</TableCell>
                      <TableCell className="text-right">{b.active && <Button size="sm" variant="ghost" onClick={() => act("deactivate_banner", { id: b.id })}>End</Button>}</TableCell>
                    </TableRow>
                  ))}
                  {banners.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No banners yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
    </div>
  );
  const auditSection = (
    <div className="space-y-3">
            <Card className="p-4 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-semibold mb-1 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Incident & audit logs</h3>
                <p className="text-xs text-muted-foreground">Immutable record of every admin action. Export for CONSOB / FCA / SEC inquiries.</p>
              </div>
              <Button size="sm" variant="outline" onClick={downloadAuditCsv} className="gap-2"><FileDown className="h-3.5 w-3.5" />Export audit log (CSV)</Button>
            </Card>
            <Card>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Category</TableHead><TableHead>Action</TableHead><TableHead>Reason</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {incidents.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-xs text-muted-foreground">{new Date(i.ts).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{i.actor_email || "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{i.category}</Badge></TableCell>
                      <TableCell className="text-xs">{i.action}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.reason || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {incidents.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No incidents logged.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold mb-2 text-sm">Audit log ({audit.length})</h3>
              <div className="space-y-1 max-h-[480px] overflow-auto">
                {audit.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs border-b border-border/40 py-1.5">
                    <span className="text-muted-foreground tabular-nums">{new Date(a.ts).toLocaleString()}</span>
                    <span className="truncate max-w-[160px]">{a.actor_email}</span>
                    <Badge variant="outline" className="text-[10px]">{a.action}</Badge>
                    <span className="text-muted-foreground truncate">{a.entity}{a.entity_id ? `/${a.entity_id.slice(0,8)}` : ""}</span>
                  </div>
                ))}
                {audit.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No audit entries yet.</p>}
              </div>
            </Card>
    </div>
  );
  const complianceSection = (
    <div className="space-y-3">
            <Card className="p-5 space-y-2">
              <h3 className="font-semibold flex items-center gap-2"><Scale className="h-4 w-4" /> GDPR & regulatory tools</h3>
              <p className="text-xs text-muted-foreground">Access (Art. 15) & portability (Art. 20) via per-user export. Erasure (Art. 17) via the Users tab. All actions are written to the immutable incident log.</p>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={downloadAuditCsv} className="gap-2"><FileDown className="h-3.5 w-3.5" />Audit log CSV (regulator-ready)</Button>
                <ForceReconsentDialog onConfirm={(version, reason) => act("force_reconsent", { version, reason })} />
              </div>
            </Card>
            <Card>
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-sm">Consent ledger ({consents.length})</h3>
                <p className="text-xs text-muted-foreground">Per-user record of accepted T&C / Privacy versions — auditable for regulators.</p>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>When</TableHead><TableHead>User</TableHead><TableHead>T&C</TableHead><TableHead>Privacy</TableHead><TableHead>Marketing</TableHead><TableHead>IP</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {consents.slice(0, 100).map((c) => {
                    const u = users.find(x => x.id === c.user_id);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs text-muted-foreground">{new Date(c.accepted_at).toLocaleString()}</TableCell>
                        <TableCell className="text-xs">{u?.email || c.user_id.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs font-mono">{c.tos_version}</TableCell>
                        <TableCell className="text-xs font-mono">{c.privacy_version}</TableCell>
                        <TableCell className="text-xs">{c.marketing_opt_in ? "yes" : "—"}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground font-mono">{(c as any).ip || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {consents.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No consents recorded yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
    </div>
  );
  const billingSection = (
    <Card className="p-10 text-center">
      <h3 className="font-semibold mb-1">Connect a payment provider</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">Once Stripe or Paddle is enabled, MRR / ARR, churn, failed payments, refunds and per-user invoice history will land here automatically.</p>
    </Card>
  );
  const dataSection = (
    <Card className="p-5 space-y-2">
      <h3 className="font-semibold flex items-center gap-2"><Database className="h-4 w-4" /> Provider health</h3>
      <p className="text-xs text-muted-foreground">Live market data is served by Yahoo Finance via the public CORS proxy and SnapTrade for broker positions. Use the <strong>Freeze data feeds</strong> kill switch in the dashboard to halt ingestion in an emergency.</p>
    </Card>
  );
  const stubSection = (label: string, blurb: string) => (
    <Card className="p-10 text-center">
      <h3 className="font-semibold mb-1">{label}</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{blurb}</p>
    </Card>
  );

  // ---------- Dashboard (mockup) ----------
  const platformAlerts = [
    ...(signals.filter(s => (s.confidence ?? 1) < 0.4 || s.status === "flagged").slice(0, 3).map(s => ({
      icon: <Bot className="h-4 w-4 text-amber-500" />, kind: "Signal governance",
      title: `AI signal flagged — Low confidence (${s.confidence != null ? s.confidence.toFixed(2) : "—"}) on ${s.symbol || "?"}.`,
      cta: "Review", section: "ai" as const, when: s.created_at,
    })),
    ...incidents.slice(0, 2).map(i => ({
      icon: <AlertCircle className="h-4 w-4 text-amber-500" />, kind: i.category,
      title: `${i.action}${i.reason ? ` — ${i.reason}` : ""}`, cta: "View", section: "audit" as const, when: i.ts,
    })),
  ].slice(0, 5);
  const activeAlerts = platformAlerts.length;
  const flagsOff = flags.filter(f => !f.enabled).length;
  const liveSignalsToday = signals.filter(s => Date.now() - new Date(s.created_at).getTime() < 86400_000).length;
  const flaggedSignals = signals.filter(s => s.status === "flagged" || (s.confidence ?? 1) < (aiConfig.min_confidence ?? 0.6)).length;
  const openIncidents = controls.filter(c => c.enabled && c.key !== "ai_config" && c.key !== "required_consent_version").length;
  const pendingGdpr = 0; // wire to gdpr_requests when available

  const dashboardSection = (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Owner dashboard</h1>
          <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · Last sync just now</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadAuditCsv} className="gap-2"><FileDown className="h-3.5 w-3.5" />Export report</Button>
          <Button variant="outline" size="sm" onClick={() => setSection("comms")} className="gap-2"><Megaphone className="h-3.5 w-3.5" />Broadcast message</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiTile label="Total users" value={stats.total.toLocaleString()} delta={`+${stats.newLast7d} this week`} deltaTone="up" />
        <KpiTile label="Active 24h" value={stats.signedInLast24h.toLocaleString()} delta={`${stats.signedInLast7d} in 7d`} />
        <KpiTile label="Active signals today" value={liveSignalsToday.toLocaleString()} delta={`${flaggedSignals} flagged`} deltaTone={flaggedSignals ? "warn" : undefined} />
        <KpiTile label="Portfolios" value={stats.portfolios.toLocaleString()} delta={`${stats.holdings} holdings`} />
        <KpiTile label="Open incidents" value={String(openIncidents)} delta={openIncidents ? "Investigate" : "All clear"} deltaTone={openIncidents ? "warn" : "up"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* User management — spans 2 cols */}
        <Card className="lg:col-span-2 p-0 overflow-hidden">
          <div className="p-4 flex items-center justify-between flex-wrap gap-2 border-b border-border">
            <h3 className="font-semibold">User management</h3>
            <span className="text-xs text-muted-foreground">{filteredUsers.length.toLocaleString()} users</span>
          </div>
          <div className="p-4 pt-3">
            <Input placeholder="Search by email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md mb-3" />
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">User</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Joined</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Last active</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredUsers.slice(0, 12).map((u) => (
                    <TableRow key={u.id} className="cursor-pointer" onClick={() => setSection("users")}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">{(u.email || "?").slice(0,2).toUpperCase()}</div>
                          <div>
                            <div className="text-sm font-medium leading-tight">{u.email}</div>
                            <div className="text-[10px] text-muted-foreground">{(u.roles || ["viewer"])[0]}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.suspended
                          ? <span className="inline-flex items-center gap-1 text-xs text-destructive"><CircleDot className="h-2.5 w-2.5 fill-destructive" />Suspended</span>
                          : u.email_confirmed_at
                            ? <span className="inline-flex items-center gap-1 text-xs text-success"><CircleDot className="h-2.5 w-2.5 fill-success" />Active</span>
                            : <span className="inline-flex items-center gap-1 text-xs text-amber-500"><CircleDot className="h-2.5 w-2.5 fill-amber-500" />Trial</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.last_sign_in_at ? relTime(u.last_sign_in_at) : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {filteredUsers.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-xs">No users.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>

        {/* Right column */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Platform alerts</h3>
              <Badge variant="outline" className="text-[10px]">{activeAlerts} active</Badge>
            </div>
            <div className="space-y-3">
              {platformAlerts.length === 0 && <p className="text-xs text-muted-foreground">No active alerts. All systems nominal.</p>}
              {platformAlerts.map((a, i) => (
                <div key={i} className="flex items-start gap-2 pb-3 border-b border-border/40 last:border-0 last:pb-0">
                  <div className="mt-0.5">{a.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-snug">{a.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{a.kind} · {relTime(a.when)}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setSection(a.section)}>{a.cta}</Button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Feature flags</h3>
              <button className="text-[10px] text-primary hover:underline" onClick={() => setSection("flags")}>Manage all ›</button>
            </div>
            <div className="space-y-3">
              {flags.slice(0, 5).map((f) => (
                <div key={f.key} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{f.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{f.category}</div>
                  </div>
                  <Switch checked={f.enabled} onCheckedChange={(v) => act("set_feature_flag", { key: f.key, label: f.label, enabled: v, category: f.category, description: f.description })} />
                </div>
              ))}
              {flags.length === 0 && <p className="text-xs text-muted-foreground">No flags configured yet.</p>}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Revenue · MRR</h3>
            <Badge variant="outline" className="text-[10px]">soon</Badge>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><div className="text-[10px] text-muted-foreground uppercase">ARR</div><div className="font-semibold tabular-nums">—</div></div>
            <div><div className="text-[10px] text-muted-foreground uppercase">Churn $</div><div className="font-semibold tabular-nums">—</div></div>
            <div><div className="text-[10px] text-muted-foreground uppercase">New MRR</div><div className="font-semibold tabular-nums">—</div></div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">Wire Stripe / Paddle to populate revenue charts.</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">AI signal governance</h3>
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setSection("ai")}>Configure</Button>
          </div>
          <div className="space-y-2 text-xs">
            <DashRow label="Confidence threshold" value={`≥ ${(aiConfig.min_confidence ?? 0.6).toFixed(2)}`} />
            <DashRow label="Signals generated today" value={liveSignalsToday.toLocaleString()} />
            <DashRow label="Suppressed (low confidence)" value={String(flaggedSignals)} tone="warn" />
            <DashRow label="Blacklisted instruments" value={String((aiConfig.ticker_blacklist || []).length)} />
            <DashRow label="Disclaimer types" value={String(Object.keys(aiConfig.mandatory_disclaimers || {}).length)} />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Audit log</h3>
            <button className="text-[10px] text-primary hover:underline" onClick={() => setSection("audit")}>Full log ›</button>
          </div>
          <div className="space-y-2">
            {audit.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-center justify-between text-[11px] py-1 border-b border-border/40 last:border-0">
                <div className="min-w-0 truncate">
                  <span className="text-muted-foreground tabular-nums mr-2">{relTime(a.ts)}</span>
                  <span className="truncate">{a.actor_email?.split("@")[0] || "system"}</span>
                  <span className="text-muted-foreground"> · {a.action}</span>
                </div>
                <Badge variant="outline" className="text-[9px] ml-2">{(a.entity || "").slice(0, 12)}</Badge>
              </div>
            ))}
            {audit.length === 0 && <p className="text-[11px] text-muted-foreground">No actions yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );

  const SECTIONS: Record<string, React.ReactNode> = {
    dashboard: dashboardSection,
    kill: killSection,
    users: usersSection,
    roles: stubSection("Roles & access", "Granular roles, IP allowlisting, SSO/OAuth provider management and API key issuance."),
    apikeys: stubSection("API keys", "Per-user API key issuance, revocation, and rate-limit overrides."),
    plans: stubSection("Plans & pricing", "Tiers, entitlements, coupons and trial configuration land here once billing is connected."),
    revenue: billingSection,
    failed: stubSection("Failed payments", "Dunning queue and manual retry triggers appear once a payment provider is connected."),
    flags: flagsSection,
    audit: auditSection,
    comms: commsSection,
    ai: aiSection,
    data: dataSection,
    gdpr: complianceSection,
    legal: stubSection("Legal documents", "Maintain T&C / privacy / risk-disclosure versions. Use Compliance › Force re-consent to require acceptance."),
  };

  return (
    <div className="min-h-screen bg-background flex">
      <SEO title="Owner Console — Vela.ai" description="Internal admin" path="/owner" />
      <OwnerSidebar
        section={section}
        setSection={setSection}
        flagsOff={flagsOff}
        signalAlerts={flaggedSignals}
        gdprPending={pendingGdpr}
        onKill={() => setSection("kill")}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b border-border flex items-center px-4 gap-3 sticky top-0 bg-background/95 backdrop-blur z-10">
          <div className="relative flex-1 max-w-xl">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users, logs, signals…" className="pl-9 h-9" />
          </div>
          <Badge variant="outline" className={`gap-1.5 ${openIncidents ? "border-amber-400/40 text-amber-500" : "border-success/40 text-success"}`}>
            <CircleDot className={`h-2 w-2 fill-current`} />
            {openIncidents ? `${openIncidents} kill switch${openIncidents === 1 ? "" : "es"} active` : "All systems operational"}
          </Badge>
          <Button variant="ghost" size="icon" className="relative" onClick={() => setSection("comms")}>
            <BellRing className="h-4 w-4" />
            {activeAlerts > 0 && <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[9px] rounded-full bg-amber-500 text-background font-bold flex items-center justify-center">{activeAlerts}</span>}
          </Button>
          <Button variant="ghost" size="icon" onClick={load}><Settings className="h-4 w-4" /></Button>
        </header>
        <main className="flex-1 p-6 overflow-auto">{SECTIONS[section] || dashboardSection}</main>
      </div>
    </div>
  );
}

// ----- Dashboard helpers -----
function KpiTile({ label, value, delta, deltaTone }: { label: string; value: string; delta?: string; deltaTone?: "up" | "warn" }) {
  const tone = deltaTone === "up" ? "text-success" : deltaTone === "warn" ? "text-amber-500" : "text-muted-foreground";
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {delta && <div className={`text-[10px] mt-1 ${tone}`}>{delta}</div>}
    </Card>
  );
}
function DashRow({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium tabular-nums ${tone === "warn" ? "text-amber-500" : ""}`}>{value}</span>
    </div>
  );
}
function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function OwnerSidebar({ section, setSection, flagsOff, signalAlerts, gdprPending, onKill }: { section: string; setSection: (s: any) => void; flagsOff: number; signalAlerts: number; gdprPending: number; onKill: () => void }) {
  const groups: { label: string; items: { key: string; label: string; icon: React.ReactNode; badge?: string | number }[] }[] = [
    { label: "Overview", items: [
      { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
      { key: "audit", label: "Live activity", icon: <Activity className="h-3.5 w-3.5" /> },
    ]},
    { label: "Users", items: [
      { key: "users", label: "All users", icon: <Users className="h-3.5 w-3.5" /> },
      { key: "roles", label: "Roles & access", icon: <Shield className="h-3.5 w-3.5" /> },
      { key: "apikeys", label: "API keys", icon: <KeyRound className="h-3.5 w-3.5" /> },
    ]},
    { label: "Billing", items: [
      { key: "plans", label: "Plans & pricing", icon: <CreditCard className="h-3.5 w-3.5" /> },
      { key: "revenue", label: "Revenue", icon: <Wallet className="h-3.5 w-3.5" /> },
      { key: "failed", label: "Failed payments", icon: <AlertCircle className="h-3.5 w-3.5" /> },
    ]},
    { label: "Platform", items: [
      { key: "flags", label: "Feature flags", icon: <Flag className="h-3.5 w-3.5" />, badge: flagsOff ? `${flagsOff} off` : undefined },
      { key: "audit", label: "Audit logs", icon: <ScrollText className="h-3.5 w-3.5" /> },
      { key: "comms", label: "Comms & CRM", icon: <Mail className="h-3.5 w-3.5" /> },
    ]},
    { label: "AI & data", items: [
      { key: "ai", label: "Signal governance", icon: <Bot className="h-3.5 w-3.5" />, badge: signalAlerts || undefined },
      { key: "data", label: "Data feeds", icon: <Database className="h-3.5 w-3.5" /> },
    ]},
    { label: "Compliance", items: [
      { key: "gdpr", label: "GDPR requests", icon: <Scale className="h-3.5 w-3.5" />, badge: gdprPending || undefined },
      { key: "legal", label: "Legal documents", icon: <FileText className="h-3.5 w-3.5" /> },
    ]},
  ];
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card/30 flex flex-col">
      <div className="h-14 border-b border-border flex items-center gap-2 px-4">
        <Crown className="h-5 w-5 text-amber-400" />
        <span className="font-semibold tracking-tight">Vela<span className="text-muted-foreground">.ai</span></span>
        <Badge variant="outline" className="ml-1 text-[9px] border-amber-400/40 text-amber-500">OWNER</Badge>
      </div>
      <div className="p-3">
        <button onClick={onKill} className="w-full h-10 rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive font-semibold text-xs flex items-center justify-center gap-2 transition border border-destructive/30">
          <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          Global kill switch
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-4">
        {groups.map(g => (
          <div key={g.label}>
            <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground px-2 py-1.5">{g.label}</div>
            <div className="space-y-0.5">
              {g.items.map(it => {
                const active = section === it.key;
                return (
                  <button key={it.key + g.label} onClick={() => setSection(it.key)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition ${active ? "bg-primary/10 text-primary font-medium" : "text-foreground/80 hover:bg-muted/50"}`}>
                    {it.icon}
                    <span className="flex-1 text-left">{it.label}</span>
                    {it.badge != null && <Badge variant="outline" className="text-[9px] h-4 px-1.5">{it.badge}</Badge>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-border text-[10px] text-muted-foreground">
        <div className="font-medium text-foreground">Owner access</div>
        <div>All permissions · 2FA active</div>
      </div>
    </aside>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </Card>
  );
}

function KillSwitchCard({ label, description, enabled, reason, updatedAt, onToggle }: { label: string; description: string; enabled: boolean; reason: string; updatedAt?: string; onToggle: (enabled: boolean, reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draftReason, setDraftReason] = useState(reason);
  const tone = enabled ? "border-destructive/40 bg-destructive/5" : "";
  return (
    <Card className={`p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-sm flex items-center gap-2">
            {enabled && <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />} {label}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
          {updatedAt && <p className="text-[10px] text-muted-foreground mt-2">Last change {new Date(updatedAt).toLocaleString()}{reason ? ` — “${reason}”` : ""}</p>}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Switch checked={enabled} onClick={(e) => { e.preventDefault(); setOpen(true); }} />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{enabled ? "Disable" : "Enable"} — {label}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{description}</p>
            <Textarea placeholder="Reason (recorded in incident log)" value={draftReason} onChange={(e) => setDraftReason(e.target.value)} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant={enabled ? "outline" : "destructive"} onClick={() => { onToggle(!enabled, draftReason); setOpen(false); }}>
                {enabled ? "Turn off" : "Activate now"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}

function RetractDialog({ onConfirm }: { onConfirm: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="text-destructive">Retract</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Retract AI signal</DialogTitle></DialogHeader>
        <Textarea placeholder="Why is this being retracted?" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => { onConfirm(reason); setOpen(false); }}>Retract</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BannerComposer({ onCreate }: { onCreate: (message: string, severity: "info"|"warning"|"critical") => void }) {
  const [msg, setMsg] = useState("");
  const [sev, setSev] = useState<"info"|"warning"|"critical">("info");
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <Input placeholder="Banner message shown to every user" value={msg} onChange={(e) => setMsg(e.target.value)} />
      <Select value={sev} onValueChange={(v) => setSev(v as any)}>
        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="info">Info</SelectItem>
          <SelectItem value="warning">Warning</SelectItem>
          <SelectItem value="critical">Critical</SelectItem>
        </SelectContent>
      </Select>
      <Button onClick={() => { if (msg.trim()) { onCreate(msg.trim(), sev); setMsg(""); } }}>Publish</Button>
    </div>
  );
}

function UserActionsMenu({ user, act, onExport }: { user: UserRow; act: (a: string, p?: Record<string, unknown>) => Promise<boolean>; onExport: () => void }) {
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const isAdmin = user.roles?.includes("admin");
  return (
    <div className="flex items-center gap-1 justify-end">
      {user.suspended
        ? <Button size="sm" variant="outline" onClick={() => act("unsuspend_user", { user_id: user.id })}>Unsuspend</Button>
        : <Button size="sm" variant="ghost" className="gap-1" onClick={() => act("suspend_user", { user_id: user.id, reason: "Owner action" })}><Ban className="h-3.5 w-3.5" /> Suspend</Button>}
      <Button size="sm" variant="ghost" className="gap-1" onClick={() => act("force_password_reset", { email: user.email })}><Shield className="h-3.5 w-3.5" /> Reset pw</Button>
      <Button size="sm" variant="ghost" className="gap-1" onClick={onExport}><FileDown className="h-3.5 w-3.5" /> Export</Button>
      {isAdmin
        ? <Button size="sm" variant="ghost" onClick={() => act("revoke_role", { user_id: user.id, role: "admin" })}>Revoke admin</Button>
        : <Button size="sm" variant="ghost" onClick={() => act("grant_role", { user_id: user.id, role: "admin" })}>Make admin</Button>}
      <Dialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <DialogTrigger asChild><Button size="sm" variant="ghost" className="text-destructive gap-1"><Trash2 className="h-3.5 w-3.5" /> Erase</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>GDPR right to erasure</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This permanently deletes <strong>{user.email}</strong> and all their data across the platform. This cannot be undone.</p>
          <Textarea placeholder="Reason (e.g. user request ticket #)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPurgeOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { act("purge_user_data", { user_id: user.id, reason }); setPurgeOpen(false); }}>Erase permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AiGovernanceConfig({ config, onSave }: { config: AiConfig; onSave: (value: AiConfig) => void }) {
  const [minConf, setMinConf] = useState<string>(String(config.min_confidence ?? 0.6));
  const [blacklist, setBlacklist] = useState<string>((config.ticker_blacklist || []).join(", "));
  const [disclaimers, setDisclaimers] = useState<string>(JSON.stringify(config.mandatory_disclaimers || { briefing: "Not investment advice.", trade_signal: "Not investment advice. Do your own research." }, null, 2));
  const [rateFree, setRateFree] = useState<string>(String(config.rate_limits?.free ?? 5));
  const [ratePro, setRatePro] = useState<string>(String(config.rate_limits?.pro ?? 50));
  const [rateTeam, setRateTeam] = useState<string>(String(config.rate_limits?.team ?? 500));
  const save = () => {
    let parsedDisclaimers: Record<string, string> = {};
    try { parsedDisclaimers = JSON.parse(disclaimers); } catch { toast.error("Disclaimers must be valid JSON"); return; }
    onSave({
      min_confidence: Number(minConf) || 0,
      ticker_blacklist: blacklist.split(",").map(t => t.trim().toUpperCase()).filter(Boolean),
      mandatory_disclaimers: parsedDisclaimers,
      rate_limits: { free: Number(rateFree) || 0, pro: Number(ratePro) || 0, team: Number(rateTeam) || 0 },
    });
  };
  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2"><Bot className="h-4 w-4" /> AI signal governance</h3>
        <p className="text-xs text-muted-foreground">Liability surface. Every knob is read by the AI gateway on each request.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Minimum confidence (0–1)</label>
          <Input value={minConf} onChange={(e) => setMinConf(e.target.value)} placeholder="0.6" />
          <p className="text-[10px] text-muted-foreground">Signals below this are suppressed before reaching users.</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Ticker blacklist (comma-separated)</label>
          <Input value={blacklist} onChange={(e) => setBlacklist(e.target.value)} placeholder="GME, AMC, ..." />
          <p className="text-[10px] text-muted-foreground">No AI signals will be generated for these instruments.</p>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium">Mandatory disclaimers per signal type (JSON)</label>
          <Textarea value={disclaimers} onChange={(e) => setDisclaimers(e.target.value)} className="font-mono text-xs min-h-[120px]" />
          <p className="text-[10px] text-muted-foreground">Keys are signal_type names; values are appended to every output of that type.</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Rate limit / user / day — Free</label>
          <Input value={rateFree} onChange={(e) => setRateFree(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Rate limit — Pro</label>
          <Input value={ratePro} onChange={(e) => setRatePro(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Rate limit — Team</label>
          <Input value={rateTeam} onChange={(e) => setRateTeam(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={save}>Save AI config</Button>
      </div>
    </Card>
  );
}

function ForceReconsentDialog({ onConfirm }: { onConfirm: (version: string, reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-2"><Scale className="h-3.5 w-3.5" />Force re-consent</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Force all users to re-accept legal terms</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Bumps the required consent version. On next visit, every user will see the consent banner again until they accept.</p>
        <Input placeholder="Version (e.g. 2026-05-26)" value={version} onChange={(e) => setVersion(e.target.value)} />
        <Textarea placeholder="Reason (recorded in incident log)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { onConfirm(version, reason); setOpen(false); }}>Publish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}