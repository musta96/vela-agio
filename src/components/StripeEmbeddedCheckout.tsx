import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { logPaymentEvent } from "@/lib/paymentsTelemetry";

interface Props {
  priceId: string;
  quantity?: number;
  customerEmail?: string;
  userId?: string;
  returnUrl?: string;
  referralCode?: string;
  promoCode?: string;
  correlationId?: string;
  /**
   * Total (in the smallest currency unit) that the UI has already shown
   * the user under "Due today", including any applied promo/coupon. The
   * edge function re-computes the same discount server-side and rejects
   * the session if these don't match, so we can never charge more than
   * what the user saw on screen.
   */
  expectedTotalCents?: number;
  expectedCurrency?: string;
  /**
   * Called when the edge function returns 409 `price_mismatch` — the
   * server-computed total drifted from what the UI displayed. The parent
   * should exit the checkout view, surface the message and let the user
   * retry (typically by re-opening checkout with the new server total).
   */
  onPriceMismatch?: (info: {
    serverTotalCents: number;
    expectedTotalCents: number;
    currency?: string;
    message?: string;
  }) => void;
}

export function StripeEmbeddedCheckout({ priceId, quantity, customerEmail, userId, returnUrl, referralCode, promoCode, correlationId, expectedTotalCents, expectedCurrency, onPriceMismatch }: Props) {
  const fetchClientSecret = async (): Promise<string> => {
    const finalReturnUrl = returnUrl ?? `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;
    const env = getStripeEnvironment();
    logPaymentEvent("checkout_invoke_start", { lookupKey: priceId, userId, environment: env, correlationId });
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: { priceId, quantity, customerEmail, userId, returnUrl: finalReturnUrl, environment: env, referralCode, promoCode, correlationId, expectedTotalCents, expectedCurrency },
    });
    if (error || !data?.clientSecret) {
      // Try to extract a structured error body from the FunctionsHttpError.
      // Supabase-js exposes the raw Response on `error.context` for non-2xx
      // responses; clone before reading so downstream consumers still can.
      let body: any = data;
      const ctx: Response | undefined = (error as any)?.context;
      if (!body && ctx && typeof ctx.clone === "function") {
        try { body = await ctx.clone().json(); } catch { /* non-JSON */ }
      }
      if (body?.error === "price_mismatch" && onPriceMismatch) {
        const info = {
          serverTotalCents: Number(body.serverTotalCents ?? 0),
          expectedTotalCents: Number(body.expectedTotalCents ?? expectedTotalCents ?? 0),
          currency: body.currency ?? expectedCurrency,
          message: body.message,
        };
        logPaymentEvent("checkout_price_mismatch", { lookupKey: priceId, userId, environment: env, correlationId, ...info });
        onPriceMismatch(info);
        // Reject so Stripe doesn't try to mount an invalid session; parent
        // has already unmounted the provider via onPriceMismatch state.
        throw new Error(body.message || "The price shown to you has changed. Please refresh and try again.");
      }
      const msg = (error as any)?.message || body?.error || body?.message || "Failed to create checkout session";
      logPaymentEvent("checkout_invoke_error", { lookupKey: priceId, userId, environment: env, error: msg, correlationId });
      throw new Error(msg);
    }
    logPaymentEvent("checkout_invoke_success", { lookupKey: priceId, userId, environment: env, correlationId });
    return data.clientSecret;
  };

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}