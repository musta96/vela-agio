import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { approvedAppleProduct, appleSubscriptionGrantsAccess } from "./apple-subscription-policy.ts";
export function billingAdmin() {
  const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("billing_not_configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const Subscription = z.object({
  id: z.string(), customer_id: z.string(), original_customer_id: z.string(), product_id: z.string().nullable(),
  store_subscription_identifier: z.string(), store: z.string(), environment: z.enum(["production", "sandbox"]),
  ownership: z.string(), status: z.string(), gives_access: z.boolean(), pending_payment: z.boolean(),
  auto_renewal_status: z.string(), current_period_starts_at: z.number(), current_period_ends_at: z.number().nullable(),
});
const BASE = "https://connector-gateway.lovable.dev/udc_revenuecat";
export class RevenueCatError extends Error { constructor(public status: number, public details: string) { super("Subscription verification service unavailable"); } }
async function revenuecat(path: string) {
  const apiKey = Deno.env.get("UDC_REVENUECAT_API_KEY"); const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey || !lovableKey) throw new Error("billing_not_configured");
  const response = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": apiKey }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) { const body = await response.text(); console.error("RevenueCat verification failed", response.status); throw new RevenueCatError(response.status, body); }
  return await response.json();
}
async function subscriptionList(project: string, userId: string) {
  const root = `/v2/projects/${encodeURIComponent(project)}/customers/${encodeURIComponent(userId)}/subscriptions`;
  let path = `${root}?limit=100`; const items: z.infer<typeof Subscription>[] = [];
  for (let page = 0; page < 20; page++) {
    let data;
    try { data = await revenuecat(path); } catch (e) {
      if (e instanceof RevenueCatError && e.status === 404 && page === 0) return [];
      throw e;
    }
    const result = z.object({ items: z.array(Subscription), next_page: z.string().nullable().optional() }).parse(data);
    items.push(...result.items);
    if (!result.next_page) return items;
    const next = new URL(result.next_page, "https://api.revenuecat.com");
    if (next.origin !== "https://api.revenuecat.com" || next.pathname !== root) throw new Error("invalid_provider_pagination");
    path = `${next.pathname}${next.search}`;
  }
  throw new Error("subscription_pagination_limit");
}
export async function reconcileApple(userId: string) {
  const admin = billingAdmin();
  const { data: config, error: configError } = await admin.from("apple_purchase_config").select("project_id").eq("id", true).maybeSingle();
  if (configError || !config) throw new Error("billing_not_configured");
  // Timestamp before provider read: a delayed read cannot overwrite a newer reconciliation.
  const verifiedAt = new Date().toISOString();
  const subscriptions = await subscriptionList(config.project_id, userId);
  const rows = [];
  for (const sub of subscriptions) {
    if (sub.store !== "app_store" || !sub.product_id || sub.customer_id !== userId || sub.original_customer_id !== userId || sub.ownership !== "purchased") continue;
    const product = z.object({ store_identifier: z.string(), subscription: z.object({ duration: z.string().nullable() }).nullable() }).parse(await revenuecat(`/v2/projects/${encodeURIComponent(config.project_id)}/products/${encodeURIComponent(sub.product_id)}`));
    if (!approvedAppleProduct(product.store_identifier, product.subscription?.duration ?? null) || sub.current_period_ends_at === null) continue;
    const environment = sub.environment === "production" ? "live" : "sandbox";
    rows.push({ id: sub.id, original_transaction_id: sub.store_subscription_identifier, product_id: product.store_identifier, environment,
      status: sub.status, gives_access: appleSubscriptionGrantsAccess(sub, userId, environment),
      current_period_start: new Date(sub.current_period_starts_at).toISOString(), expires_at: new Date(sub.current_period_ends_at).toISOString(),
      will_renew: sub.auto_renewal_status === "will_renew" || sub.auto_renewal_status === "will_change_product" });
  }
  const { error } = await admin.rpc("apple_reconcile_subscriptions", { _user_id: userId, _rows: rows, _verified_at: verifiedAt });
  if (error) throw new Error(error.message.includes("purchase_owned") ? "purchase_owned_by_another_account" : "subscription_save_failed");
  // Sandbox access is limited to a server-maintained review/test allowlist.
  const { data: tester, error: testError } = await admin.from("apple_test_accounts").select("user_id").eq("user_id", userId).maybeSingle();
  if (testError) throw new Error("subscription_read_failed");
  const { data: current, error: readError } = await admin.from("apple_subscriptions").select("expires_at,will_renew,environment").eq("user_id", userId).in("environment", tester ? ["live", "sandbox"] : ["live"]).eq("gives_access", true).gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1).maybeSingle();
  if (readError) throw new Error("subscription_read_failed");
  return { active: !!current, expiresAt: current?.expires_at ?? null, willRenew: current?.will_renew ?? false };
}