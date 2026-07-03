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

type Plan = {
  name: string;
  info: string;
  price: { monthly: number; yearly: number };
  features: string[];
  btn: { text: string; href: string };
  highlighted?: boolean;
  /** Stripe lookup keys backfilled on subscription_plans. Omit for free/contact tiers. */
  lookupKey?: { monthly: string; yearly: string };
  /** True for "Contact sales" / no self-serve checkout. */
  contact?: boolean;
};

const plans: Plan[] = [
  {
    name: "Explorer",
    info: "For self-directed retail investors",
    price: { monthly: 0, yearly: 0 },
    features: [
      "Delayed market data",
      "Up to 3 watchlists",
      "25 AI summaries / month",
      "Manual portfolio tracking",
      "Community access",
    ],
    btn: { text: "Start free", href: "/auth" },
  },
  {
    highlighted: true,
    name: "Pro",
    info: "For serious investors seeking alpha",
    price: { monthly: 29, yearly: 24 },
    features: [
      "Real-time market data",
      "Unlimited watchlists & AI research",
      "Backtesting & screeners",
      "Broker connect (read-only)",
      "DCF / DDM intrinsic value tools",
      "Priority support",
    ],
    btn: { text: "Start Pro trial", href: "/signup/trial" },
    lookupKey: { monthly: "pro_monthly", yearly: "pro_annual" },
  },
  {
    name: "Enterprise",
    info: "For advisors, teams & institutions",
    price: { monthly: 149, yearly: 125 },
    features: [
      "Everything in Pro",
      "Advisor seats & MiFID II tools",
      "REST API & WebSocket streams",
      "SSO & audit logs",
      "Dedicated success manager",
    ],
    btn: { text: "Contact sales", href: "/contact-sales?source=pricing_enterprise" },
    contact: true,
  },
];

export function PricingSection() {
  const [frequency, setFrequency] = React.useState<FREQUENCY>("monthly");
  const { openCheckout, checkoutElement } = useStripeCheckout();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /** Single entry point used by every PricingCard CTA. */
  const onChoose = React.useCallback((plan: Plan) => {
    // Free tier or "Contact sales" → keep the legacy navigation.
    if (!plan.lookupKey || plan.contact) {
      navigate(plan.btn.href);
      return;
    }
    // Pro trial signup is a dedicated flow — never gate it behind /auth.
    // Route logged-out users straight to the trial wizard. Logged-in users
    // (who obviously can't start a fresh trial) fall through to embedded
    // checkout as before.
    if (!user && plan.name.toLowerCase() === "pro") {
      navigate(`/signup/trial?cycle=${frequency === "yearly" ? "annual" : "monthly"}`);
      return;
    }
    // Stripe Embedded Checkout requires a logged-in user — bounce through /auth
    // and return to /pricing so the user can finish the flow without losing place.
    if (!user) {
      navigate(`/auth?next=${encodeURIComponent(`/pricing?plan=${plan.name.toLowerCase()}&freq=${frequency}`)}`);
      return;
    }
    const lookupKey = plan.lookupKey[frequency];
    logPaymentEvent("open_checkout", {
      plan: plan.name.toLowerCase(),
      frequency,
      lookupKey,
      userId: user.id,
      environment: getStripeEnvironment(),
    });
    openCheckout({
      priceId: lookupKey,
      userId: user.id,
      customerEmail: user.email ?? undefined,
      returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    });
  }, [user, frequency, navigate, openCheckout]);

  // Auto-resume checkout after auth: if we land here with ?plan=pro&freq=yearly
  // and the user is logged in, open the Stripe form immediately so the journey
  // (pricing → auth → checkout) feels continuous.
  const autoOpenedRef = React.useRef(false);
  React.useEffect(() => {
    if (autoOpenedRef.current || !user) return;
    const planParam = (searchParams.get("plan") || "").toLowerCase();
    const freqParam = (searchParams.get("freq") || "").toLowerCase();
    if (!planParam) return;
    const plan = plans.find((p) => p.name.toLowerCase() === planParam);
    if (!plan || !plan.lookupKey || plan.contact) return;
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
    setTimeout(() => onChoose(plan), 0);
  }, [user, searchParams, setSearchParams, onChoose]);

  return (
    <div className="flex w-full flex-col items-center justify-center space-y-8 p-4">
      <div className="mx-auto max-w-2xl space-y-3 text-center">
        <div className="text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: "#1D9E75" }}>
          Investment Tiers
        </div>
        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight" style={{ color: "#042C53" }}>
          Pricing that scales with you
        </h2>
        <p className="text-base md:text-lg" style={{ color: "#3d4f66" }}>
          Start free. Upgrade when you need real-time depth, broker connect or team seats.
          EU VAT applied where required.
        </p>
      </div>

      <FrequencyToggle frequency={frequency} setFrequency={setFrequency} />

      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <PricingCard frequency={frequency} key={plan.name} plan={plan} onChoose={onChoose} />
        ))}
      </div>

      <p className="text-xs text-center max-w-xl" style={{ color: "#6b7a8c" }}>
        All plans include EU data hosting, GDPR-compliant data export and account deletion.
      </p>

      {/* Stripe Embedded Checkout mounts inline when the hook opens it. */}
      {checkoutElement}
    </div>
  );
}

type PricingCardProps = React.ComponentProps<"div"> & {
  plan: Plan;
  frequency?: FREQUENCY;
  onChoose?: (plan: Plan) => void;
};

export function PricingCard({
  plan,
  className,
  frequency = "monthly",
  onChoose,
  ...props
}: PricingCardProps) {
  return (
    <div
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-2xl shadow-sm bg-white/80 backdrop-blur-md",
        plan.highlighted && "md:scale-105 shadow-xl",
        className
      )}
      style={{
        border: plan.highlighted
          ? "1px solid rgba(24,95,165,0.4)"
          : "1px solid rgba(4,44,83,0.1)",
      }}
      {...props}
    >
      <div
        className="relative border-b p-5"
        style={{
          borderColor: "rgba(4,44,83,0.08)",
          background: plan.highlighted
            ? "linear-gradient(135deg,rgba(24,95,165,0.08),rgba(29,158,117,0.08))"
            : undefined,
        }}
      >
        <AnimatePresence mode="wait">
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            {plan.highlighted && (
              <motion.div
                className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow"
                style={{ background: "linear-gradient(135deg,#185FA5,#1D9E75)" }}
                key="popular-badge"
                layout
                transition={{ duration: 0.1 }}
              >
                <Star className="size-3 fill-current" />
                Popular
              </motion.div>
            )}

            {frequency === "yearly" && plan.price.monthly > plan.price.yearly && (
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
                {Math.round(
                  ((plan.price.monthly - plan.price.yearly) / plan.price.monthly) * 100
                )}
                % off
              </motion.div>
            )}
          </div>
        </AnimatePresence>

        <div className="font-semibold text-lg" style={{ color: "#042C53" }}>
          {plan.name}
        </div>
        <p className="text-sm" style={{ color: "#6b7a8c" }}>{plan.info}</p>
        <h3 className="mt-5 mb-1 flex w-max items-end gap-1">
          <NumberFlow
            className="font-extrabold text-4xl tracking-tight [&::part(suffix)]:font-normal [&::part(suffix)]:text-sm [&::part(suffix)]:text-[#6b7a8c]"
            format={{ style: "currency", currency: "EUR", notation: "compact" }}
            suffix="/month"
            value={plan.price[frequency]}
            style={{ color: "#042C53" }}
          />
        </h3>
        <p className="mb-1 text-xs" style={{ color: "#6b7a8c" }}>
          billed {frequency}
        </p>
      </div>

      <div
        className="space-y-3 px-5 pt-6 pb-8 text-sm"
        style={{
          color: "#1f3147",
          background: plan.highlighted ? "rgba(241,239,232,0.4)" : undefined,
        }}
      >
        {plan.features.map((feature) => (
          <div className="flex items-center gap-2" key={feature}>
            <CheckCircle2 className="size-4 shrink-0" style={{ color: "#1D9E75" }} />
            <p>{feature}</p>
          </div>
        ))}
      </div>

      <div
        className="mt-auto w-full border-t p-3"
        style={{
          borderColor: "rgba(4,44,83,0.08)",
          background: plan.highlighted ? "rgba(255,255,255,0.6)" : undefined,
        }}
      >
        {plan.highlighted ? (
          onChoose ? (
            <button
              type="button"
              onClick={() => onChoose(plan)}
              data-testid={`pricing-cta-${plan.name.toLowerCase()}`}
              className="w-full inline-flex items-center justify-center px-6 py-2.5 rounded-full text-sm font-semibold text-white shadow-md transition hover:brightness-110"
              style={{ background: "linear-gradient(135deg,#042C53 0%,#185FA5 50%,#1D9E75 100%)" }}
            >
              {plan.btn.text}
            </button>
          ) : (
            <Link
              to={plan.btn.href}
              className="w-full inline-flex items-center justify-center px-6 py-2.5 rounded-full text-sm font-semibold text-white shadow-md transition hover:brightness-110"
              style={{ background: "linear-gradient(135deg,#042C53 0%,#185FA5 50%,#1D9E75 100%)" }}
            >
              {plan.btn.text}
            </Link>
          )
        ) : onChoose ? (
          <button
            type="button"
            onClick={() => onChoose(plan)}
            data-testid={`pricing-cta-${plan.name.toLowerCase()}`}
            className="w-full inline-flex items-center justify-center px-6 py-2.5 rounded-full text-sm font-semibold shadow-sm transition hover:bg-[#042C53] hover:text-white"
            style={{ background: "#ffffff", color: "#042C53", border: "1px solid rgba(4,44,83,0.2)" }}
          >
            {plan.btn.text}
          </button>
        ) : (
          <Link
            to={plan.btn.href}
            data-testid={`pricing-cta-${plan.name.toLowerCase()}`}
            className="w-full inline-flex items-center justify-center px-6 py-2.5 rounded-full text-sm font-semibold shadow-sm transition hover:bg-[#042C53] hover:text-white"
            style={{ background: "#ffffff", color: "#042C53", border: "1px solid rgba(4,44,83,0.2)" }}
          >
            {plan.btn.text}
          </Link>
        )}
      </div>
    </div>
  );
}