// Pure policy shared by reconciliation and regression tests. No client claims.
export const APPLE_PRODUCTS = { vela_pro_monthly: "P1M", vela_pro_yearly: "P1Y" } as const;
export type VerifiedAppleSubscription = {
  id: string; customer_id: string; original_customer_id: string;
  product_id: string | null; store_subscription_identifier: string;
  store: string; environment: string; ownership: string; status: string;
  gives_access: boolean; pending_payment: boolean; auto_renewal_status: string;
  current_period_starts_at: number; current_period_ends_at: number | null;
};
export function appleSubscriptionGrantsAccess(sub: VerifiedAppleSubscription, userId: string, environment: "live" | "sandbox", now = Date.now()): boolean {
  return sub.store === "app_store" && sub.ownership === "purchased"
    && sub.customer_id === userId && sub.original_customer_id === userId
    && sub.environment === (environment === "live" ? "production" : "sandbox")
    && sub.gives_access === true && sub.pending_payment === false
    && ["active", "trialing", "in_grace_period"].includes(sub.status)
    && typeof sub.current_period_ends_at === "number"
    && Number.isFinite(sub.current_period_ends_at) && sub.current_period_ends_at > now;
}
export function approvedAppleProduct(identifier: string, duration: string | null): boolean {
  return Object.prototype.hasOwnProperty.call(APPLE_PRODUCTS, identifier)
    && APPLE_PRODUCTS[identifier as keyof typeof APPLE_PRODUCTS] === duration;
}