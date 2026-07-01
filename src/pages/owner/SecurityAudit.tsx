import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, Shield, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";

type RlsRow = { table_name: string; rls_enabled: boolean; policy_count: number; allows_anon_select: boolean };
type BlockRow = { feature_key: string; blocks: number; unique_users: number; last_block: string };

// Tables that legitimately allow anonymous reads (public content).
const ANON_READ_ALLOWLIST = new Set<string>([
  "landing_globals",
  "landing_sections",
  "landing_settings",
  "landing_versions",
  "legal_documents",
  "platform_banners",
  "subscription_plans",
  "feature_catalog",
  "feature_flags",
  "health_checks",
]);

export default function OwnerSecurityAudit() {
  const [rls, setRls] = useState<RlsRow[] | null>(null);
  const [blocks, setBlocks] = useState<BlockRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    const [rlsRes, blkRes] = await Promise.all([
      supabase.rpc("admin_rls_audit" as any),
      supabase.rpc("admin_feature_block_summary" as any, {}),
    ]);
    if (rlsRes.error) setErr(rlsRes.error.message);
    setRls(((rlsRes.data as any) || []) as RlsRow[]);
    setBlocks(((blkRes.data as any) || []) as BlockRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (loading && !rls) {
    return <Card className="p-10 flex items-center justify-center text-muted-foreground text-sm gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading security audit…</Card>;
  }

  const rlsDisabled = (rls || []).filter((r) => !r.rls_enabled);
  const anonReadable = (rls || []).filter((r) => r.allows_anon_select && !ANON_READ_ALLOWLIST.has(r.table_name));
  const noPolicies = (rls || []).filter((r) => r.rls_enabled && r.policy_count === 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Shield className="h-5 w-5" /> Security audit</h2>
          <p className="text-xs text-muted-foreground">Row-level security coverage and recent feature gate blocks. Read-only diagnostics.</p>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
      </div>

      {err && <Card className="p-3 border-destructive/40 text-destructive text-xs">{err}</Card>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Tables with RLS disabled" value={rlsDisabled.length} tone={rlsDisabled.length ? "err" : "ok"} />
        <StatCard label="Anon-readable (unexpected)" value={anonReadable.length} tone={anonReadable.length ? "warn" : "ok"} />
        <StatCard label="RLS on but 0 policies" value={noPolicies.length} tone={noPolicies.length ? "warn" : "ok"} />
      </div>

      {(rlsDisabled.length > 0 || anonReadable.length > 0 || noPolicies.length > 0) && (
        <Card className="p-4 border-amber-400/40 bg-amber-400/5">
          <div className="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="h-4 w-4" />
            <div className="font-semibold text-sm">Attention required</div>
          </div>
          <ul className="text-xs space-y-1">
            {rlsDisabled.map((r) => <li key={`d-${r.table_name}`}>• RLS <b>disabled</b> on <code className="font-mono">{r.table_name}</code></li>)}
            {noPolicies.map((r) => <li key={`n-${r.table_name}`}>• <code className="font-mono">{r.table_name}</code> has RLS on but no policies — nothing is accessible via PostgREST</li>)}
            {anonReadable.map((r) => <li key={`a-${r.table_name}`}>• <code className="font-mono">{r.table_name}</code> allows anonymous SELECT and is not on the public-content allow-list</li>)}
          </ul>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">RLS coverage · public schema</h3>
          <Badge variant="outline" className="text-[10px]">{rls?.length ?? 0} tables</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground border-b">
              <tr>
                <th className="text-left py-1.5">Table</th>
                <th className="text-center py-1.5">RLS</th>
                <th className="text-center py-1.5">Policies</th>
                <th className="text-center py-1.5">Anon SELECT</th>
              </tr>
            </thead>
            <tbody>
              {(rls || []).map((r) => (
                <tr key={r.table_name} className="border-b last:border-0">
                  <td className="py-1.5 font-mono">{r.table_name}</td>
                  <td className="text-center">{r.rls_enabled ? <CheckCircle2 className="inline h-3.5 w-3.5 text-success" /> : <XCircle className="inline h-3.5 w-3.5 text-destructive" />}</td>
                  <td className="text-center tabular-nums">{r.policy_count}</td>
                  <td className="text-center">
                    {r.allows_anon_select
                      ? (ANON_READ_ALLOWLIST.has(r.table_name)
                          ? <Badge variant="outline" className="text-[9px]">public OK</Badge>
                          : <Badge className="text-[9px] bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-400/40">check</Badge>)
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Recent feature-gate blocks (30d)</h3>
          <Badge variant="outline" className="text-[10px]">{blocks?.length ?? 0} features</Badge>
        </div>
        {(!blocks || blocks.length === 0) ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No feature blocks recorded in the last 30 days.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground border-b">
              <tr><th className="text-left py-1.5">Feature</th><th className="text-right py-1.5">Blocks</th><th className="text-right py-1.5">Users</th><th className="text-right py-1.5">Last</th></tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.feature_key} className="border-b last:border-0">
                  <td className="py-1.5 font-mono">{b.feature_key}</td>
                  <td className="text-right tabular-nums">{b.blocks}</td>
                  <td className="text-right tabular-nums">{b.unique_users}</td>
                  <td className="text-right text-muted-foreground">{new Date(b.last_block).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "err" }) {
  const cls = tone === "ok" ? "text-success" : tone === "warn" ? "text-amber-500" : "text-destructive";
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${cls}`}>{value}</div>
    </Card>
  );
}