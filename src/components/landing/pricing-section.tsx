import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion } from "motion/react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Star } from "lucide-react";
import { type FREQUENCY, FrequencyToggle } from "@/components/landing/frequency-toggle";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import { useAuth } from "@/hooks/useAuth";
import { logPaymentEvent } from "@/lib/paymentsTelemetry";
import { getStripeEnvironment } from "@/lib/stripe";
import { PUBLIC_PLAN_BULLETS, PLAN_ACCESS_NOTE } from "@/data/publicPlanCatalog";
import { PLAN_LIST, planPriceCaption, type PlanDefinition } from "@/lib/planFeatures";
import { PlanConfirmDialog, type PendingSelection } from "@/components/pricing/PlanConfirmDialog";
import { hidePurchaseUi, isIosNative } from "@/lib/native";
import { AppleSubscriptionPanel } from "@/components/billing/AppleSubscriptionPanel";
import { ReaderModeNotice } from "@/components/PurchaseUi";

/** Plans rendered on the pricing section (single source of truth in planFeatures.ts). */
const plans: PlanDefinition[] = PLAN_LIST;

export function PricingSection({ confirmBeforeCheckout = true }: { confirmBeforeCheckout?: boolean } = {}) {
  if (isIosNative()) return <AppleSubscriptionPanel />;
  if (hidePurchaseUi()) return <ReaderModeNotice />;
  return <WebPricingSection confirmBeforeCheckout={confirmBeforeCheckout} />;
}

function WebPricingSection({ confirmBeforeCheckout }: { confirmBeforeCheckout: boolean }) {
  const [frequency, setFrequency] = React.useState<FREQUENCY>("monthly");
  const { openCheckout, checkoutElement } = useStripeCheckout();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pending, setPending] = React.useState<PendingSelection | null>(null);

  /** Actually open Stripe Embedded Checkout for a confirmed selection. */
  const beginCheckout = React.useCallback((selection: PendingSelection) => {
    if (!user) return;
    logPaymentEvent("open_checkout", {
      plan: selection.plan.slug,
      frequency,
      lookupKey: selection.priceId,
      userId: user.id,
      environment: getStripeEnvironment(),
    });
    openCheckout({
      priceId: selection.priceId,
      userId: user.id,
      customerEmail: user.email ?? undefined,
      returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    });
  }, [user, frequency, openCheckout]);

  /** Single entry point used by every PricingCard CTA. */
  const onChoose = React.useCallback((plan: PlanDefinition, selectedFrequency: FREQUENCY = frequency) => {
    // Free tier or "Contact sales" → simple navigation.
    if (!plan.lookupKey || plan.contactSales) {
      navigate(plan.ctaHref);
      return;
    }
    // Stripe Embedded Checkout requires a logged-in user — bounce through /auth
    // and return to /pricing so the user can finish the flow without losing place.
    if (!user) {
      navigate(`/auth?next=${encodeURIComponent(`/pricing?plan=${plan.slug}&freq=${selectedFrequency}`)}`);
      return;
    }
    const cadence = selectedFrequency === "yearly" ? "annual" : "monthly";
    const lookupKey = plan.lookupKey[cadence];
    const selection: PendingSelection = { plan, cadence, priceId: lookupKey };
    if (confirmBeforeCheckout) {
      setPending(selection);
    } else {
      beginCheckout(selection);
    }
  }, [user, frequency, navigate, confirmBeforeCheckout, beginCheckout]);

  // Auto-resume checkout after auth: if we land here with ?plan=pro&freq=yearly
  // and the user is logged in, open the Stripe form immediately so the journey
  // (pricing → auth → checkout) feels continuous.
  const autoOpenedRef = React.useRef(false);
  React.useEffect(() => {
    if (autoOpenedRef.current || !user) return;
    const planParam = (searchParams.get("plan") || "").toLowerCase();
    const freqParam = (searchParams.get("freq") || "").toLowerCase();
    if (!planParam) return;
    const plan = plans.find((p) => p.slug === planParam);
    if (!plan || !plan.lookupKey || plan.contactSales) return;
    autoOpenedRef.current = true;
    if (freqParam === "monthly" || freqParam === "yearly") {
      setFrequency(freqParam as FREQUENCY);
    }
    // Clear the params so a refresh doesn't re-trigger checkout.
    const cleaned = new URLSearchParams(searchParams);
    cleaned.delete("plan");
    cleaned.delete("freq");
    setSearchParams(cleaned, { replace: true });
    // Defer to next tick so the frequency state is committed before opening.
    onChoose(plan, freqParam === "yearly" ? "yearly" : "monthly");
  }, [user, searchParams, setSearchParams, onChoose]);

  return (
    <div className="flex w-full flex-col items-center justify-center space-y-8 p-4">
      <div className="mx-auto max-w-2xl space-y-3 text-center">
        <div className="text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: "#1D9E75" }}>
          Plans and pricing
        </div>
        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight" style={{ color: "#042C53" }}>
          Pricing that scales with you
        </h2>
        <p className="text-base md:text-lg" style={{ color: "#3d4f66" }}>
          Start free. Move up for more frequent data refresh, email alerts, backtesting or team seats.
          Prices in euros. EU VAT applied where required.
        </p>
      </div>

      <FrequencyToggle frequency={frequency} setFrequency={setFrequency} />

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <PricingCard frequency={frequency} key={plan.slug} plan={plan} onChoose={onChoose} />
        ))}
      </div>

      <p className="text-xs text-center max-w-xl" style={{ color: "#6b7a8c" }}>
        {PLAN_ACCESS_NOTE} Educational research, not investment advice. Cancel anytime.
      </p>

      {/* Stripe Embedded Checkout mounts inline when the hook opens it. */}
      {checkoutElement}

      <PlanConfirmDialog
        selection={pending}
        onCancel={() => setPending(null)}
        onConfirm={(sel) => { setPending(null); beginCheckout(sel); }}
      />
    </div>
  );
}

type PricingCardProps = React.ComponentProps<"div"> & {
  plan: PlanDefinition;
  frequency?: FREQUENCY;
  onChoose?: (plan: PlanDefinition) => void;
};

export function PricingCard({
  plan,
  className,
  frequency = "monthly",
  onChoose,
  ...props
}: PricingCardProps) {
  const isYearly = frequency === "yearly";
  const displayPrice = isYearly ? plan.priceAnnualMonthly : plan.priceMonthly;
  const showsSavings = isYearly && plan.priceAnnualMonthly < plan.priceMonthly;
  return (
    <div
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-2xl shadow-sm bg-white/80 backdrop-blur-md",
        plan.highlighted && "lg:scale-[1.03] shadow-xl",
        className
      )}
      style={{
        border: plan.highlighted
          ? "1px solid rgba(11,36,71,0.5)"
          : "1px solid rgba(4,44,83,0.1)",
        background: plan.highlighted ? "#0B2447" : undefined,
        color: plan.highlighted ? "#ffffff" : undefined,
      }}
      {...props}
    >
      <div
        className="relative border-b p-5"
        style={{
          borderColor: plan.highlighted ? "rgba(255,255,255,0.12)" : "rgba(4,44,83,0.08)",
        }}
      >
        <AnimatePresence mode="wait">
          <div className="mb-3 flex min-h-6 flex-wrap items-center justify-end gap-2">
            {plan.highlighted && (
              <motion.div
                className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow"
                style={{ background: "#1D9E75" }}
                key="popular-badge"
                layout
                transition={{ duration: 0.1 }}
              >
                <Star className="size-3 fill-current" />
                Most popular
              </motion.div>
            )}

            {showsSavings && (
              <motion.div
                animate={{ opacity: 1 }}
                className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold"
                style={{ borderColor: "rgba(29,158,117,0.35)", color: "#1D9E75", background: "rgba(29,158,117,0.1)" }}
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                key="discount-badge"
                layout
                transition={{ duration: 0.15 }}
              >
                Save with annual
              </motion.div>
            )}
          </div>
        </AnimatePresence>

        <div className="font-semibold text-lg" style={{ color: plan.highlighted ? "#ffffff" : "#042C53" }}>
          {plan.name}
        </div>
        <p className="text-sm" style={{ color: plan.highlighted ? "rgba(255,255,255,0.7)" : "#6b7a8c" }}>
          {plan.audience}
        </p>
        <h3 className="mt-5 mb-1 flex w-max items-end gap-1">
          <NumberFlow
            className="font-extrabold text-4xl tracking-tight [&::part(suffix)]:font-normal [&::part(suffix)]:text-sm"
            format={{ style: "currency", currency: "EUR", maximumFractionDigits: 0 }}
            suffix=" / month"
            value={displayPrice}
            style={{ color: plan.highlighted ? "#1D9E75" : "#042C53" }}
          />
        </h3>
        <p className="mb-1 text-xs" style={{ color: plan.highlighted ? "rgba(255,255,255,0.6)" : "#6b7a8c" }}>
          {plan.priceMonthly === 0
            ? "Free forever"
            : isYearly
              ? `Billed €${plan.priceAnnualTotal} per year`
              : "Billed monthly"}
        </p>
        <p className="text-xs">{planPriceCaption(plan)}</p>
      </div>

      <div
        className="space-y-3 px-5 pt-6 pb-8 text-sm"
        style={{
          color: plan.highlighted ? "rgba(255,255,255,0.92)" : "#1f3147",
        }}
      >
        {PUBLIC_PLAN_BULLETS[plan.slug].map((feature) => (
          <div className="flex items-center gap-2" key={feature}>
            <CheckCircle2 className="size-4 shrink-0 mt-0.5" style={{ color: "#1D9E75" }} />
            <p>{feature}</p>
          </div>
        ))}
      </div>

      <div
        className="mt-auto w-full border-t p-3"
        style={{
          borderColor: plan.highlighted ? "rgba(255,255,255,0.12)" : "rgba(4,44,83,0.08)",
        }}
      >
        {plan.highlighted ? (
          onChoose ? (
            <button
              type="button"
              onClick={() => onChoose(plan)}
              data-testid={`pricing-cta-${plan.slug}`}
              className="w-full inline-flex items-center justify-center px-6 py-2.5 rounded-full text-sm font-semibold text-white shadow-md transition hover:brightness-110"
              style={{ background: "#1D9E75" }}
            >
              {plan.cta}
            </button>
          ) : (
            <Link
              to={plan.ctaHref}
              className="w-full inline-flex items-center justify-center px-6 py-2.5 rounded-full text-sm font-semibold text-white shadow-md transition hover:brightness-110"
              style={{ background: "#1D9E75" }}
            >
              {plan.cta}
            </Link>
          )
        ) : onChoose ? (
          <button
            type="button"
            onClick={() => onChoose(plan)}
            data-testid={`pricing-cta-${plan.slug}`}
            className="w-full inline-flex items-center justify-center px-6 py-2.5 rounded-full text-sm font-semibold shadow-sm transition hover:bg-[#042C53] hover:text-white"
            style={{ background: "#ffffff", color: "#042C53", border: "1px solid rgba(4,44,83,0.2)" }}
          >
            {plan.cta}
          </button>
        ) : (
          <Link
            to={plan.ctaHref}
            data-testid={`pricing-cta-${plan.slug}`}
            className="w-full inline-flex items-center justify-center px-6 py-2.5 rounded-full text-sm font-semibold shadow-sm transition hover:bg-[#042C53] hover:text-white"
            style={{ background: "#ffffff", color: "#042C53", border: "1px solid rgba(4,44,83,0.2)" }}
          >
            {plan.cta}
          </Link>
        )}
      </div>
    </div>
  );
}