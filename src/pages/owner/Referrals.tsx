import { useEffect, useState } from "react";
import { OwnerPageHeader } from "@/components/owner/OwnerLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Plus, RefreshCw, Trash2, Link as LinkIcon, Sparkles, Tag, Download, BarChart3, ScrollText } from "lucide-react";

type Code = {
  id: string;
  code: string;
  label: string | null;
  description: string | null;
  kind: "beta" | "discount";
  percent_off: number | null;
  stripe_coupon_id: string | null;
  plan_id: string | null;
  max_uses: number | null;
  uses_count: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
};

type Plan = { id: string; name: string; tier: string | null };

type Analytics = {
  code_id: string;
  code: string;
  label: string | null;
  kind: "beta" | "discount";
  active: boolean;
  expires_at: string | null;
  plan_id: string | null;
  plan_name: string | null;
  percent_off: number | null;
  stripe_coupon_id: string | null;
  max_uses: number | null;
  uses_count: number;
  redemptions: number;
  unique_users: number;
  paid_signups: number;
  beta_signups: number;
  last_redeemed_at: string | null;
};

type RedemptionRow = {
  redemption_id: string;
  redeemed_at: string;
  code: string;
  code_label: string | null;
  kind: "beta" | "discount";
  user_id: string;
  user_email: string | null;
  plan_name: string | null;
  percent_off: number | null;
  stripe_coupon_id: string | null;
  current_sub_status: string | null;
  current_plan_name: string | null;
  has_beta_role: boolean;
};

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map(r => cols.map(c => escape(r[c])).join(","))].join("\n");
}
function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function rand(len = 8) {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => a[Math.floor(Math.random() * a.length)]).join("");
}

export default function OwnerReferralsPage() {
  const [rows, setRows] = useState<Code[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [logLoading, setLogLoading] = useState(false);

  // new code form
  const [code, setCode] = useState(rand());
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"beta" | "discount">("beta");
  const [percent, setPercent] = useState<string>("");
  const [coupon, setCoupon] = useState("");
  const [planId, setPlanId] = useState<string>("any");
  const [maxUses, setMaxUses] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");

  async function load() {
    setLoading(true);
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("referral_codes" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("subscription_plans" as any).select("id, name, tier").order("sort_order"),
    ]);
    setRows((c as any) || []);
    setPlans((p as any) || []);
    setLoading(false);
    void loadAnalytics();
    void loadLog();
  }

  async function loadAnalytics() {
    setAnalyticsLoading(true);
    const { data, error } = await supabase.rpc("admin_referral_analytics" as any);
    if (error) toast.error(error.message);
    setAnalytics(((data as any) || []) as Analytics[]);
    setAnalyticsLoading(false);
  }
  async function loadLog() {
    setLogLoading(true);
    const { data, error } = await supabase.rpc("admin_referral_redemption_log" as any, { _limit: 1000 });
    if (error) toast.error(error.message);
    setRedemptions(((data as any) || []) as RedemptionRow[]);
    setLogLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!code.trim()) return toast.error("Code required");
    if (kind === "discount" && !percent && !coupon) return toast.error("Discount needs a percent_off or a Stripe coupon ID");
    const payload: any = {
      code: code.trim().toUpperCase(),
      label: label || null,
      description: description || null,
      kind,
      percent_off: percent ? Number(percent) : null,
      stripe_coupon_id: coupon || null,
      plan_id: planId === "any" ? null : planId,
      max_uses: maxUses ? Number(maxUses) : null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      active: true,
    };
    const { error } = await supabase.from("referral_codes" as any).insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Referral code created");
    setCode(rand()); setLabel(""); setDescription(""); setPercent(""); setCoupon(""); setMaxUses(""); setExpiresAt("");
    load();
  }

  async function toggle(row: Code) {
    const { error } = await supabase.from("referral_codes" as any).update({ active: !row.active }).eq("id", row.id);
    if (error) return toast.error(error.message);
    load();
  }
  async function remove(row: Code) {
    if (!confirm(`Delete code ${row.code}? Existing redemptions stay.`)) return;
    const { error } = await supabase.from("referral_codes" as any).delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  }

  function linkFor(c: string) {
    return `${window.location.origin}/r/${encodeURIComponent(c)}`;
  }
  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  // --- Aggregations for the analytics panel ---
  const totalRedemptions = analytics.reduce((s, a) => s + Number(a.redemptions || 0), 0);
  const totalPaidSignups = analytics.reduce((s, a) => s + Number(a.paid_signups || 0), 0);
  const totalBetaSignups = analytics.reduce((s, a) => s + Number(a.beta_signups || 0), 0);

  // Roll up redemptions per plan (using the plan applied at redemption time).
  const byPlan = (() => {
    const map = new Map<string, { plan: string; redemptions: number; paid: number; beta: number }>();
    for (const a of analytics) {
      const key = a.plan_name || (a.kind === "beta" ? "(Beta — any plan)" : "(Any plan)");
      const cur = map.get(key) || { plan: key, redemptions: 0, paid: 0, beta: 0 };
      cur.redemptions += Number(a.redemptions || 0);
      cur.paid += Number(a.paid_signups || 0);
      cur.beta += Number(a.beta_signups || 0);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.redemptions - a.redemptions);
  })();

  function exportAnalyticsCSV() {
    if (analytics.length === 0) return toast.error("No analytics to export");
    downloadCSV(`referral-analytics-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(analytics as any));
    toast.success("Analytics exported");
  }
  function exportLogCSV() {
    if (redemptions.length === 0) return toast.error("No redemptions to export");
    downloadCSV(`referral-redemptions-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(redemptions as any));
    toast.success("Redemption log exported");
  }

  return (
    <>
      <OwnerPageHeader
        title="Referral codes & beta access"
        subtitle="Generate signup links that grant beta-tester access (everything free) or apply a discount to checkout. Toggle, expire, or delete codes any time."
        actions={<Button variant="outline" size="sm" onClick={load} className="gap-2"><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />

      {/* Create */}
      <Card className="p-5 mb-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2"><Plus className="h-4 w-4" /> New code</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Code</Label>
            <div className="flex gap-1.5">
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              <Button variant="outline" size="icon" onClick={() => setCode(rand())} title="Generate"><Sparkles className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="beta">Beta tester (full free access)</SelectItem>
                <SelectItem value="discount">Discount on a paid plan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Label (internal)</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Launch beta wave 1" />
          </div>

          {kind === "discount" && (
            <>
              <div className="space-y-1.5">
                <Label>Percent off</Label>
                <Input type="number" min={1} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="e.g. 20" />
              </div>
              <div className="space-y-1.5">
                <Label>Stripe coupon ID (optional)</Label>
                <Input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="coupon_xxx" />
                <p className="text-[11px] text-muted-foreground">If set, this coupon is applied automatically at checkout.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Restricted to plan</Label>
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any plan</SelectItem>
                    {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>Max uses</Label>
            <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" />
          </div>
          <div className="space-y-1.5">
            <Label>Expires at</Label>
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label>Description (internal)</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes for your team — not shown to users." />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={create} className="gap-2"><Plus className="h-4 w-4" /> Create code</Button>
        </div>
      </Card>

      {/* List */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">Active codes</h2>
          <span className="text-xs text-muted-foreground">{rows.length} total</span>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No codes yet. Create your first one above — perfect for beta testers.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Code</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Discount / Plan</th>
                  <th className="text-left px-4 py-2">Uses</th>
                  <th className="text-left px-4 py-2">Expires</th>
                  <th className="text-left px-4 py-2">Active</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const planName = r.plan_id ? plans.find((p) => p.id === r.plan_id)?.name ?? "—" : "Any";
                  const expired = r.expires_at && new Date(r.expires_at) < new Date();
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-2 font-mono font-semibold">
                        <div className="flex items-center gap-2">
                          {r.code}
                          <button onClick={() => copy(r.code)} title="Copy code"><Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" /></button>
                          <button onClick={() => copy(linkFor(r.code))} title="Copy signup link"><LinkIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" /></button>
                        </div>
                        {r.label && <div className="text-[11px] font-normal text-muted-foreground mt-0.5">{r.label}</div>}
                      </td>
                      <td className="px-4 py-2">
                        {r.kind === "beta"
                          ? <Badge className="bg-primary/15 text-primary border-primary/30">Beta · free</Badge>
                          : <Badge variant="outline" className="gap-1"><Tag className="h-3 w-3" /> Discount</Badge>}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {r.kind === "beta"
                          ? "Full access while role assigned"
                          : <>
                              {r.percent_off ? <span className="font-semibold">{r.percent_off}% off</span> : null}
                              {r.stripe_coupon_id && <span className="ml-1 text-muted-foreground">· {r.stripe_coupon_id}</span>}
                              <div className="text-muted-foreground">{planName}</div>
                            </>}
                      </td>
                      <td className="px-4 py-2 tabular-nums">{r.uses_count}{r.max_uses ? ` / ${r.max_uses}` : ""}</td>
                      <td className="px-4 py-2 text-xs">
                        {r.expires_at ? (
                          <span className={expired ? "text-destructive" : ""}>{new Date(r.expires_at).toLocaleString()}</span>
                        ) : <span className="text-muted-foreground">Never</span>}
                      </td>
                      <td className="px-4 py-2"><Switch checked={r.active && !expired} onCheckedChange={() => toggle(r)} /></td>
                      <td className="px-4 py-2 text-right">
                        <Button variant="ghost" size="icon" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground mt-4">
        Share signup links as <span className="font-mono">{window.location.origin}/r/CODE</span>. Beta codes also auto-grant the
        <Badge variant="outline" className="mx-1">beta_tester</Badge> role — you can revoke any user's beta access from <a href="/owner/roles" className="text-primary hover:underline">Roles & access</a>.
      </p>
    </>
  );
}