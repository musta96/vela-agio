import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { CreditCard, ArrowUpRight, Sparkles, AlertTriangle, Zap, Calendar, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { useAuth } from "@/hooks/useAuth";
import { useAiCredits } from "@/hooks/useAiCredits";
import { useFlag } from "@/hooks/useFeatureFlags";
import { toast } from "sonner";

type SubRow = {
  id: string;
  status: string;
  price_id: string | null;
  product_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  stripe_customer_id: string | null;
};

type PlanRow = {
  id: string;
  slug: string | null;
  name: string;
  tier: string | null;
  monthly_price_cents: number | null;
  yearly_price_cents: number | null;
  ai_monthly_quota: number | null;
  ai_model_tier: string | null;
  monthly_credit_cap: number | null;
  features: any;
  stripe_monthly_price_id: string | null;
  stripe_yearly_price_id: string | null;
  highlighted: boolean | null;
  sort_order: number | null;
  is_active: boolean | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return iso; }
}

function formatPrice(cents: number | null, period: "mo" | "yr"): string {
  if (cents == null) return "—";
  if (cents === 0) return "Free";
  return `€${(cents / 100).toFixed(0)}/${period}`;
}

function StatusBadge({ status, cancel }: { status: string; cancel?: boolean | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
    trialing: { label: "Trialing", cls: "bg-sky-500/10 text-sky-600 border-sky-500/30" },
    past_due: { label: "Past due", cls: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
    canceled: { label: "Canceled", cls: "bg-muted text-muted-foreground border-border" },
    incomplete: { label: "Incomplete", cls: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
    paused: { label: "Paused", cls: "bg-muted text-muted-foreground border-border" },
  };
  const m = map[status] || { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={m.cls}>{m.label}</Badge>
      {cancel ? <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Ends at period end</Badge> : null}
    </div>
  );
}

export default function PlansBilling() {
  const { user } = useAuth();
  const pricingEnabled = useFlag("pricing", false);
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<SubRow | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [portalLoading, setPortalLoading] = useState(false);
  const credits = useAiCredits();

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [subRes, plansRes] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("id,status,price_id,product_id,current_period_start,current_period_end,cancel_at_period_end,stripe_customer_id")
          .eq("user_id", user.id)
          .eq("environment", getStripeEnvironment())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("subscription_plans")
          .select("id,slug,name,tier,monthly_price_cents,yearly_price_cents,ai_monthly_quota,ai_model_tier,monthly_credit_cap,features,stripe_monthly_price_id,stripe_yearly_price_id,highlighted,sort_order,is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);
      if (cancelled) return;
      setSub((subRes.data as any) ?? null);
      setPlans(((plansRes.data as any[]) || []) as PlanRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const matchedPlan: PlanRow | null = (() => {
    if (!sub?.price_id || plans.length === 0) return null;
    return (
      plans.find(p => p.stripe_monthly_price_id === sub.price_id || p.stripe_yearly_price_id === sub.price_id)
      ?? null
    );
  })();

  const isActive = sub && ["active", "trialing", "past_due"].includes(sub.status);
  const onFree = !sub || sub.status === "canceled";

  const handlePortal = async () => {
    if (!sub) return;
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: { environment: getStripeEnvironment(), returnUrl: `${window.location.origin}/plans-billing` },
      });
      if (error || !(data as any)?.url) throw new Error((data as any)?.error || error?.message || "Could not open billing portal");
      window.open((data as any).url as string, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e.message || "Unable to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  // ---- Render -----------------------------------------------------------

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO title="Plans & Billing | Vela.ai" description="Manage your Vela subscription, monitor AI credit usage, and upgrade your plan." path="/plans-billing" />

      <PageHeader
        icon={CreditCard}
        title="Plans & Billing"
        description="Your current plan, credit usage, and upgrade options."
        actions={
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/pricing"><Sparkles className="h-4 w-4" /> See all plans</Link>
          </Button>
        }
      />

      {/* Current plan ------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                Current plan
                {!loading && (
                  isActive
                    ? <StatusBadge status={sub!.status} cancel={sub?.cancel_at_period_end} />
                    : pricingEnabled
                      ? <Badge variant="outline">Free</Badge>
                      : <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Launch promo · Free</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {loading
                  ? "Loading subscription details…"
                  : isActive
                    ? "Active subscription. Manage payment method, invoices and cancellation in the billing portal."
                    : pricingEnabled
                      ? "You're on the free Explorer tier. Upgrade any time to unlock more AI credits and real-time data."
                      : "Vela is fully free during launch. Founding members keep preferred pricing forever once paid tiers ship."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {isActive && (
                <Button onClick={handlePortal} variant="outline" size="sm" className="gap-2" disabled={portalLoading}>
                  {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Manage billing
                </Button>
              )}
              {pricingEnabled && (
                <Button asChild size="sm" className="gap-2">
                  <Link to="/pricing">
                    <ArrowUpRight className="h-4 w-4" /> {isActive ? "Change plan" : "Upgrade"}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid sm:grid-cols-3 gap-4">
              <Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" />
            </div>
          ) : (
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Plan</div>
                <div className="mt-1 font-semibold text-base">
                  {matchedPlan?.name ?? (isActive ? "Subscribed plan" : pricingEnabled ? "Explorer (Free)" : "Launch promo")}
                </div>
                {matchedPlan && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {sub?.price_id === matchedPlan.stripe_yearly_price_id
                      ? formatPrice(matchedPlan.yearly_price_cents, "yr")
                      : formatPrice(matchedPlan.monthly_price_cents, "mo")}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Calendar className="h-3 w-3" /> Renews</div>
                <div className="mt-1 font-semibold text-base">
                  {isActive ? formatDate(sub?.current_period_end ?? null) : "—"}
                </div>
                {sub?.cancel_at_period_end && (
                  <div className="text-xs text-amber-600 mt-1">Will not renew</div>
                )}
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Billing since</div>
                <div className="mt-1 font-semibold text-base">
                  {isActive ? formatDate(sub?.current_period_start ?? null) : "—"}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Credit usage --------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> AI credit usage</CardTitle>
          <CardDescription>
            Your AI Copilot, research and signal usage for the current month.
            {credits.status?.source === "byo" && " You're using your own provider key — no Vela quota consumed."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {credits.loading && !credits.status ? (
            <Skeleton className="h-16" />
          ) : credits.unlimited ? (
            <div className="text-sm">
              <div className="font-semibold">Unlimited AI access</div>
              <p className="text-muted-foreground text-xs mt-1">
                {credits.status?.source === "byo"
                  ? `Powered by your own ${credits.status.byoProvider || "provider"} key.`
                  : "Your tier includes unlimited AI requests this month."}
              </p>
            </div>
          ) : credits.hasCap ? (
            <div className="space-y-2">
              <div className="flex items-end justify-between text-sm">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">This month</div>
                  <div className="font-semibold text-lg">
                    {credits.used.toLocaleString()} / {(credits.status?.quotaLimit ?? 0).toLocaleString()}
                  </div>
                </div>
                <div className={`text-xs ${credits.exhausted ? "text-destructive" : "text-muted-foreground"}`}>
                  {credits.remaining?.toLocaleString()} remaining
                </div>
              </div>
              <Progress value={credits.pctUsed} className={credits.exhausted ? "[&>div]:bg-destructive" : ""} />
              {credits.exhausted && (
                <div className="flex items-start gap-2 text-xs text-destructive rounded-md border border-destructive/30 bg-destructive/5 p-3 mt-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    You've used all your AI credits this month. Paper trading and non-AI features keep working.
                    {pricingEnabled && (
                      <> <Link to="/pricing" className="underline font-medium">Upgrade your plan</Link> for more capacity.</>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              AI is not currently available on your plan.{" "}
              {pricingEnabled && (
                <Link to="/pricing" className="underline text-foreground">Upgrade to enable AI features →</Link>
              )}
            </div>
          )}

          <Separator />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Need a detailed breakdown by feature?</span>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs gap-1">
              <Link to="/ai-usage">View usage history <ArrowUpRight className="h-3 w-3" /></Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade options (shows tiers when pricing flag enabled) ------------ */}
      {pricingEnabled && plans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Available plans</CardTitle>
            <CardDescription>
              Pick the tier that matches how you invest. You'll be redirected to checkout where any active price experiments apply.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((p) => {
                const isCurrent = matchedPlan?.id === p.id;
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border p-4 flex flex-col ${
                      isCurrent ? "border-primary/60 bg-primary/5" : p.highlighted ? "border-primary/30" : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{p.name}</div>
                      {isCurrent
                        ? <Badge className="text-[10px]">Current</Badge>
                        : p.highlighted ? <Badge variant="outline" className="text-[10px]">Popular</Badge> : null}
                    </div>
                    <div className="text-2xl font-bold">{formatPrice(p.monthly_price_cents, "mo")}</div>
                    {p.yearly_price_cents != null && p.yearly_price_cents > 0 && (
                      <div className="text-xs text-muted-foreground">or {formatPrice(p.yearly_price_cents, "yr")}</div>
                    )}
                    <ul className="text-xs text-muted-foreground space-y-1 mt-3 flex-1">
                      {Array.isArray(p.features) && (p.features as any[]).slice(0, 5).map((f, i) => (
                        <li key={i}>• {String(f)}</li>
                      ))}
                      {p.ai_monthly_quota != null && (
                        <li>• {p.ai_monthly_quota === -1 ? "Unlimited" : p.ai_monthly_quota.toLocaleString()} AI credits / month</li>
                      )}
                    </ul>
                    <Button
                      asChild
                      size="sm"
                      variant={isCurrent ? "outline" : p.highlighted ? "default" : "outline"}
                      className="mt-4 w-full"
                      disabled={isCurrent}
                    >
                      <Link to={`/pricing?plan=${encodeURIComponent(p.slug || p.tier || p.id)}`}>
                        {isCurrent ? "Current plan" : "Choose"}
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}