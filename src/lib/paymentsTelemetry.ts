/**
 * Lightweight client-side telemetry for the Stripe checkout flow.
 * Goal: make payment regressions diagnosable from server-side edge function
 * logs + structured client breadcrumbs without needing a browser console
 * snapshot from the user.
 *
 * Server-side: `create-checkout` mirrors the same event names with
 * `console.log("[payments]" …)` so the two streams join on `lookupKey`.
 */

export type PaymentEvent =
  | "open_checkout"
  | "checkout_invoke_start"
  | "checkout_invoke_success"
  | "checkout_invoke_error"
  | "checkout_price_mismatch"
  | "portal_invoke_start"
  | "portal_invoke_success"
  | "portal_invoke_error"
  | "missing_lookup_key";

export interface PaymentTelemetryPayload {
  plan?: string | null;
  frequency?: "monthly" | "yearly" | null;
  lookupKey?: string | null;
  environment?: string | null;
  userId?: string | null;
  error?: string | null;
  [k: string]: unknown;
}

export function logPaymentEvent(event: PaymentEvent, payload: PaymentTelemetryPayload = {}): void {
  // Structured one-line breadcrumb. Edge functions emit the same shape so
  // logs can be grepped end-to-end by `lookupKey` or `userId`.
  const row = { event, ts: new Date().toISOString(), ...payload };
  try {
    // eslint-disable-next-line no-console
    (event.endsWith("_error") || event === "missing_lookup_key" ? console.warn : console.info)("[payments]", row);
  } catch { /* swallow */ }
}