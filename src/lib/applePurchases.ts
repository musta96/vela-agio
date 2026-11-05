import { Purchases } from "@revenuecat/purchases-capacitor";
import { supabase } from "@/integrations/supabase/client";
import { isIosNative } from "@/lib/native";

export type ApplePackage = Awaited<ReturnType<typeof Purchases.getOfferings>>["current"] extends infer O
  ? NonNullable<O> extends { availablePackages: (infer P)[] } ? P : never : never;
let configured = false;
let identity: string | null = null;
let queue: Promise<unknown> = Promise.resolve();
// Serialize configuration and account changes so a purchase cannot run for a previous user.
export function withAppleAccount<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const job = queue.catch(() => undefined).then(async () => {
    if (!isIosNative()) throw new Error("Apple purchases are available in the iPhone app.");
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id !== userId) throw new Error("Sign in again before managing purchases.");
    if (!configured) {
      const { data, error } = await supabase.functions.invoke("apple-subscription", { body: { action: "config" } });
      if (error || !data?.iosSdkKey?.startsWith("appl_")) throw new Error("Apple subscriptions are not available yet. No payment has been taken.");
      await Purchases.configure({ apiKey: data.iosSdkKey, appUserID: userId, automaticDeviceIdentifierCollectionEnabled: false, diagnosticsEnabled: false });
      configured = true;
      identity = userId;
    } else if (identity !== userId) {
      await Purchases.logOut();
      await Purchases.logIn({ appUserID: userId });
      identity = userId;
    }
    const { data: { user: latest } } = await supabase.auth.getUser();
    if (latest?.id !== userId) throw new Error("Your account changed. Please try again.");
    return operation();
  });
  queue = job;
  return job;
}
export function clearAppleAccount() {
  queue = queue.catch(() => undefined).then(async () => {
    if (configured && identity) { await Purchases.logOut(); identity = null; }
  });
  return queue;
}
export async function verifyApplePurchase() {
  const { data, error } = await supabase.functions.invoke("apple-subscription", { body: { action: "sync" } });
  if (error || data?.error) throw new Error(data?.message ?? "Your purchase could not be verified yet. Use Restore purchases to retry; do not buy again.");
  window.dispatchEvent(new Event("vela:entitlements-changed"));
  return data as { active: boolean; expiresAt: string | null; willRenew: boolean; hasPaidAccess: boolean; provider: string | null };
}
export function applePurchaseError(error: unknown): { cancelled: boolean; message: string } {
  const value = error && typeof error === "object" ? error as { code?: string | number; userCancelled?: boolean } : {};
  if (String(value.code) === "1" || value.userCancelled) return { cancelled: true, message: "" };
  if (String(value.code) === "20") return { cancelled: false, message: "Payment is awaiting approval. Paid access will appear after Apple confirms it." };
  if (["7", "13"].includes(String(value.code))) return { cancelled: false, message: "This purchase belongs to another Vela account. Sign in with the original account or contact support." };
  return { cancelled: false, message: error instanceof Error ? error.message : "Apple could not complete this request. Please try again." };
}
export { Purchases };