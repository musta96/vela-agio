import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { OwnerPageHeader, KpiStrip } from "@/components/owner/OwnerLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Eye, Key, ArrowUp, Ban, Download, Trash2, Lock, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { RecommendationVerdictOverrideCard } from "@/components/owner/RecommendationVerdictOverrideCard";
import { ManualPlanCard } from "@/components/owner/ManualPlanCard";

export default function OwnerUserProfile() {
  const { id } = useParams<{ id: string }>();
  const { user: admin } = useAuth();
  const [p, setP] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [suspended, setSuspended] = useState(false);
  const [consent, setConsent] = useState<{ scope: string; granted_at: string; mandate_ref: string | null } | null>(null);
  const [advisoryData, setAdvisoryData] = useState<{ portfolios: number; holdings: number; nw_accounts: number } | null>(null);

  useEffect(() => { if (!id) return; (async () => {
    const [{ data: prof }, { data: ax }, { data: sus }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", id).maybeSingle(),
      supabase.from("audit_log").select("id,ts,action,entity").or(`actor_id.eq.${id},entity_id.eq.${id}`).order("ts", { ascending: false }).limit(8),
      supabase.from("user_suspensions").select("user_id").eq("user_id", id).maybeSingle(),
    ]);
    setP(prof); setAudit(ax || []); setSuspended(!!sus);
  })(); }, [id]);

  useEffect(() => {
    if (!id || !admin) return;
    (async () => {
      const { data } = await supabase
        .from("advisory_consents")
        .select("scope, granted_at, mandate_ref")
        .eq("user_id", id)
        .eq("granted_to", admin.id)
        .is("revoked_at", null)
        .order("granted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setConsent(data ?? null);
      if (data) {
        // Only count, never expose symbols/amounts to UI without the user opening detail views with their own consent flow.
        const [{ count: portfolios }, { count: holdings }, { count: nw }] = await Promise.all([
          supabase.from("portfolios").select("*", { count: "exact", head: true }).eq("user_id", id),
          supabase.from("portfolio_holdings").select("*", { count: "exact", head: true }).eq("user_id", id),
          supabase.from("net_worth_accounts").select("*", { count: "exact", head: true }).eq("user_id", id),
        ]);
        setAdvisoryData({ portfolios: portfolios ?? 0, holdings: holdings ?? 0, nw_accounts: nw ?? 0 });
      }
    })();
  }, [id, admin?.id]);

  const requestMandate = async () => {
    // Future: trigger a notification / email to the client asking them to sign a mandate.
    alert("A mandate request would be sent to the user. Until they grant advisory access from their Settings → Privacy page, their portfolio is not visible to admins.");
  };

  const initials = (p?.display_name || "??").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <div className="text-xs text-muted-foreground mb-3"><Link to="/owner/users" className="hover:underline">Users</Link> › {p?.display_name || "…"}</div>
      <div className="flex items-start gap-4 mb-6">
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center text-lg font-bold text-primary-foreground">{initials}</div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{p?.display_name || "-"}</h1>
          <p className="text-sm text-muted-foreground">User · Pro plan since {p?.created_at ? format(new Date(p.created_at), "d MMM yyyy") : "-"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Eye className="h-4 w-4 mr-1.5" />Impersonate</Button>
          <Button variant="outline" size="sm"><Key className="h-4 w-4 mr-1.5" />Reset password</Button>
          <Button variant="outline" size="sm" className="border-warning/40 text-warning"><ArrowUp className="h-4 w-4 mr-1.5" />Upgrade plan</Button>
          <Button variant="outline" size="sm" className="border-destructive/30 text-destructive"><Ban className="h-4 w-4 mr-1.5" />{suspended ? "Unsuspend" : "Suspend"}</Button>
        </div>
      </div>

      <KpiStrip items={[
        { label: "Plan", value: "Pro", sub: `Since ${p?.created_at ? format(new Date(p.created_at), "MMM yyyy") : "-"}` },
        { label: "Total spend", value: "€245", sub: "5 invoices" },
        { label: "API calls", value: "4,820", sub: "This month" },
        { label: "Signals viewed", value: "312", sub: "Last 30 days" },
      ]} />

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-semibold">Account details</h3><Button variant="outline" size="sm">Edit</Button></div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {[
              ["Full name", p?.display_name || "-"],
              ["User ID", p?.user_id ? `#${p.user_id.slice(0,4)}` : "-"],
              ["Country", p?.country_residence || "-"],
              ["2FA", "✓ Enabled"],
              ["Joined", p?.created_at ? format(new Date(p.created_at), "d MMMM yyyy") : "-"],
              ["Last login", "2 minutes ago"],
            ].map(([k, v]) => (
              <div key={String(k)}><dt className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">{k}</dt><dd className="mt-1">{v as any}</dd></div>
            ))}
          </dl>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4">Activity log</h3>
          <ul className="space-y-2.5 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex items-center gap-3 text-[13px]">
                <span className="text-[11px] font-mono text-muted-foreground w-12">{format(new Date(a.ts), "HH:mm")}</span>
                <span>{a.action}</span>
                {a.entity && <span className="ml-auto text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-muted">{a.entity}</span>}
              </li>
            ))}
            {!audit.length && <li className="text-xs text-muted-foreground">No recorded activity.</li>}
          </ul>
        </div>

        {/* Advisory data - gated by user consent (MiFID-aligned) */}
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {consent ? <ShieldCheck className="h-4 w-4 text-success" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
              <h3 className="text-sm font-semibold">Portfolio & net-worth data</h3>
            </div>
            {consent ? (
              <span className="text-[11px] rounded-full bg-success/10 text-success border border-success/30 px-2 py-0.5">
                Mandate active · {consent.scope}
              </span>
            ) : (
              <span className="text-[11px] rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5">
                Locked - no advisory mandate
              </span>
            )}
          </div>
          {consent ? (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                Access granted by user on {format(new Date(consent.granted_at), "d MMM yyyy")}
                {consent.mandate_ref ? ` · Mandate ref: ${consent.mandate_ref}` : ""}. All views are audited.
              </p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><dt className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">Portfolios</dt><dd className="mt-1 text-lg font-semibold">{advisoryData?.portfolios ?? "-"}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">Holdings</dt><dd className="mt-1 text-lg font-semibold">{advisoryData?.holdings ?? "-"}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">Net-worth accounts</dt><dd className="mt-1 text-lg font-semibold">{advisoryData?.nw_accounts ?? "-"}</dd></div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4">
              <p className="text-sm text-muted-foreground mb-3">
                Without a signed advisory mandate from this user, admins cannot view their portfolio, holdings, or net-worth details.
                This protects the platform and complies with EU MiFID II rules around personalised advice.
              </p>
              <Button size="sm" variant="outline" onClick={requestMandate}>
                <ShieldCheck className="h-4 w-4 mr-1.5" /> Request advisory mandate
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4">Subscription & billing</h3>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-muted-foreground">Current plan</dt><dd>PRO · €49/mo</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Next billing</dt><dd>26 Jun 2025</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Payment method</dt><dd>Visa - 4242</dd></div>
          </dl>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm">Issue refund</Button>
            <Button variant="outline" size="sm">Add credit</Button>
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30">Cancel sub</Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4">GDPR & data</h3>
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start"><Download className="h-4 w-4 mr-2" />Export user data (SAR)</Button>
            <Button variant="outline" className="w-full justify-start text-destructive border-destructive/30"><Trash2 className="h-4 w-4 mr-2" />Delete & anonymise</Button>
          </div>
        </div>

        {id && (
          <div className="lg:col-span-2">
            <ManualPlanCard userId={id} />
          </div>
        )}

        {id && (
          <div className="lg:col-span-2">
            <RecommendationVerdictOverrideCard userId={id} />
          </div>
        )}
      </div>
    </>
  );
}