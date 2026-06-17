import { useMemo, useState } from "react";
import { OwnerPageHeader } from "@/components/owner/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, ShieldAlert, ShieldX, ExternalLink, Download, RefreshCw } from "lucide-react";

type Status = "fixed" | "accepted" | "by_design" | "open";
type Finding = {
  id: string;
  name: string;
  level: "error" | "warn" | "info";
  status: Status;
  source: "supabase" | "supabase_lov" | "connector";
  remediation: string;
  link?: string;
};

// Snapshot from the latest scan (2026-06-05). Re-runs of the scanner are agent-side
// (Cloud → Security tab). This page surfaces the current ground truth for admins.
const SCAN_TIMESTAMP = "2026-06-05T14:29:51Z";
const FINDINGS: Finding[] = [
  { id: "REALTIME_UNAUTHORIZED_SUBSCRIPTION", name: "Sensitive admin tables broadcast via Realtime", level: "error", status: "fixed", source: "supabase_lov", remediation: "Dropped audit_log + incident_log from supabase_realtime publication." },
  { id: "EXPOSED_PLATFORM_INTERNALS", name: "platform_controls readable by all signed-in users", level: "warn", status: "fixed", source: "supabase_lov", remediation: "SELECT policy restricted to has_role(auth.uid(),'admin')." },
  { id: "ADVISORY_CONSENT_SCOPE_BYPASS", name: "Advisory consent scope can be widened to 'full'", level: "warn", status: "fixed", source: "supabase_lov", remediation: "CHECK constraint advisory_consents_scope_check restricts scope to a whitelist." },
  { id: "PRIVILEGE_ESCALATION_ROLE_INSERT", name: "user_roles privilege-escalation defense-in-depth", level: "warn", status: "fixed", source: "supabase_lov", remediation: "Added RESTRICTIVE admin-only policy on user_roles writes." },
  { id: "SUPA_anon_security_definer_function_executable", name: "SECURITY DEFINER helpers executable by anon", level: "warn", status: "fixed", source: "supabase", remediation: "Revoked EXECUTE from anon and PUBLIC; trigger functions also revoked from authenticated.", link: "https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable" },
  { id: "MISSING_STORAGE_SELECT_POLICY", name: "avatars bucket publicly readable", level: "warn", status: "accepted", source: "supabase_lov", remediation: "Public by design so <img> tags load without signed URLs. UUID paths are non-sensitive." },
  { id: "landing_versions_no_select_policy", name: "landing_versions has no SELECT policy", level: "warn", status: "by_design", source: "supabase_lov", remediation: "Linter description itself states no action needed - RLS implicitly denies anon, admin ALL policy intentional." },
  { id: "SUPA_extension_in_public", name: "Extension installed in public schema (pg_net)", level: "warn", status: "by_design", source: "supabase", remediation: "Supabase installs pg_net in public by default; edge functions depend on it.", link: "https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public" },
  { id: "SUPA_authenticated_security_definer_function_executable", name: "SECURITY DEFINER helpers executable by authenticated (×4)", level: "warn", status: "by_design", source: "supabase", remediation: "has_role / has_advisory_consent / has_active_subscription / ai_usage_this_month are invoked from RLS and RPCs; must remain executable by signed-in users.", link: "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable" },
];

const STATUS_META: Record<Status, { label: string; tone: string; Icon: typeof ShieldCheck }> = {
  fixed:     { label: "Fixed",      tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", Icon: ShieldCheck },
  accepted:  { label: "Accepted",   tone: "bg-amber-500/10 text-amber-700 border-amber-500/30",       Icon: ShieldAlert },
  by_design: { label: "By design",  tone: "bg-sky-500/10 text-sky-700 border-sky-500/30",             Icon: ShieldAlert },
  open:      { label: "Open",       tone: "bg-rose-500/10 text-rose-700 border-rose-500/30",          Icon: ShieldX },
};

export default function OwnerSecurity() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");

  const counts = useMemo(() => ({
    fixed: FINDINGS.filter(f => f.status === "fixed").length,
    accepted: FINDINGS.filter(f => f.status === "accepted").length,
    by_design: FINDINGS.filter(f => f.status === "by_design").length,
    open: FINDINGS.filter(f => f.status === "open").length,
  }), []);

  const visible = FINDINGS.filter(f => {
    if (filter !== "all" && f.status !== filter) return false;
    if (!q) return true;
    return (f.name + f.id + f.remediation).toLowerCase().includes(q.toLowerCase());
  });

  return (
    <>
      <OwnerPageHeader
        title="Security scan"
        subtitle={`Latest scan: ${new Date(SCAN_TIMESTAMP).toLocaleString()} · Admin-only view`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/security-report.md" download>
                <Download className="h-3.5 w-3.5 mr-1" /> Download report
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(["fixed", "accepted", "by_design", "open"] as Status[]).map((s) => {
          const { label, Icon } = STATUS_META[s];
          const n = counts[s];
          const active = filter === s;
          return (
            <button
              key={s}
              onClick={() => setFilter(active ? "all" : s)}
              className={`text-left rounded-2xl border p-4 transition ${active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"}`}
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                <span>{label}</span>
                <Icon className="h-4 w-4" />
              </div>
              <div className="text-3xl font-semibold mt-1 tabular-nums">{n}</div>
            </button>
          );
        })}
      </div>

      <Card className="p-4 rounded-2xl mb-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Input placeholder="Filter findings…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
          <Badge variant="outline" className="text-[10px]">{visible.length} of {FINDINGS.length}</Badge>
          {filter !== "all" && (
            <Button size="sm" variant="ghost" onClick={() => setFilter("all")}>Clear filter</Button>
          )}
        </div>
      </Card>

      <div className="space-y-2">
        {visible.map((f) => {
          const meta = STATUS_META[f.status];
          const Icon = meta.Icon;
          return (
            <Card key={f.id} className="p-4 rounded-2xl">
              <div className="flex items-start gap-3">
                <span className={`h-9 w-9 shrink-0 rounded-full border flex items-center justify-center ${meta.tone}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{f.name}</span>
                    <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>{meta.label}</Badge>
                    <Badge variant="outline" className="text-[10px] uppercase">{f.level}</Badge>
                    <Badge variant="outline" className="text-[10px] font-mono">{f.source}</Badge>
                    {f.link && (
                      <a href={f.link} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open remediation docs">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{f.remediation}</p>
                  <code className="text-[10px] font-mono text-muted-foreground">{f.id}</code>
                </div>
              </div>
            </Card>
          );
        })}
        {visible.length === 0 && (
          <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">No findings match the current filter.</Card>
        )}
      </div>
    </>
  );
}