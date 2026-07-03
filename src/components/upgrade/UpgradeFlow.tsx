import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useAiCredits } from "@/hooks/useAiCredits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Check, ArrowUpRight, Info, RefreshCw } from "lucide-react";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { toast } from "sonner";

type Cycle = "monthly" | "annual";

type ProPlan = {
  monthly_cents: number;
  annual_cents: number;
  monthly_lookup: string;
  annual_lookup: string;
  ai_quota: number | null;
};

// Pro benefits framed against Free-tier gaps.
const PRO_BENEFITS: { key: string; label: string; freeGap: string }[] = [
  { key: "ai_unlimited", label: "Unlimited AI questions & scans", freeGap: "Free is capped at 5 AI questions/month" },
  { key: "portfolios", label: "Unlimited portfolios & positions", freeGap: "Free allows 1 portfolio, 10 positions" },
  { key: "watchlist", label: "Unlimited watchlist tickers", freeGap: "Free is capped at 5 tickers" },
  { key: "advanced_analytics", label: "Backtesting, optimizer, Monte Carlo & VaR", freeGap: "Locked on Free" },
  { key: "advisor", label: "Vela Advisor multi-strategy engine", freeGap: "Locked on Free" },
  { key: "reports", label: "Institutional-grade PDF reports", freeGap: "Locked on Free" },
  { key: "realtime", label: "Real-time market data & alerts", freeGap: "Free is delayed data" },
  { key: "priority_support", label: "Priority support", freeGap: "Community support only" },
];

interface Props {
  /** Optional feature key the user just hit — used to reorder benefits + headline copy. */
  contextFeatureKey?: string;
  contextFeatureName?: string;
  /** Path to return to after successful upgrade. Defaults to current path. */
  returnPath?: string;
  /** Render more compact for modal context. */
  compact?: boolean;
  /** Called after Stripe checkout is mounted (parent may want to hide surrounding chrome). */
  onCheckoutMounted?: () => void;
}

export function UpgradeFlow({ contextFeatureKey, contextFeatureName, returnPath, compact, onCheckoutMounted }: Props) {
  const { user } = useAuth();
  const ent = useEntitlements();
  const credits = useAiCredits();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle>("annual");
  const [plan, setPlan] = useState<ProPlan | null>(null);
  const [portfolioCount, setPortfolioCount] = useState<number | null>(null);
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [switchingCycle, setSwitchingCycle] = useState(false);
  const [switchStatus, setSwitchStatus] = useState<null | { ok: boolean; msg: string }>(null);

  // Load Pro plan pricing + Stripe lookup keys.
  useEffect(() => {
    supabase.from("subscription_plans")
      .select("monthly_price_cents, yearly_price_cents, stripe_monthly_price_id, stripe_yearly_price_id, ai_monthly_quota")
      .eq("tier", "pro").eq("is_active", true).limit(1).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setPlan({
          monthly_cents: (data as any).monthly_price_cents ?? 2900,
          annual_cents: (data as any).yearly_price_cents ?? 29000,
          monthly_lookup: (data as any).stripe_monthly_price_id ?? "pro_monthly",
          annual_lookup: (data as any).stripe_yearly_price_id ?? "pro_annual",
          ai_quota: (data as any).ai_monthly_quota ?? null,
        });
      });
  }, []);

  // Load usage counts to render "4/5 used".
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [p, w] = await Promise.all([
        supabase.from("portfolios").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("watchlist_items").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      setPortfolioCount(p.count ?? 0);
      setWatchlistCount(w.count ?? 0);
    })();
  }, [user?.id]);

  const isProLike = ent.tier === "pro" || ent.tier === "elite" || ent.tier === "plus";
  const activeCycleForSub: Cycle | null = useMemo(() => {
    // Match sub price_id against monthly/yearly lookups later; for now derive from profile
    return null;
  }, []);

  const monthly = plan?.monthly_cents ?? 2900;
  const annual = plan?.annual_cents ?? 29000;
  const annualPerMonth = Math.round(annual / 12);
  const monthlyOverYear = monthly * 12;
  const annualSavings = Math.max(0, monthlyOverYear - annual);
  const savingsPct = Math.round((annualSavings / monthlyOverYear) * 100);

  const priceForCycle = cycle === "annual" ? annual : monthly;
  const lookupForCycle = cycle === "annual" ? plan?.annual_lookup : plan?.monthly_lookup;

  // Reorder benefits so the context feature is first.
  const orderedBenefits = useMemo(() => {
    if (!contextFeatureKey) return PRO_BENEFITS;
    // naive: put ai first if context involves ai, portfolios first if portfolios, etc.
    const key = contextFeatureKey.toLowerCase();
    return [...PRO_BENEFITS].sort((a, b) => {
      const aMatch = key.includes(a.key.split("_")[0]) ? -1 : 0;
      const bMatch = key.includes(b.key.split("_")[0]) ? -1 : 0;
      return aMatch - bMatch;
    });
  }, [contextFeatureKey]);

  const aiUsed = credits?.used ?? 0;
  const aiLimit = credits?.hasCap ? credits.limit : (ent.limits.maxAiQuestionsPerMonth ?? null);

  const returnUrl = (() => {
    const back = returnPath ?? (typeof window !== "undefined" ? window.location.pathname : "/dashboard");
    const abs = typeof window !== "undefined" ? window.location.origin : "";
    return `${abs}${back.startsWith("/") ? back : `/${back}`}?upgraded=1`;
  })();

  // If mounted after a successful upgrade redirect, show toast + refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "1") {
      toast.success("Welcome to Vela Pro — every Pro feature is now unlocked.");
      ent.refresh();
      params.delete("upgraded");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCheckout = () => {
    if (!user) { navigate("/auth"); return; }
    if (!lookupForCycle) { toast.error("Plan not configured yet"); return; }
    setShowCheckout(true);
    onCheckoutMounted?.();
  };

  const switchCycle = async (target: Cycle) => {
    setSwitchingCycle(true);
    setSwitchStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke("switch-billing-cycle", {
        body: { targetCycle: target, environment: getStripeEnvironment() },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || "Switch failed");
      const effect = (data as any).effective_at;
      if (target === "annual") {
        setSwitchStatus({ ok: true, msg: "Switched to annual billing. You've been charged the annual amount now, with credit for unused monthly time." });
      } else {
        setSwitchStatus({ ok: true, msg: `Switched to monthly billing. Change takes effect ${effect ? new Date(effect).toLocaleDateString() : "at the end of your current annual period"}.` });
      }
      ent.refresh();
    } catch (e: any) {
      setSwitchStatus({ ok: false, msg: e?.message ?? "Could not switch billing cycle" });
    } finally {
      setSwitchingCycle(false);
    }
  };

  // ── Checkout view ──
  if (showCheckout) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <div className="font-semibold">Pro · {cycle === "annual" ? "Annual" : "Monthly"}</div>
            <div className="text-xs text-muted-foreground">
              Charged {cycle === "annual" ? `€${(annual/100).toFixed(0)} today` : `€${(monthly/100).toFixed(0)} today`}, then renews {cycle === "annual" ? "yearly" : "monthly"}.
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowCheckout(false)}>Change plan</Button>
        </div>
        <StripeEmbeddedCheckout
          priceId={lookupForCycle!}
          userId={user?.id}
          customerEmail={user?.email}
          returnUrl={returnUrl}
        />
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {contextFeatureName && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold">Unlock {contextFeatureName} with Pro</div>
            <div className="text-xs text-muted-foreground mt-0.5">Plus every other Pro feature listed below.</div>
          </div>
        </div>
      )}

      {/* Current plan + usage */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Your current plan</div>
            <div className="font-semibold text-base mt-0.5">{ent.planName ?? (ent.tier === "free" ? "Free" : ent.tier)}</div>
          </div>
          <Badge variant="outline" className="capitalize">{ent.tier}</Badge>
        </div>
        <div className="mt-4 space-y-3">
          <UsageRow label="AI questions this month" used={aiUsed} limit={aiLimit ?? undefined} />
          <UsageRow label="Portfolios" used={portfolioCount ?? 0} limit={ent.limits.maxPortfolios ?? undefined} />
          <UsageRow label="Watchlist tickers" used={watchlistCount ?? 0} limit={ent.limits.maxWatchlist ?? undefined} />
        </div>
      </Card>

      {/* Pricing toggle + upgrade CTA (only for non-pro) */}
      {!isProLike && (
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="font-semibold text-base">Vela Pro</div>
            <div className="inline-flex rounded-full border p-1 bg-muted/40 text-sm">
              <button
                type="button"
                className={`px-3 py-1 rounded-full transition-colors ${cycle === "monthly" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"}`}
                onClick={() => setCycle("monthly")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded-full transition-colors flex items-center gap-2 ${cycle === "annual" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"}`}
                onClick={() => setCycle("annual")}
              >
                Annual
                <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded px-1.5 py-0.5">Save {savingsPct}%</span>
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-baseline gap-2 flex-wrap">
            <span className="text-4xl font-bold">€{Math.round((cycle === "annual" ? annualPerMonth : monthly) / 100)}</span>
            <span className="text-muted-foreground text-sm">/month</span>
            {cycle === "annual" && (
              <span className="text-xs text-muted-foreground">
                · billed €{(annual/100).toFixed(0)}/year (save €{(annualSavings/100).toFixed(0)}/year vs monthly)
              </span>
            )}
          </div>

          <ul className="mt-4 space-y-2 text-sm">
            {orderedBenefits.map((b) => (
              <li key={b.key} className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">{b.label}</div>
                  <div className="text-xs text-muted-foreground">{b.freeGap}</div>
                </div>
              </li>
            ))}
          </ul>

          <Button size="lg" className="mt-5 w-full gap-2" onClick={startCheckout}>
            <ArrowUpRight className="h-4 w-4" />
            Upgrade to Pro · €{Math.round(priceForCycle / 100)} today
          </Button>
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            Charged in full now. No trial — direct upgrade with immediate access.
          </p>
        </Card>
      )}

      {/* Existing paid user: cycle switching */}
      {isProLike && (
        <Card className="p-4 sm:p-5">
          <div className="font-semibold text-base">Change billing cycle</div>
          <p className="text-xs text-muted-foreground mt-1">
            You're on the Pro plan. You can switch cycles at any time.
          </p>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <div className="font-semibold">Switch to Annual</div>
              <div className="text-xs text-muted-foreground mt-1">
                €{(annual/100).toFixed(0)}/year — charged <strong>immediately</strong> with proration credit for your unused monthly time.
              </div>
              <Button size="sm" className="mt-3 gap-2" disabled={switchingCycle} onClick={() => switchCycle("annual")}>
                {switchingCycle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Switch to annual now
              </Button>
            </div>
            <div className="rounded-lg border p-3">
              <div className="font-semibold">Switch to Monthly</div>
              <div className="text-xs text-muted-foreground mt-1">
                €{(monthly/100).toFixed(0)}/month — takes effect at the <strong>end of your current annual period</strong>. No refund for unused annual time.
              </div>
              <Button size="sm" variant="outline" className="mt-3 gap-2" disabled={switchingCycle} onClick={() => switchCycle("monthly")}>
                {switchingCycle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Schedule switch to monthly
              </Button>
            </div>
          </div>
          {switchStatus && (
            <div className={`mt-3 flex items-start gap-2 rounded-md p-3 text-xs ${switchStatus.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{switchStatus.msg}</span>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit?: number | null }) {
  const unlimited = limit == null || limit === -1;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit as number)) * 100));
  const nearCap = !unlimited && pct >= 80;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-medium ${nearCap ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
          {unlimited ? `${used} used · unlimited` : `${used}/${limit} used`}
        </span>
      </div>
      {!unlimited && <Progress value={pct} className="h-1.5" />}
    </div>
  );
}