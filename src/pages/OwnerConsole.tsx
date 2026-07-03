import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { PlansEditor } from "@/components/owner/PlansEditor";
import BillingSettingsPanel from "@/components/owner/BillingSettingsPanel";
import EnterpriseLeadsPanel from "@/components/owner/EnterpriseLeadsPanel";
import { LegalDocsEditor } from "@/components/owner/LegalDocsEditor";
import { LandingEditor } from "@/components/owner/LandingEditor";
import { ApiKeysAdmin } from "@/components/owner/ApiKeysAdmin";
import { AiAccessAdmin } from "@/components/owner/AiAccessAdmin";
import { AIMetricsAdmin } from "@/components/owner/AIMetricsAdmin";
import OwnerTickets from "@/pages/owner/Tickets";
import OwnerBlogAdmin from "@/pages/owner/BlogAdmin";
import OwnerFeatureCatalogPage from "@/pages/owner/FeatureCatalogPage";
import OwnerReferralsPage from "@/pages/owner/Referrals";
import OwnerSecurityAudit from "@/pages/owner/SecurityAudit";
import OwnerOnboardingFunnel from "@/pages/owner/OnboardingFunnel";
import { EmailRevealProvider, EmailRevealToggle, MaskedEmail } from "@/components/owner/MaskedEmail";
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
import RevenueDashboard from "@/components/owner/RevenueDashboard";
import { toast } from "sonner";
import {
  Users, Activity, ShieldCheck, Briefcase, Crown, Power, AlertTriangle, Megaphone, Bot,
  ScrollText, Scale, FileDown, Trash2, Ban, Shield, Flag, Database, Mail, TrendingUp,
  LayoutDashboard, KeyRound, CreditCard, Wallet, AlertCircle, Search, BellRing, Settings,
  CircleDot, FileText, ChevronRight, Eye, Heart, Clock, Zap, X, Sparkles, LifeBuoy,
  ListChecks, Gift,
} from "lucide-react";

type Stats = { total: number; confirmed: number; signedInLast24h: number; signedInLast7d: number; newLast7d: number; portfolios: number; holdings: number; netWorthAccounts: number };
type UserRow = { id: string; email: string; created_at: string; last_sign_in_at: string | null; email_confirmed_at: string | null; provider?: string; portfolios: number; suspended?: boolean; roles?: string[]; display_name?: string | null; avatar_url?: string | null };
type Control = { key: string; enabled: boolean; reason: string | null; updated_at: string };
type Banner = { id: string; message: string; severity: "info"|"warning"|"critical"; active: boolean; created_at: string; expires_at: string | null };
type Signal = { id: string; user_id: string | null; signal_type: string; symbol: string | null; status: string; confidence: number | null; created_at: string; disclaimer: string | null; retracted_reason: string | null };
type Flag = { key: string; label: string; description: string | null; category: string; enabled: boolean };
type Incident = { id: number; ts: string; actor_email: string | null; category: string; action: string; reason: string | null };
type Consent = { id: string; user_id: string; tos_version: string; privacy_version: string; marketing_opt_in: boolean; accepted_at: string };
type AuditEntry = { id: number; ts: string; actor_email: string | null; action: string; entity: string | null; entity_id: string | null; payload: any };
type ErasureReq = { id: string; user_id: string; user_email: string | null; reason: string | null; status: string; scheduled_for: string; completed_at: string | null; certificate_url: string | null; created_at: string; requested_by_email: string | null };
type AdminSession = { id: string; actor_email: string; target_email: string | null; purpose: string; created_at: string; expires_at: string };
type HealthCheck = { service: string; status: string; latency_ms: number | null; detail: string | null; last_checked: string };
type LegalDoc = { id: string; kind: string; version: string; title: string; body: string; status: "draft" | "published" | "archived"; published_at: string | null; created_at: string; updated_at: string };
type ApiKey = { id: string; user_id: string; provider: string; hint: string | null; created_at: string; updated_at: string };

const ALL_ROLES = ["admin", "support", "compliance", "engineer", "analyst", "pm", "viewer"] as const;
type Role = typeof ALL_ROLES[number];
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
  { key: "data_feeds_frozen", label: "Freeze data feeds", description: "Stops new market data ingestion - shows stale prices." },
];

const OWNER_ROUTE_SECTIONS: Record<string, string> = {
  "/owner/dashboard": "dashboard",
  "/owner/activity": "audit",
  "/owner/users": "users",
  "/owner/roles": "roles",
  "/owner/api-keys": "apikeys",
  "/owner/plans": "plans",
  "/owner/billing-settings": "billing-settings",
  "/owner/feature-catalog": "feature-catalog",
  "/owner/referrals": "referrals",
  "/owner/revenue": "revenue",
  "/owner/failed-payments": "failed",
  "/owner/feature-flags": "flags",
  "/owner/audit": "audit",
  "/owner/comms": "comms",
  "/owner/content": "landing",
  "/owner/blog": "blog",
  "/owner/tickets": "tickets",
  "/owner/signals": "ai",
  "/owner/data-feeds": "data",
  "/owner/gdpr": "gdpr",
  "/owner/legal": "legal",
  "/owner/security": "security",
  "/owner/onboarding-funnel": "onboarding-funnel",
  "/owner/enterprise-leads": "enterprise-leads",
};

// Canonical route per section (reverse of OWNER_ROUTE_SECTIONS, first wins).
const OWNER_SECTION_ROUTES: Record<string, string> = {
  dashboard: "/owner/dashboard",
  audit: "/owner/audit",
  users: "/owner/users",
  roles: "/owner/roles",
  apikeys: "/owner/api-keys",
  plans: "/owner/plans",
  "billing-settings": "/owner/billing-settings",
  "feature-catalog": "/owner/feature-catalog",
  referrals: "/owner/referrals",
  revenue: "/owner/revenue",
  failed: "/owner/failed-payments",
  flags: "/owner/feature-flags",
  comms: "/owner/comms",
  landing: "/owner/content",
  blog: "/owner/blog",
  tickets: "/owner/tickets",
  ai: "/owner/signals",
  ai_access: "/owner",
  ai_metrics: "/owner",
  data: "/owner/data-feeds",
  gdpr: "/owner/gdpr",
  legal: "/owner/legal",
};
// Extra sections registered after the initial map:
(OWNER_SECTION_ROUTES as any).security = "/owner/security";
(OWNER_SECTION_ROUTES as any)["onboarding-funnel"] = "/owner/onboarding-funnel";
(OWNER_SECTION_ROUTES as any)["enterprise-leads"] = "/owner/enterprise-leads";

export default function OwnerConsole() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ stats: Stats; users: UserRow[]; recentAudit: any[]; controls: Control[]; banners: Banner[]; signals: Signal[]; incidents: Incident[]; flags: Flag[]; consents?: Consent[]; audit?: AuditEntry[]; erasure?: ErasureReq[]; sessions?: AdminSession[]; health?: HealthCheck[]; legal?: LegalDoc[]; apiKeys?: ApiKey[] } | null>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [lastSignInFilter, setLastSignInFilter] = useState<string>("any");
  const [section, setSection] = useState<string>("dashboard");
  const [auditFilter, setAuditFilter] = useState("");
  const [detailUser, setDetailUser] = useState<UserRow | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [liveEvents, setLiveEvents] = useState<AuditEntry[]>([]);
  const [openTickets, setOpenTickets] = useState<number>(0);
  const location = useLocation();
  const navigate = useNavigate();

  const setOwnerSection = useCallback((nextSection: string) => {
    setSection(nextSection);
    const target = OWNER_SECTION_ROUTES[nextSection] ?? "/owner";
    if (location.pathname !== target) navigate(target, { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    const routeSection = OWNER_ROUTE_SECTIONS[location.pathname];
    if (routeSection) setSection(routeSection);
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      const { count } = await supabase
        .from("support_tickets" as any)
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]);
      if (!cancelled) setOpenTickets(count ?? 0);
    };
    fetchCount();
    const id = setInterval(fetchCount, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("owner-console", { method: "GET" });
    if (error || !res) toast.error("Failed to load owner console");
    else setData(res);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Realtime audit stream
  useEffect(() => {
    const ch = supabase.channel(`owner-live-${Math.random().toString(36).slice(2)}`);
    ch.on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "audit_log" }, (p: any) => {
      setLiveEvents((prev) => [p.new as AuditEntry, ...prev].slice(0, 200));
    }).on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "incident_log" }, (p: any) => {
      const r = p.new as any;
      setLiveEvents((prev) => [{ id: r.id, ts: r.ts, actor_email: r.actor_email, action: r.action, entity: r.category, entity_id: null, payload: r.payload } as AuditEntry, ...prev].slice(0, 200));
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const openUserDetail = async (u: UserRow) => {
    setDetailUser(u);
    setDetailData(null);
    const { data: res } = await supabase.functions.invoke("owner-console", { body: { action: "user_detail", user_id: u.id } });
    setDetailData(res);
  };

  // Just-in-time reveal of financial PII (holdings/brokers/orders/etc).
  // Server-side audited; defaults are minimised per GDPR.
  const revealUserPii = async (reason: string) => {
    if (!detailUser) return;
    const { data: res, error } = await supabase.functions.invoke("owner-console", {
      body: { action: "user_detail", user_id: detailUser.id, reveal_pii: true, reason },
    });
    if (error) { toast.error(error.message || "Reveal denied"); return; }
    setDetailData(res);
    toast.success("PII revealed — entry written to audit log");
  };

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
  const { stats, users, controls, banners, signals, incidents, flags, recentAudit, consents = [], audit = [], erasure = [], sessions = [], health = [], legal = [], apiKeys = [] } = data;
  const filteredUsers = users.filter((u) => {
    if (q) {
      const needle = q.toLowerCase();
      const hay = `${u.email || ""} ${u.display_name || ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (roleFilter !== "all") {
      const has = (u.roles || []).includes(roleFilter);
      if (roleFilter === "viewer") {
        // Treat empty roles as viewer (default)
        if (!has && (u.roles || []).length > 0) return false;
      } else if (!has) return false;
    }
    if (lastSignInFilter !== "any") {
      const ts = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
      const now = Date.now();
      const day = 86400_000;
      if (lastSignInFilter === "never" && ts) return false;
      if (lastSignInFilter === "24h" && (!ts || now - ts > day)) return false;
      if (lastSignInFilter === "7d" && (!ts || now - ts > 7 * day)) return false;
      if (lastSignInFilter === "30d" && (!ts || now - ts > 30 * day)) return false;
      if (lastSignInFilter === "30d_plus" && (!ts || now - ts <= 30 * day)) return false;
    }
    return true;
  });
  const controlByKey = (k: string) => controls.find((c) => c.key === k);
  const aiConfig: AiConfig = ((controls.find((c) => c.key === "ai_config") as any)?.value) || {};
  const filteredAudit = audit.filter(a => !auditFilter || JSON.stringify(a).toLowerCase().includes(auditFilter.toLowerCase()));
  const anyKillActive = KILL_SWITCHES.some(s => controlByKey(s.key)?.enabled);

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
            <PanicModeCard active={anyKillActive} onPanic={(reason) => act("panic_mode", { enabled: true, reason })} onLift={(reason) => act("panic_mode", { enabled: false, reason })} />
            <Card className="p-4 border-destructive/40 bg-destructive/5">
              <div className="flex items-center gap-2 text-destructive font-semibold">
                <AlertTriangle className="h-4 w-4" /> Critical controls - changes take effect instantly for every user.
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
                    expiresAt={(c as any)?.expires_at}
                    onToggle={(enabled, reason, expires_at) => act("toggle_control_expiry", { key: s.key, enabled, reason, expires_at })}
                  />
                );
              })}
            </div>
    </div>
  );
  const aiSection = (
    <div className="space-y-3">
            <AiGovernanceConfig config={aiConfig} onSave={(value) => act("set_ai_config", { value })} />
            <BulkRetractCard onSubmit={(symbol, since, reason) => act("bulk_retract_by_symbol", { symbol, since, reason })} />
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
                      <TableCell className="text-xs font-mono">{s.symbol || "-"}</TableCell>
                      <TableCell className="text-xs">{s.confidence != null ? `${Math.round(s.confidence * 100)}%` : "-"}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "retracted" ? "destructive" : s.status === "flagged" ? "outline" : "secondary"} className="text-[10px]">{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {s.status !== "retracted" && (
                          <RetractDialog onConfirm={(reason, notify) => act(notify ? "retract_signal_notify" : "retract_signal", { id: s.id, reason })} />
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
            <Card className="p-3 flex flex-wrap items-center gap-2">
              <Input placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs h-9" />
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={lastSignInFilter} onValueChange={setLastSignInFilter}>
                <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Last sign-in" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any time</SelectItem>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="30d_plus">Inactive 30d+</SelectItem>
                  <SelectItem value="never">Never signed in</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-auto">{filteredUsers.length} of {users.length}</span>
            </Card>
            <Card>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>User</TableHead><TableHead>Roles</TableHead><TableHead>Joined</TableHead>
                  <TableHead>Last sign-in</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium text-sm">
                        <button className="hover:underline text-left" onClick={() => openUserDetail(u)}>
                          <div>{u.display_name || <MaskedEmail email={u.email} />}</div>
                          {u.display_name && <div className="text-[10px] text-muted-foreground font-normal"><MaskedEmail email={u.email} /></div>}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs space-x-1">
                        {(u.roles || []).map((r) => <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>)}
                        {!u.roles?.length && <span className="text-muted-foreground">viewer</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "-"}</TableCell>
                      <TableCell>
                        {u.suspended ? <Badge variant="destructive" className="text-[10px]">suspended</Badge>
                          : u.email_confirmed_at ? <Badge className="bg-success/20 text-success text-[10px]">active</Badge>
                          : <Badge variant="outline" className="text-[10px]">unverified</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <UserActionsMenu user={u} act={act} onExport={() => exportUserData(u.id, u.email)} onView={() => openUserDetail(u)} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredUsers.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10 text-sm">No users match those filters.</TableCell></TableRow>}
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
                      <TableCell className="text-xs text-muted-foreground">{f.description || "-"}</TableCell>
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
            <Card className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-primary animate-pulse" />
                <h3 className="font-semibold text-sm">Live event stream</h3>
                <Badge variant="outline" className="text-[10px]">{liveEvents.length} since open</Badge>
              </div>
              <div className="max-h-[200px] overflow-auto space-y-1">
                {liveEvents.length === 0 && <p className="text-xs text-muted-foreground py-2">Waiting for events…</p>}
                {liveEvents.map((e) => (
                  <div key={`${e.id}-${e.ts}`} className="flex items-center gap-2 text-[11px] py-1 border-b border-border/40 last:border-0">
                    <span className="text-muted-foreground tabular-nums">{new Date(e.ts).toLocaleTimeString()}</span>
                    <span className="truncate max-w-[160px]"><MaskedEmail email={e.actor_email} /></span>
                    <Badge variant="outline" className="text-[9px]">{e.action}</Badge>
                    <span className="text-muted-foreground truncate">{e.entity}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-semibold mb-1 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Incident & audit logs</h3>
                <p className="text-xs text-muted-foreground">Immutable record of every admin action. Export for CONSOB / FCA / SEC inquiries.</p>
              </div>
              <div className="flex gap-2 items-center">
                <Input placeholder="Filter audit…" value={auditFilter} onChange={(e) => setAuditFilter(e.target.value)} className="h-8 w-56" />
                <Button size="sm" variant="outline" onClick={downloadAuditCsv} className="gap-2"><FileDown className="h-3.5 w-3.5" />Export CSV</Button>
              </div>
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
                      <TableCell className="text-xs"><MaskedEmail email={i.actor_email} /></TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{i.category}</Badge></TableCell>
                      <TableCell className="text-xs">{i.action}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.reason || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {incidents.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No incidents logged.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold mb-2 text-sm">Audit log ({filteredAudit.length}/{audit.length})</h3>
              <div className="space-y-1 max-h-[480px] overflow-auto">
                {filteredAudit.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs border-b border-border/40 py-1.5">
                    <span className="text-muted-foreground tabular-nums">{new Date(a.ts).toLocaleString()}</span>
                    <span className="truncate max-w-[160px]"><MaskedEmail email={a.actor_email} /></span>
                    <Badge variant="outline" className="text-[10px]">{a.action}</Badge>
                    <span className="text-muted-foreground truncate">{a.entity}{a.entity_id ? `/${a.entity_id.slice(0,8)}` : ""}</span>
                  </div>
                ))}
                {filteredAudit.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No matching audit entries.</p>}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><Eye className="h-4 w-4" /> Admin / impersonation sessions ({sessions.length})</h3>
              <div className="space-y-1 max-h-[240px] overflow-auto">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-[11px] py-1 border-b border-border/40 last:border-0">
                    <span className="text-muted-foreground tabular-nums">{new Date(s.created_at).toLocaleString()}</span>
                    <span className="truncate"><MaskedEmail email={s.actor_email} /></span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate"><MaskedEmail email={s.target_email} /></span>
                    <span className="text-muted-foreground truncate flex-1">{s.purpose}</span>
                  </div>
                ))}
                {sessions.length === 0 && <p className="text-xs text-muted-foreground py-2">No admin sessions logged.</p>}
              </div>
            </Card>
    </div>
  );
  const complianceSection = (
    <div className="space-y-3">
            <NewErasureCard users={users} onCreate={(user_id, reason, days) => act("request_erasure", { user_id, reason, days })} />
            <Card className="p-5 space-y-2">
              <h3 className="font-semibold flex items-center gap-2"><Scale className="h-4 w-4" /> GDPR & regulatory tools</h3>
              <p className="text-xs text-muted-foreground">Access (Art. 15) & portability (Art. 20) via per-user export. Erasure (Art. 17) via the Users tab. All actions are written to the immutable incident log.</p>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={downloadAuditCsv} className="gap-2"><FileDown className="h-3.5 w-3.5" />Audit log CSV (regulator-ready)</Button>
                <ForceReconsentDialog onConfirm={(version, reason) => act("force_reconsent", { version, reason })} />
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" /> Erasure queue ({erasure.filter(e => e.status === "pending").length} pending)</h3>
              <p className="text-[11px] text-muted-foreground mb-2">30-day grace period. Users can cancel via support. Executing produces an audit certificate.</p>
              <Table>
                <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Status</TableHead><TableHead>Requested</TableHead><TableHead>Scheduled</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {erasure.map((e) => {
                    const due = new Date(e.scheduled_for).getTime() <= Date.now();
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{e.user_email ? <MaskedEmail email={e.user_email} /> : e.user_id.slice(0,8)}</TableCell>
                        <TableCell><Badge variant={e.status === "completed" ? "secondary" : e.status === "cancelled" ? "outline" : due ? "destructive" : "outline"} className="text-[10px]">{e.status}{due && e.status === "pending" ? " · due" : ""}</Badge></TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{new Date(e.scheduled_for).toLocaleDateString()}</TableCell>
                        <TableCell className="text-xs">{e.reason}</TableCell>
                        <TableCell className="text-right space-x-1">
                          {e.status === "pending" && <Button size="sm" variant="ghost" onClick={() => act("cancel_erasure", { id: e.id, reason: "Admin cancelled" })}>Cancel</Button>}
                          {e.status === "pending" && due && <Button size="sm" variant="destructive" onClick={() => { if (confirm("Execute permanent deletion?")) act("execute_erasure", { id: e.id }); }}>Execute now</Button>}
                          {e.certificate_url && <span className="text-[10px] text-muted-foreground font-mono">{e.certificate_url}</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {erasure.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-xs">No erasure requests.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
            <Card>
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-sm">Consent ledger ({consents.length})</h3>
                <p className="text-xs text-muted-foreground">Per-user record of accepted T&C / Privacy versions - auditable for regulators.</p>
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
                        <TableCell className="text-xs">{u?.email ? <MaskedEmail email={u.email} /> : c.user_id.slice(0,8)}</TableCell>
                        <TableCell className="text-xs font-mono">{c.tos_version}</TableCell>
                        <TableCell className="text-xs font-mono">{c.privacy_version}</TableCell>
                        <TableCell className="text-xs">{c.marketing_opt_in ? "yes" : "-"}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground font-mono">{(c as any).ip || "-"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {consents.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No consents recorded yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
    </div>
  );
  const billingSection = <RevenueDashboard />;
  const dataSection = (
    <div className="space-y-3">
      <Card className="p-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Heart className="h-4 w-4 text-success" /> Provider health</h3>
          <p className="text-xs text-muted-foreground">Yahoo via allorigins.win · Supabase REST · Database</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => act("run_healthchecks")} className="gap-2"><Zap className="h-3.5 w-3.5" />Run checks now</Button>
      </Card>
      <div className="grid md:grid-cols-3 gap-3">
        {health.length === 0 && <Card className="p-4 col-span-full text-xs text-muted-foreground text-center">No checks run yet - click "Run checks now".</Card>}
        {health.map((h) => (
          <Card key={h.service} className={`p-4 min-w-0 ${h.status === "ok" ? "border-success/30" : h.status === "degraded" ? "border-amber-400/30" : "border-destructive/40"}`}>
            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
              <span className="font-medium text-sm break-all">{h.service}</span>
              <Badge variant={h.status === "ok" ? "secondary" : h.status === "degraded" ? "outline" : "destructive"} className="text-[10px] shrink-0">{h.status}</Badge>
            </div>
            <div className="text-[11px] text-muted-foreground break-words">{h.latency_ms != null ? `${h.latency_ms}ms` : "-"} · {h.detail || ""}</div>
            <div className="text-[10px] text-muted-foreground mt-1 break-words">{new Date(h.last_checked).toLocaleString()}</div>
          </Card>
        ))}
      </div>
      <PurgeDemoSeedCard onAfterPurge={load} />
    </div>
  );
  const rolesSection = (
    <Card className="p-5 space-y-3">
      <h3 className="font-semibold flex items-center gap-2"><Shield className="h-4 w-4" /> Roles & access</h3>
      <p className="text-xs text-muted-foreground">Available sub-roles: <code className="font-mono">admin</code>, <code className="font-mono">support</code>, <code className="font-mono">compliance</code>, <code className="font-mono">engineer</code>, <code className="font-mono">analyst</code>, <code className="font-mono">pm</code>, <code className="font-mono">viewer</code>. Manage per-user from the Users table.</p>
      <div className="grid md:grid-cols-2 gap-2 text-xs">
        <div><strong>admin</strong> - full owner powers, kill switches, GDPR execute.</div>
        <div><strong>support</strong> - user detail, reset password, impersonate (audited).</div>
        <div><strong>compliance</strong> - audit/consent/erasure queue, export.</div>
        <div><strong>engineer</strong> - feature flags, health checks, retract signals.</div>
      </div>
      <p className="text-[10px] text-amber-500 mt-2">⚠️ 2FA enforcement for these roles must be enabled in Cloud → Users → Auth Settings.</p>
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
    ...signals.filter(s => (s.confidence ?? 1) < 0.4 || s.status === "flagged").slice(0, 3).map(s => ({
      icon: <Bot className="h-4 w-4 text-amber-500" />, kind: "Signal governance",
      title: `AI signal flagged - Low confidence (${s.confidence != null ? s.confidence.toFixed(2) : "-"}) on ${s.symbol || "?"}.`,
      cta: "Review", section: "ai" as const, when: s.created_at,
    })),
    ...incidents.slice(0, 2).map(i => ({
      icon: <AlertCircle className="h-4 w-4 text-amber-500" />, kind: i.category,
      title: `${i.action}${i.reason ? ` - ${i.reason}` : ""}`, cta: "View", section: "audit" as const, when: i.ts,
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
          <Button variant="outline" size="sm" onClick={() => setOwnerSection("comms")} className="gap-2"><Megaphone className="h-3.5 w-3.5" />Broadcast message</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiTile label="Total users" value={stats.total.toLocaleString()} delta={`+${stats.newLast7d} this week`} deltaTone="up" />
        <KpiTile label="Active 24h" value={stats.signedInLast24h.toLocaleString()} delta={`${stats.signedInLast7d} in 7d`} />
        <KpiTile label="Active signals today" value={liveSignalsToday.toLocaleString()} delta={`${flaggedSignals} flagged`} deltaTone={flaggedSignals ? "warn" : undefined} />
        <KpiTile label="Portfolios" value={stats.portfolios.toLocaleString()} delta={`${stats.holdings} holdings`} />
        <KpiTile label="Active kill switches" value={String(openIncidents)} delta={openIncidents ? "Review controls" : "All clear"} deltaTone={openIncidents ? "warn" : "up"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* User management - spans 2 cols */}
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
                    <TableRow key={u.id} className="cursor-pointer" onClick={() => setOwnerSection("users")}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">{(u.email || "?").slice(0,2).toUpperCase()}</div>
                          <div>
                            <div className="text-sm font-medium leading-tight"><MaskedEmail email={u.email} /></div>
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
                      <TableCell className="text-xs text-muted-foreground">{u.last_sign_in_at ? relTime(u.last_sign_in_at) : "-"}</TableCell>
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
                  <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setOwnerSection(a.section)}>{a.cta}</Button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Feature flags</h3>
              <button className="text-[10px] text-primary hover:underline" onClick={() => setOwnerSection("flags")}>Manage all ›</button>
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
            <div><div className="text-[10px] text-muted-foreground uppercase">ARR</div><div className="font-semibold tabular-nums">-</div></div>
            <div><div className="text-[10px] text-muted-foreground uppercase">Churn $</div><div className="font-semibold tabular-nums">-</div></div>
            <div><div className="text-[10px] text-muted-foreground uppercase">New MRR</div><div className="font-semibold tabular-nums">-</div></div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">Wire Stripe / Paddle to populate revenue charts.</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">AI signal governance</h3>
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setOwnerSection("ai")}>Configure</Button>
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
            <button className="text-[10px] text-primary hover:underline" onClick={() => setOwnerSection("audit")}>Full log ›</button>
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
    roles: rolesSection,
    apikeys: <ApiKeysAdmin apiKeys={apiKeys} users={users} reload={load} />,
    plans: <PlansEditor />,
    "billing-settings": <BillingSettingsPanel />,
    "feature-catalog": <OwnerFeatureCatalogPage />,
    referrals: <OwnerReferralsPage />,
    revenue: billingSection,
    failed: stubSection("Failed payments", "Dunning queue and manual retry triggers appear once a payment provider is connected."),
    flags: flagsSection,
    audit: auditSection,
    comms: commsSection,
    ai: aiSection,
    ai_access: <AiAccessAdmin />,
    ai_metrics: <AIMetricsAdmin />,
    data: dataSection,
    gdpr: complianceSection,
    legal: <LegalDocsEditor docs={legal} reload={load} />,
    landing: <LandingEditor />,
    tickets: <OwnerTickets />,
    blog: <OwnerBlogAdmin />,
    security: <OwnerSecurityAudit />,
    "onboarding-funnel": <OwnerOnboardingFunnel />,
  };

  return (
    <div className="min-h-screen bg-background flex">
      <SEO title="Owner Console - Vela.ai" description="Internal admin" path="/owner" />
      <EmailRevealProvider>
      <OwnerSidebar
        section={section}
        setSection={setOwnerSection}
        flagsOff={flagsOff}
        signalAlerts={flaggedSignals}
        gdprPending={pendingGdpr}
        openTickets={openTickets}
        onKill={() => setOwnerSection("kill")}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b border-border flex items-center px-4 gap-3 sticky top-0 bg-background/95 backdrop-blur z-10">
          <div className="relative flex-1 max-w-xl">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users, logs, signals…" className="pl-9 h-9" />
          </div>
          <EmailRevealToggle />
          <Badge variant="outline" className={`gap-1.5 ${openIncidents ? "border-amber-400/40 text-amber-500" : "border-success/40 text-success"}`}>
            <CircleDot className={`h-2 w-2 fill-current`} />
            {openIncidents ? `${openIncidents} kill switch${openIncidents === 1 ? "" : "es"} active` : "All systems operational"}
          </Badge>
          <Button variant="ghost" size="icon" aria-label="Open alerts" className="relative" onClick={() => setOwnerSection("comms")}>
            <BellRing className="h-4 w-4" />
            {activeAlerts > 0 && <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[9px] rounded-full bg-amber-500 text-background font-bold flex items-center justify-center">{activeAlerts}</span>}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Reload settings" onClick={load}><Settings className="h-4 w-4" /></Button>
        </header>
        <main className="flex-1 p-6 overflow-auto">{SECTIONS[section] || dashboardSection}</main>
      </div>
      <UserDetailDrawer user={detailUser} data={detailData} onClose={() => { setDetailUser(null); setDetailData(null); }} act={act} onImpersonate={(purpose) => detailUser && act("impersonate_log", { user_id: detailUser.id, purpose })} onRequestErasure={(reason) => detailUser && act("request_erasure", { user_id: detailUser.id, reason })} onRevealPii={revealUserPii} />
      </EmailRevealProvider>
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

function OwnerSidebar({ section, setSection, flagsOff, signalAlerts, gdprPending, openTickets, onKill }: { section: string; setSection: (s: any) => void; flagsOff: number; signalAlerts: number; gdprPending: number; openTickets: number; onKill: () => void }) {
  const navigate = useNavigate();
  const groups: { label: string; items: { key: string; label: string; icon: React.ReactNode; badge?: string | number; href?: string }[] }[] = [
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
      { key: "feature-catalog", label: "Feature catalog", icon: <ListChecks className="h-3.5 w-3.5" /> },
      { key: "referrals", label: "Referrals & beta", icon: <Gift className="h-3.5 w-3.5" /> },
      { key: "revenue", label: "Revenue", icon: <Wallet className="h-3.5 w-3.5" /> },
      { key: "failed", label: "Failed payments", icon: <AlertCircle className="h-3.5 w-3.5" /> },
      { key: "billing-settings", label: "Trial & retention", icon: <Gift className="h-3.5 w-3.5" /> },
    ]},
    { label: "Platform", items: [
      { key: "flags", label: "Feature flags", icon: <Flag className="h-3.5 w-3.5" />, badge: flagsOff ? `${flagsOff} off` : undefined },
      { key: "audit", label: "Audit logs", icon: <ScrollText className="h-3.5 w-3.5" /> },
      { key: "comms", label: "Comms & CRM", icon: <Mail className="h-3.5 w-3.5" /> },
      { key: "landing", label: "Landing page", icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
      { key: "blog", label: "Blog & news", icon: <FileText className="h-3.5 w-3.5" /> },
      { key: "tickets", label: "Support tickets", icon: <LifeBuoy className="h-3.5 w-3.5" />, badge: openTickets || undefined },
    ]},
    { label: "AI & data", items: [
      { key: "ai", label: "Signal governance", icon: <Bot className="h-3.5 w-3.5" />, badge: signalAlerts || undefined },
      { key: "ai_access", label: "AI access control", icon: <Sparkles className="h-3.5 w-3.5" /> },
      { key: "ai_metrics", label: "AI funnel metrics", icon: <Sparkles className="h-3.5 w-3.5" /> },
      { key: "onboarding-funnel", label: "Onboarding funnel", icon: <Activity className="h-3.5 w-3.5" /> },
      { key: "data", label: "Data feeds", icon: <Database className="h-3.5 w-3.5" /> },
    ]},
    { label: "Compliance", items: [
      { key: "gdpr", label: "GDPR requests", icon: <Scale className="h-3.5 w-3.5" />, badge: gdprPending || undefined },
      { key: "legal", label: "Legal documents", icon: <FileText className="h-3.5 w-3.5" /> },
      { key: "security", label: "Security audit", icon: <Shield className="h-3.5 w-3.5" /> },
    ]},
  ];
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card/30 flex flex-col">
      <div className="h-14 border-b border-border flex items-center gap-2 px-4">
        <button
          onClick={() => navigate("/dashboard")}
          aria-label="Back to platform"
          title="Back to platform"
          className="flex items-center gap-2 hover:opacity-80 transition"
        >
          <Crown className="h-5 w-5 text-amber-400" />
          <span className="font-semibold tracking-tight">Vela<span className="text-muted-foreground">.ai</span></span>
        </button>
        <Badge variant="outline" className="ml-1 text-[9px] border-amber-400/40 text-amber-500">OWNER</Badge>
      </div>
      <div className="px-3 pt-3">
        <button
          onClick={() => navigate("/dashboard")}
          className="w-full h-9 rounded-md bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground text-xs font-medium flex items-center justify-center gap-2 transition border border-border"
        >
          ← Back to platform
        </button>
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
                  <button key={it.key + g.label} onClick={() => it.href ? navigate(it.href) : setSection(it.key)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition ${active ? "bg-primary/10 text-primary font-medium" : "text-foreground/80 hover:bg-muted/50"}`}>
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

function KillSwitchCard({ label, description, enabled, reason, updatedAt, expiresAt, onToggle }: { label: string; description: string; enabled: boolean; reason: string; updatedAt?: string; expiresAt?: string | null; onToggle: (enabled: boolean, reason: string, expires_at: string | null) => void | Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [draftReason, setDraftReason] = useState(reason);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [autoExpiryHours, setAutoExpiryHours] = useState("");
  const tone = enabled ? "border-destructive/40 bg-destructive/5" : "";
  return (
    <Card className={`p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-sm flex items-center gap-2">
            {enabled && <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />} {label}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
          {updatedAt && <p className="text-[10px] text-muted-foreground mt-2">Last change {new Date(updatedAt).toLocaleString()}{reason ? ` - “${reason}”` : ""}</p>}
          {expiresAt && <p className="text-[10px] text-amber-500 mt-1">Auto-lifts at {new Date(expiresAt).toLocaleString()}</p>}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Switch checked={enabled} onClick={(e) => { e.preventDefault(); setOpen(true); }} />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{enabled ? "Disable" : "Enable"} - {label}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{description}</p>
            <Textarea placeholder="Reason (recorded in incident log)" value={draftReason} onChange={(e) => setDraftReason(e.target.value)} />
            {!enabled && (
              <>
                <Input placeholder="Auto-lift after N hours (optional)" value={autoExpiryHours} onChange={(e) => setAutoExpiryHours(e.target.value)} />
                <Input placeholder={`Type "ACTIVATE" to confirm`} value={confirmPhrase} onChange={(e) => setConfirmPhrase(e.target.value)} />
              </>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant={enabled ? "outline" : "destructive"} disabled={!enabled && confirmPhrase !== "ACTIVATE"} onClick={() => {
                const expires_at = (!enabled && autoExpiryHours) ? new Date(Date.now() + Number(autoExpiryHours) * 3600_000).toISOString() : null;
                onToggle(!enabled, draftReason, expires_at);
                setOpen(false); setConfirmPhrase(""); setAutoExpiryHours("");
              }}>
                {enabled ? "Turn off" : "Activate now"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}

function RetractDialog({ onConfirm }: { onConfirm: (reason: string, notify: boolean) => void | Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="text-destructive">Retract</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Retract AI signal</DialogTitle></DialogHeader>
        <Textarea placeholder="Why is this being retracted?" value={reason} onChange={(e) => setReason(e.target.value)} />
        <label className="flex items-center gap-2 text-xs"><Switch checked={notify} onCheckedChange={setNotify} /> Notify the user who received it</label>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => { onConfirm(reason, notify); setOpen(false); }}>Retract</Button>
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

function UserActionsMenu({ user, act, onExport, onView }: { user: UserRow; act: (a: string, p?: Record<string, unknown>) => Promise<boolean>; onExport: () => void; onView?: () => void }) {
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleToGrant, setRoleToGrant] = useState<Role>("support");
  return (
    <div className="flex items-center gap-1 justify-end">
      {onView && <Button size="sm" variant="ghost" className="gap-1" onClick={onView}><Eye className="h-3.5 w-3.5" /> View</Button>}
      {user.suspended
        ? <Button size="sm" variant="outline" onClick={() => act("unsuspend_user", { user_id: user.id })}>Unsuspend</Button>
        : <Button size="sm" variant="ghost" className="gap-1" onClick={() => act("suspend_user", { user_id: user.id, reason: "Owner action" })}><Ban className="h-3.5 w-3.5" /> Suspend</Button>}
      <Button size="sm" variant="ghost" className="gap-1" onClick={() => act("force_password_reset", { email: user.email })}><Shield className="h-3.5 w-3.5" /> Reset pw</Button>
      <Button size="sm" variant="ghost" className="gap-1" onClick={onExport}><FileDown className="h-3.5 w-3.5" /> Export</Button>
      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogTrigger asChild><Button size="sm" variant="ghost" className="gap-1"><Shield className="h-3.5 w-3.5" /> Roles</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Roles - <MaskedEmail email={user.email} /></DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Current roles:</p>
            <div className="flex flex-wrap gap-1">
              {(user.roles || []).length === 0 && <Badge variant="outline" className="text-[10px]">viewer (default)</Badge>}
              {(user.roles || []).map(r => (
                <Badge key={r} variant="outline" className="text-[10px] gap-1">
                  {r}
                  <button onClick={() => act("revoke_role", { user_id: user.id, role: r })} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Select value={roleToGrant} onValueChange={(v) => setRoleToGrant(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={() => act("grant_role", { user_id: user.id, role: roleToGrant })}>Grant</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <DialogTrigger asChild><Button size="sm" variant="ghost" className="text-destructive gap-1"><Trash2 className="h-3.5 w-3.5" /> Erase</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>GDPR right to erasure</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This permanently deletes <strong><MaskedEmail email={user.email} /></strong> and all their data across the platform. This cannot be undone.</p>
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

function NewErasureCard({ users, onCreate }: { users: UserRow[]; onCreate: (user_id: string, reason: string, days: number) => Promise<unknown> }) {
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("30");
  const [q, setQ] = useState("");
  const matches = q ? users.filter(u => (u.email + " " + (u.display_name || "")).toLowerCase().includes(q.toLowerCase())).slice(0, 5) : [];
  return (
    <Card className="p-4 space-y-2">
      <h3 className="font-semibold text-sm flex items-center gap-2"><Scale className="h-4 w-4" /> Lodge a new erasure request</h3>
      <p className="text-[11px] text-muted-foreground">Use this when a user emails support asking for Art. 17 erasure. Adds a row to the queue with a configurable grace period.</p>
      <div className="grid md:grid-cols-4 gap-2">
        <div className="md:col-span-2 relative">
          <Input placeholder="Find user by name or email…" value={q} onChange={(e) => { setQ(e.target.value); setUserId(""); }} />
          {matches.length > 0 && !userId && (
            <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-md shadow max-h-48 overflow-auto">
              {matches.map(m => (
                <button key={m.id} type="button" className="w-full text-left text-xs px-2 py-1.5 hover:bg-muted" onClick={() => { setUserId(m.id); setQ(m.email); }}>
                  <span className="font-medium">{m.display_name || <MaskedEmail email={m.email} />}</span>
                  {m.display_name && <span className="text-muted-foreground"> · <MaskedEmail email={m.email} /></span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <Input placeholder="Reason / ticket #" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex gap-2">
          <Input type="number" placeholder="Grace days" value={days} onChange={(e) => setDays(e.target.value)} />
          <Button disabled={!userId} onClick={async () => { await onCreate(userId, reason, Number(days) || 30); setUserId(""); setQ(""); setReason(""); }}>Create</Button>
        </div>
      </div>
    </Card>
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
          <label className="text-xs font-medium">Rate limit / user / day - Free</label>
          <Input value={rateFree} onChange={(e) => setRateFree(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Rate limit - Pro</label>
          <Input value={ratePro} onChange={(e) => setRatePro(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Rate limit - Team</label>
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

function PanicModeCard({ active, onPanic, onLift }: { active: boolean; onPanic: (reason: string) => void | Promise<unknown>; onLift: (reason: string) => void | Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [phrase, setPhrase] = useState("");
  return (
    <Card className="p-4 border-destructive bg-destructive/10 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-start gap-3">
        <Zap className="h-5 w-5 text-destructive mt-0.5" />
        <div>
          <div className="font-semibold text-destructive">Panic mode</div>
          <p className="text-xs text-muted-foreground max-w-md">Flips every critical kill switch at once: maintenance, AI signals, live trading, emails, signups and data feeds.</p>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant={active ? "outline" : "destructive"} className="gap-2"><Zap className="h-3.5 w-3.5" />{active ? "Lift panic mode" : "Activate panic mode"}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>{active ? "Lift panic mode" : "Activate PANIC MODE"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{active ? "This re-enables platform-wide services." : "Every user is locked out within seconds. Use only for true emergencies."}</p>
          <Textarea placeholder="Reason (mandatory, recorded in incident log)" value={reason} onChange={(e) => setReason(e.target.value)} />
          {!active && <Input placeholder={`Type "PANIC" to confirm`} value={phrase} onChange={(e) => setPhrase(e.target.value)} />}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!reason || (!active && phrase !== "PANIC")} onClick={() => { active ? onLift(reason) : onPanic(reason); setOpen(false); setPhrase(""); setReason(""); }}>{active ? "Lift" : "PANIC"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function BulkRetractCard({ onSubmit }: { onSubmit: (symbol: string, since: string, reason: string) => void | Promise<unknown> }) {
  const [symbol, setSymbol] = useState("");
  const [since, setSince] = useState("");
  const [reason, setReason] = useState("");
  return (
    <Card className="p-4 space-y-2 border-amber-400/40">
      <h3 className="font-semibold text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Bulk retract by symbol</h3>
      <p className="text-[11px] text-muted-foreground">Retracts every non-retracted signal on a ticker since a given date and notifies affected users.</p>
      <div className="grid md:grid-cols-3 gap-2">
        <Input placeholder="Symbol (e.g. UCG.MI)" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        <Input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
        <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="destructive" disabled={!symbol || !reason} onClick={() => { onSubmit(symbol, since ? new Date(since).toISOString() : "", reason); setSymbol(""); setSince(""); setReason(""); }}>Retract all & notify</Button>
      </div>
    </Card>
  );
}

function PurgeDemoSeedCard({ onAfterPurge }: { onAfterPurge: () => void | Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ matched: number; sample: any[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<number | null>(null);
  const call = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("owner-console", { body: { action: "purge_demo_seed", ...payload } });
    if (error) { toast.error(error.message || "Action failed"); return null; }
    return data as { matched: number; deleted: number; sample: any[] } | null;
  };
  const runPreview = async () => {
    setBusy(true);
    try {
      const res = await call({ dry_run: true, reason: reason || "preview demo seed" });
      if (res) setPreview({ matched: res.matched ?? 0, sample: res.sample ?? [] });
    } finally { setBusy(false); }
  };
  const runPurge = async () => {
    setBusy(true);
    try {
      const res = await call({ dry_run: false, reason });
      if (res) {
        setLastDeleted(res.deleted ?? 0);
        setPreview(null);
        toast.success(`Deleted ${res.deleted ?? 0} legacy demo seed holdings`);
        setOpen(false);
        await onAfterPurge();
      }
    } finally { setBusy(false); }
  };
  return (
    <Card className="p-4 space-y-2 border-amber-400/40">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2"><Database className="h-4 w-4 text-amber-500" /> Purge legacy demo seed holdings</h3>
          <p className="text-[11px] text-muted-foreground max-w-xl">
            Removes the deterministic demo rows (ENEL "Enel" 100 @ 6.20 EUR · UCG "UniCredit" 50 @ 35.50 EUR) that older releases seeded into every new user portfolio. Real user-entered holdings are never touched. Every run is logged to the incident &amp; audit log.
          </p>
          {lastDeleted != null && <div className="text-[11px] text-emerald-500 mt-1">Last purge: {lastDeleted} rows deleted.</div>}
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setPreview(null); } }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2"><Trash2 className="h-3.5 w-3.5" />Review & purge</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Purge legacy demo seed holdings</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">First run a dry-run preview, then confirm deletion. Both actions are audited.</p>
            <Textarea placeholder="Reason (recorded in incident log)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={runPreview} disabled={busy}>Preview matches</Button>
              {preview && <span className="text-xs text-muted-foreground">{preview.matched} rows match the seed signature</span>}
            </div>
            {preview && preview.sample.length > 0 && (
              <div className="max-h-48 overflow-auto border rounded text-[11px] font-mono p-2 bg-muted/40">
                {preview.sample.map((r: any) => (
                  <div key={r.id}>{r.symbol} · {r.name} · {r.shares}@{r.avg_price} {r.currency} · user {String(r.user_id).slice(0, 8)}…</div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="destructive" disabled={busy || !preview || preview.matched === 0 || reason.trim().length < 5} onClick={runPurge}>
                Delete {preview?.matched ?? 0} rows
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}

function UserDetailDrawer({ user, data, onClose, act, onImpersonate, onRequestErasure, onRevealPii }: { user: UserRow | null; data: any; onClose: () => void; act: (a: string, p?: Record<string, unknown>) => Promise<boolean>; onImpersonate: (purpose: string) => void; onRequestErasure: (reason: string) => void; onRevealPii: (reason: string) => Promise<void> | void }) {
  if (!user) return null;
  const revealed = !!data?.pii_revealed;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-xl bg-background border-l border-border overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border p-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold"><MaskedEmail email={user.email} /></h2>
            <p className="text-[10px] text-muted-foreground font-mono">{user.id}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close user details" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        {!data && <p className="text-xs text-muted-foreground p-6 text-center">Loading…</p>}
        {data && (
          <div className="p-4 space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <DetailKv label="Created" value={new Date(data.auth?.created_at || user.created_at).toLocaleString()} />
              <DetailKv label="Last sign-in" value={data.auth?.last_sign_in_at ? new Date(data.auth.last_sign_in_at).toLocaleString() : "-"} />
              <DetailKv label="Provider" value={(data.auth?.app_metadata?.provider) || "-"} />
              <DetailKv label="Roles" value={(data.roles || []).join(", ") || "viewer"} />
              <DetailKv label="Country" value={data.profile?.country_residence || "-"} />
              <DetailKv label="Suspended" value={data.suspension ? "yes" : "no"} />
            </div>
            {/*
              GDPR data-minimisation: financial PII (portfolios, holdings,
              broker balances, AI signal history, orders) is hidden by default.
              Owners can request a just-in-time reveal with a documented reason;
              every reveal is server-side audited.
            */}
            {revealed ? (
              <>
                {data.pii_reveal && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-200 px-3 py-2 text-[11px]">
                    <div className="font-semibold">PII revealed · audit-logged</div>
                    <div className="opacity-90">By {data.pii_reveal.actor_email ?? "you"} at {new Date(data.pii_reveal.at).toLocaleString()}</div>
                    <div className="opacity-90 italic">Reason: {data.pii_reveal.reason}</div>
                  </div>
                )}
                <DetailSection title={`Portfolios (${data.portfolios?.length || 0})`}>
                  {(data.portfolios || []).map((p: any) => <div key={p.id} className="flex justify-between border-b border-border/40 py-1"><span>{p.name}</span><span className="text-muted-foreground">{p.base_currency}</span></div>)}
                </DetailSection>
                <DetailSection title={`Holdings (${data.holdings?.length || 0})`}>
                  {(data.holdings || []).slice(0,10).map((h: any) => <div key={h.id} className="flex justify-between border-b border-border/40 py-1"><span className="font-mono">{h.symbol}</span><span className="text-muted-foreground">{h.shares} × {h.avg_price}</span></div>)}
                </DetailSection>
                <DetailSection title={`Brokers (${data.brokers?.length || 0})`}>
                  {(data.brokers || []).map((b: any) => <div key={b.id} className="flex justify-between border-b border-border/40 py-1"><span>{b.institution || b.source}</span><span className="text-muted-foreground">{b.currency} {b.total_value}</span></div>)}
                </DetailSection>
                <DetailSection title={`Recent AI signals (${data.signals?.length || 0})`}>
                  {(data.signals || []).slice(0,10).map((s: any) => <div key={s.id} className="flex justify-between border-b border-border/40 py-1"><span>{s.signal_type} <span className="font-mono">{s.symbol}</span></span><Badge variant="outline" className="text-[9px]">{s.status}</Badge></div>)}
                </DetailSection>
                <DetailSection title={`Recent orders (${data.orders?.length || 0})`}>
                  {(data.orders || []).slice(0,10).map((o: any) => <div key={o.id} className="flex justify-between border-b border-border/40 py-1"><span>{o.side} {o.qty} <span className="font-mono">{o.symbol}</span></span><Badge variant="outline" className="text-[9px]">{o.status}</Badge></div>)}
                </DetailSection>
              </>
            ) : (
              <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Shield className="h-3.5 w-3.5" /> Financial PII hidden by default
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Portfolios, holdings, broker balances, AI signals, and order history
                  are personal financial data under GDPR. They are not loaded unless
                  there is a documented support purpose. Revealing them writes an
                  entry to the audit log with your identity and the reason you give.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => {
                    const r = prompt("Reason for revealing this user's financial data (≥5 chars, audit-logged):");
                    if (r && r.trim().length >= 5) onRevealPii(r.trim());
                    else if (r !== null) toast.error("A documented reason is required.");
                  }}
                >
                  <Eye className="h-3.5 w-3.5" /> Reveal with audited reason
                </Button>
              </div>
            )}
            <DetailSection title="Account overrides">
              <div className="space-y-2 py-1">
                <OverrideRow
                  label="Unrestricted advisor mode"
                  description="Disables the educational-research framing for this account. Copilot will give direct, personalised buy/sell advice. Owner self-use & internal testing only."
                  enabled={!!data.profile?.unrestricted_advice}
                  onToggle={async (v) => { await act("set_user_override", { user_id: user.id, key: "unrestricted_advice", value: v }); }}
                />
                <OverrideRow
                  label="AI opt-out (privacy)"
                  description="Blocks every AI feature for this account."
                  enabled={!!data.profile?.ai_opt_out}
                  onToggle={async (v) => { await act("set_user_override", { user_id: user.id, key: "ai_opt_out", value: v }); }}
                />
              </div>
            </DetailSection>
            <DetailSection title={`Consents (${data.consents?.length || 0})`}>
              {(data.consents || []).slice(0,5).map((c: any) => <div key={c.id} className="flex justify-between border-b border-border/40 py-1"><span>{new Date(c.accepted_at).toLocaleDateString()}</span><span className="font-mono text-muted-foreground">T&C {c.tos_version} / Priv {c.privacy_version}</span></div>)}
            </DetailSection>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <Button size="sm" variant="outline" className="gap-1" onClick={() => { const p = prompt("Purpose for impersonation (audited):"); if (p) onImpersonate(p); }}><Eye className="h-3.5 w-3.5" />Impersonate (audit)</Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => act("force_password_reset", { email: user.email })}><Shield className="h-3.5 w-3.5" />Send password reset</Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => { const r = prompt("Reason for erasure request (30-day grace):"); if (r) onRequestErasure(r); }}><Clock className="h-3.5 w-3.5" />Request erasure</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function DetailKv({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[9px] uppercase text-muted-foreground tracking-wider">{label}</div><div className="font-medium">{value}</div></div>;
}
function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="font-semibold text-xs mb-1">{title}</h4><div className="max-h-40 overflow-auto">{children}</div></div>;
}
function OverrideRow({ label, description, enabled, onToggle }: { label: string; description: string; enabled: boolean; onToggle: (v: boolean) => void | Promise<unknown> }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 py-2">
      <div className="min-w-0">
        <div className="font-medium text-xs">{label}</div>
        <div className="text-[10px] text-muted-foreground leading-snug">{description}</div>
      </div>
      <Switch checked={enabled} onCheckedChange={(v) => onToggle(!!v)} />
    </div>
  );
}
