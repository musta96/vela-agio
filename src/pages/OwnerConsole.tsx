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
  const aiConfig: AiConfig = (controlByKey("ai_config")?.['value' as any] as any) || (controls.find(c => c.key === "ai_config") as any)?.value || {};

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

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Owner Console — Vela.ai" description="Internal admin" path="/owner" />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Crown className="h-7 w-7 text-amber-400" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Owner Console</h1>
            <p className="text-sm text-muted-foreground">Founder control plane. Kill switches, users, governance, compliance.</p>
          </div>
          <Badge variant="outline" className="ml-auto border-amber-400/40 text-amber-400">Confidential</Badge>
          <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<Users className="h-4 w-4" />} label="Total users" value={stats.total} sub={`${stats.confirmed} confirmed`} />
          <StatCard icon={<Activity className="h-4 w-4" />} label="Active 24h" value={stats.signedInLast24h} sub={`${stats.signedInLast7d} in 7d`} />
          <StatCard icon={<ShieldCheck className="h-4 w-4" />} label="New (7d)" value={stats.newLast7d} sub="signups" />
          <StatCard icon={<Briefcase className="h-4 w-4" />} label="Portfolios" value={stats.portfolios} sub={`${stats.holdings} holdings`} />
        </div>

        <Tabs defaultValue="kill">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="kill"><Power className="h-3.5 w-3.5 mr-1.5" />Kill switches</TabsTrigger>
            <TabsTrigger value="ai"><Bot className="h-3.5 w-3.5 mr-1.5" />AI governance</TabsTrigger>
            <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1.5" />Users</TabsTrigger>
            <TabsTrigger value="flags"><Flag className="h-3.5 w-3.5 mr-1.5" />Feature flags</TabsTrigger>
            <TabsTrigger value="comms"><Megaphone className="h-3.5 w-3.5 mr-1.5" />Comms</TabsTrigger>
            <TabsTrigger value="audit"><ScrollText className="h-3.5 w-3.5 mr-1.5" />Audit & incidents</TabsTrigger>
            <TabsTrigger value="compliance"><Scale className="h-3.5 w-3.5 mr-1.5" />Compliance</TabsTrigger>
            <TabsTrigger value="billing"><TrendingUp className="h-3.5 w-3.5 mr-1.5" />Billing</TabsTrigger>
            <TabsTrigger value="data"><Database className="h-3.5 w-3.5 mr-1.5" />Data sources</TabsTrigger>
          </TabsList>

          {/* ---------- Kill switches ---------- */}
          <TabsContent value="kill" className="mt-4 space-y-3">
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
          </TabsContent>

          {/* ---------- AI governance ---------- */}
          <TabsContent value="ai" className="mt-4 space-y-3">
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
          </TabsContent>

          {/* ---------- Users ---------- */}
          <TabsContent value="users" className="mt-4 space-y-3">
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
          </TabsContent>

          {/* ---------- Feature flags ---------- */}
          <TabsContent value="flags" className="mt-4 space-y-3">
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
          </TabsContent>

          {/* ---------- Comms / banners ---------- */}
          <TabsContent value="comms" className="mt-4 space-y-3">
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
          </TabsContent>

          {/* ---------- Audit & incidents ---------- */}
          <TabsContent value="audit" className="mt-4 space-y-3">
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
          </TabsContent>

          {/* ---------- Compliance ---------- */}
          <TabsContent value="compliance" className="mt-4 space-y-3">
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
          </TabsContent>

          {/* ---------- Billing ---------- */}
          <TabsContent value="billing" className="mt-4">
            <Card className="p-10 text-center">
              <h3 className="font-semibold mb-1">Connect a payment provider</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">Once Stripe or Paddle is enabled, MRR / ARR, churn, failed payments, refunds and per-user invoice history will land here automatically.</p>
            </Card>
          </TabsContent>

          {/* ---------- Data sources ---------- */}
          <TabsContent value="data" className="mt-4 space-y-3">
            <Card className="p-5 space-y-2">
              <h3 className="font-semibold flex items-center gap-2"><Database className="h-4 w-4" /> Provider health</h3>
              <p className="text-xs text-muted-foreground">Live market data is served by Yahoo Finance via the public CORS proxy and SnapTrade for broker positions. Use the <strong>Freeze data feeds</strong> kill switch in the Kill switches tab to halt ingestion in an emergency.</p>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
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

function UserActionsMenu({ user, act }: { user: UserRow; act: (a: string, p?: Record<string, unknown>) => Promise<boolean> }) {
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const isAdmin = user.roles?.includes("admin");
  return (
    <div className="flex items-center gap-1 justify-end">
      {user.suspended
        ? <Button size="sm" variant="outline" onClick={() => act("unsuspend_user", { user_id: user.id })}>Unsuspend</Button>
        : <Button size="sm" variant="ghost" className="gap-1" onClick={() => act("suspend_user", { user_id: user.id, reason: "Owner action" })}><Ban className="h-3.5 w-3.5" /> Suspend</Button>}
      <Button size="sm" variant="ghost" className="gap-1" onClick={() => act("force_password_reset", { email: user.email })}><Shield className="h-3.5 w-3.5" /> Reset pw</Button>
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