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
import { Loader2, Sparkles, Check, ArrowUpRight, Info, RefreshCw, AlertTriangle } from "lucide-react";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { toast } from "sonner";
import { PromoCodeField, type PromoValidation } from "@/components/billing/PromoCodeField";
import { CreditCard } from "lucide-react";

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
  /** Preselect the billing cycle (from ?cycle= query param). */
  initialCycle?: Cycle;
}

export function UpgradeFlow({ contextFeatureKey, contextFeatureName, returnPath, compact, onCheckoutMounted, initialCycle }: Props) {
  const { user } = useAuth();
  const ent = useEntitlements();
  const credits = useAiCredits();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle>(initialCycle ?? "annual");
  const [plan, setPlan] = useState<ProPlan | null>(null);
  const [portfolioCount, setPortfolioCount] = useState<number | null>(null);
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [switchingCycle, setSwitchingCycle] = useState(false);
  const [switchStatus, setSwitchStatus] = useState<null | { ok: boolean; msg: string }>(null);
  const [history, setHistory] = useState<{ hasHistory: boolean; card: { brand: string; last4: string; exp_month: number; exp_year: number } | null; hasDefaultPaymentMethod: boolean } | null>(null);
  const [promo, setPromo] = useState<PromoValidation | null>(null);
  const [reactivating, setReactivating] = useState(false);
  const [useExistingCard, setUseExistingCard] = useState(true);
  /**
   * Set when `create-checkout` returns 409 `price_mismatch`. We drop out of
   * the embedded checkout view, show a banner explaining that the total
   * changed, and let the user retry — the retry uses the server-computed
   * total so the second attempt cannot mismatch again.
   */
  const [priceMismatch, setPriceMismatch] = useState<null | {
    serverTotalCents: number;
    expectedTotalCents: number;
    currency?: string;
    message?: string;
  }>(null);
  const [retryTotalCents, setRetryTotalCents] = useState<number | null>(null);

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

  // Load prior Stripe history so we can switch upgrade copy → reactivation
  // and offer the saved card. Runs only for currently-free users.
  useEffect(() => {
    if (!user || ent.tier !== "free") { setHistory(null); return; }
    (async () => {
      const { data } = await supabase.functions.invoke("check-billing-history", {
        body: { environment: getStripeEnvironment() },
      });
      if (data && !(data as any).error) setHistory(data as any);
    })();
  }, [user?.id, ent.tier]);

  const isProLike = ent.tier === "pro" || ent.tier === "elite" || ent.tier === "plus";
  const isReactivation = !isProLike && !!history?.hasHistory;
  const canUseSavedCard = isReactivation && !!history?.hasDefaultPaymentMethod && !!history?.card;
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
    const flag = isReactivation ? "reactivated=1" : "upgraded=1";
    return `${abs}${back.startsWith("/") ? back : `/${back}`}?${flag}`;
  })();

  // If mounted after a successful upgrade/reactivation redirect, show toast + refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reactivated") === "1") {
      toast.success("Welcome back to Vela Pro — every Pro feature is unlocked again.");
      ent.refresh();
      params.delete("reactivated");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    } else if (params.get("upgraded") === "1") {
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
    // Fresh attempt — clear any prior mismatch so the banner disappears.
    setPriceMismatch(null);
    setShowCheckout(true);
    onCheckoutMounted?.();
  };

  /** Retry after a 409 price_mismatch, using the server-computed total. */
  const retryAfterPriceMismatch = () => {
    if (!priceMismatch) return;
    setRetryTotalCents(priceMismatch.serverTotalCents);
    setPriceMismatch(null);
    setShowCheckout(true);
    onCheckoutMounted?.();
  };

  // Reactivation via saved card — charges immediately using existing default PM.
  const reactivateWithSavedCard = async () => {
    if (!lookupForCycle) { toast.error("Plan not configured yet"); return; }
    setReactivating(true);
    try {
      const { data, error } = await supabase.functions.invoke("reactivate-subscription", {
        body: { priceLookupKey: lookupForCycle, promoCode: promo?.code, environment: getStripeEnvironment() },
      });
      if (error) throw new Error(error.message);
      const d = data as any;
      if (d?.needsCheckout) { setUseExistingCard(false); startCheckout(); return; }
      if (d?.error) throw new Error(d.error);
      if (d?.ok) {
        toast.success("Welcome back to Vela Pro.");
        // Small delay so the webhook has time to promote the profile to pro.
        setTimeout(() => {
          ent.refresh();
          const back = returnPath ?? "/dashboard";
          navigate(`${back}${back.includes("?") ? "&" : "?"}reactivated=1`);
        }, 1200);
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Could not reactivate");
    } finally {
      setReactivating(false);
    }
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
    const originalFormatted = `€${(priceForCycle / 100).toFixed(2)}`;
    const effectiveCents = retryTotalCents ?? promo?.final?.cents ?? priceForCycle;
    const finalFormatted = retryTotalCents != null
      ? `€${(retryTotalCents / 100).toFixed(2)}`
      : (promo?.final?.formatted ?? originalFormatted);
    const hasDiscount = !!promo && promo.discount?.cents > 0;
    const renewalCadence = cycle === "annual" ? "yearly" : "monthly";
    const renewalAmount = `€${(priceForCycle / 100).toFixed(2)}`;
    return (
      <div className="space-y-3">
        {/* Confirmation summary — shown above the Stripe payment form so the
            user sees the exact plan, cadence and final (post-discount) amount
            they're about to authorise. */}
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">You're subscribing to</div>
              <div className="font-semibold text-base mt-0.5">
                Vela Pro · {cycle === "annual" ? "Annual" : "Monthly"}
                {isReactivation && <span className="text-muted-foreground font-normal"> (reactivation)</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Renews {renewalCadence} at {renewalAmount}. Cancel anytime.
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowCheckout(false)}>Change plan</Button>
          </div>

          <div className="mt-3 pt-3 border-t border-primary/20 space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Plan price</span>
              <span className={hasDiscount ? "text-muted-foreground line-through" : "font-medium"}>
                {originalFormatted}
              </span>
            </div>
            {hasDiscount && (
              <div className="flex items-center justify-between text-primary">
                <span>
                  Promo {promo?.code ? <span className="font-mono uppercase">{promo.code}</span> : null} applied
                </span>
                <span>− {promo!.discount.formatted}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-base font-semibold pt-1 border-t border-primary/10">
              <span>Due today</span>
              <span data-testid="due-today-amount" data-cents={effectiveCents}>{finalFormatted}</span>
            </div>
            {hasDiscount && promo?.durationLabel && (
              <div className="text-[11px] text-muted-foreground text-right">
                Discount applies {promo.durationLabel.toLowerCase()}, then renews at {renewalAmount}/{cycle === "annual" ? "yr" : "mo"}.
              </div>
            )}
          </div>
        </Card>

        {lookupForCycle && (
          <PromoCodeField priceLookupKey={lookupForCycle} onChange={setPromo} />
        )}
        <StripeEmbeddedCheckout
          priceId={lookupForCycle!}
          userId={user?.id}
          customerEmail={user?.email}
          returnUrl={returnUrl}
          promoCode={promo?.code}
          expectedTotalCents={effectiveCents}
          expectedCurrency={promo?.final?.currency ?? "eur"}
          onPriceMismatch={(info) => {
            setShowCheckout(false);
            setRetryTotalCents(null);
            setPriceMismatch(info);
          }}
        />
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {priceMismatch && (
        <div
          role="alert"
          data-testid="price-mismatch-banner"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3"
        >
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-200">
              The total changed before checkout could start
            </div>
            <div className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-1">
              We showed you{" "}
              <strong>€{(priceMismatch.expectedTotalCents / 100).toFixed(2)}</strong> but
              the current price is{" "}
              <strong>€{(priceMismatch.serverTotalCents / 100).toFixed(2)}</strong>.
              Nothing was charged. Review the new amount and continue when you're ready.
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                data-testid="price-mismatch-retry"
                onClick={retryAfterPriceMismatch}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Continue at €{(priceMismatch.serverTotalCents / 100).toFixed(2)}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPriceMismatch(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {contextFeatureName && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold">{isReactivation ? `Reactivate Pro to unlock ${contextFeatureName} again` : `Unlock ${contextFeatureName} with Pro`}</div>
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
            <div className="font-semibold text-base">{isReactivation ? "Reactivate Vela Pro" : "Vela Pro"}</div>
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

          {isReactivation && (
            <p className="mt-3 text-xs text-muted-foreground">
              Your Vela account, portfolios and settings are all still here.{" "}
              {history?.card ? "Reactivate now to restore Pro access." : "Enter a card to restore Pro access."}
            </p>
          )}

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

          {/* Promo code field — visible on the pricing card so users see the
              discount preview before they click through to checkout. */}
          {lookupForCycle && (
            <div className="mt-4">
              <PromoCodeField priceLookupKey={lookupForCycle} onChange={setPromo} />
            </div>
          )}

          {/* Reactivation with saved card path */}
          {canUseSavedCard && useExistingCard ? (
            <>
              <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 flex items-start gap-2.5">
                <CreditCard className="h-4 w-4 text-primary mt-0.5" />
                <div className="flex-1 text-sm">
                  <div className="font-semibold capitalize">
                    Use {history!.card!.brand} ending in {history!.card!.last4}?
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Expires {String(history!.card!.exp_month).padStart(2, "0")}/{String(history!.card!.exp_year).slice(-2)}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline whitespace-nowrap"
                  onClick={() => setUseExistingCard(false)}
                >
                  Use a different card
                </button>
              </div>
              <Button size="lg" className="mt-3 w-full gap-2" disabled={reactivating} onClick={reactivateWithSavedCard}>
                {reactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                Reactivate Pro · {promo?.final?.formatted ?? `€${Math.round(priceForCycle / 100)}`} today
              </Button>
            </>
          ) : (
            <>
              {canUseSavedCard && (
                <button
                  type="button"
                  className="mt-3 text-xs text-primary hover:underline"
                  onClick={() => setUseExistingCard(true)}
                >
                  ← Use saved {history!.card!.brand} ending in {history!.card!.last4} instead
                </button>
              )}
              <Button size="lg" className="mt-3 w-full gap-2" onClick={startCheckout}>
                <ArrowUpRight className="h-4 w-4" />
                {isReactivation ? "Reactivate Pro" : "Upgrade to Pro"} · {promo?.final?.formatted ?? `€${Math.round(priceForCycle / 100)}`} today
              </Button>
            </>
          )}
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            {isReactivation
              ? "Charged in full now. No new trial — Pro access is restored immediately."
              : "Charged in full now. No trial — direct upgrade with immediate access."}
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