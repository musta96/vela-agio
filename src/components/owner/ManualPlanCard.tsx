import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Gift, Loader2, RefreshCw, Ban } from "lucide-react";
import { getStripeEnvironment } from "@/lib/stripe";

type Plan = { slug: string; name: string; tier: string | null; stripe_monthly_price_id: string | null; stripe_yearly_price_id: string | null };
type Sub = { price_id: string; status: string; current_period_end: string | null; environment: string; stripe_subscription_id: string };

/** Owner-only card: grant or revoke a paid plan manually, no payment required. */
export function ManualPlanCard({ userId }: { userId: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [slug, setSlug] = useState("pro");
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [months, setMonths] = useState("12");
  const [busy, setBusy] = useState(false);

  const environment = getStripeEnvironment();

  const loadStatus = async () => {
    const { data, error } = await supabase.functions.invoke("admin-set-plan", {
      body: { action: "status", userId },
    });
    if (error) return;
    setSubs(((data as any)?.subscriptions ?? []) as Sub[]);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("slug,name,tier,stripe_monthly_price_id,stripe_yearly_price_id")
        .eq("is_active", true)
        .order("sort_order");
      setPlans((data as any[]) ?? []);
      void loadStatus();
    })();
  }, [userId]);

  const run = async (payload: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-set-plan", {
        body: { userId, environment, ...payload },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(okMsg);
      await loadStatus();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const current = subs.find((s) => s.environment === environment && s.status === "active");
  const comped = current?.stripe_subscription_id?.startsWith("comp_");

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Gift className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Manual plan (comp)</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-muted text-muted-foreground">{environment}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Grant full plan access without a payment — useful for partners, beta users, refunds and support goodwill.
      </p>

      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs mb-4">
        {current ? (
          <>
            Active: <span className="font-semibold">{current.price_id}</span> · {current.status}
            {current.current_period_end ? ` · until ${new Date(current.current_period_end).toLocaleDateString()}` : ""}
            {comped ? " · comped" : " · paid (Stripe)"}
          </>
        ) : (
          <>No active subscription in this environment — user is on the free tier.</>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-[11px]">Plan</Label>
          <Select value={slug} onValueChange={setSlug}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {plans.map((p) => <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px]">Billing cycle</Label>
          <Select value={cycle} onValueChange={(v) => setCycle(v as any)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px]">Duration (months)</Label>
          <Input className="h-9" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <Button size="sm" disabled={busy} onClick={() => run({ planSlug: slug, cycle, months: Number(months) || 12 }, "Plan granted")}>
          {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Gift className="h-4 w-4 mr-1.5" />}
          Grant plan
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ planSlug: null }, "Comped plan revoked")}>
          <Ban className="h-4 w-4 mr-1.5" /> Revoke comp
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void loadStatus()}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        Revoking only removes manually granted access — real Stripe subscriptions are never touched here.
      </p>
    </div>
  );
}
