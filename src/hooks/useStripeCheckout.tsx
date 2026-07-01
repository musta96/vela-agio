import { useState, useCallback } from "react";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";

interface CheckoutOptions {
  priceId: string;
  quantity?: number;
  customerEmail?: string;
  userId?: string;
  returnUrl?: string;
  referralCode?: string;
  /**
   * Optional client-generated ID used to correlate this checkout attempt
   * across UI telemetry, the `create-checkout` edge function log lines and
   * downstream Stripe metadata. When omitted, one is generated automatically.
   */
  correlationId?: string;
}

function makeCorrelationId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch { /* ignore */ }
  return `co_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useStripeCheckout() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<CheckoutOptions | null>(null);

  const openCheckout = useCallback((opts: CheckoutOptions) => {
    setOptions({ ...opts, correlationId: opts.correlationId ?? makeCorrelationId() });
    setIsOpen(true);
  }, []);

  const closeCheckout = useCallback(() => {
    setIsOpen(false);
    setOptions(null);
  }, []);

  const checkoutElement = isOpen && options ? <StripeEmbeddedCheckout {...options} /> : null;

  return { openCheckout, closeCheckout, isOpen, checkoutElement };
}