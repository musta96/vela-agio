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
  correlationId?: string;
}

export function StripeEmbeddedCheckout({ priceId, quantity, customerEmail, userId, returnUrl, referralCode, correlationId }: Props) {
  const fetchClientSecret = async (): Promise<string> => {
    const finalReturnUrl = returnUrl ?? `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;
    const env = getStripeEnvironment();
    logPaymentEvent("checkout_invoke_start", { lookupKey: priceId, userId, environment: env, correlationId });
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: { priceId, quantity, customerEmail, userId, returnUrl: finalReturnUrl, environment: env, referralCode, correlationId },
    });
    if (error || !data?.clientSecret) {
      const msg = error?.message || (data as any)?.error || "Failed to create checkout session";
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