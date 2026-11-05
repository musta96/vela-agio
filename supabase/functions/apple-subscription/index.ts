import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { billingAdmin, reconcileApple, RevenueCatError } from "../_shared/revenuecat.ts";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const admin = billingAdmin(); const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ error: "unauthorized" }, 401);
    const input = z.object({ action: z.enum(["config", "sync"]) }).strict().safeParse(await req.json());
    if (!input.success) return json({ error: "invalid_request" }, 400);
    if (input.data.action === "config") {
      const { data, error } = await admin.from("apple_purchase_config").select("ios_sdk_key").eq("id", true).maybeSingle();
      if (error || !data?.ios_sdk_key?.startsWith("appl_")) return json({ error: "apple_not_configured" }, 503);
      return json({ iosSdkKey: data.ios_sdk_key }); // Public SDK key only, never secret API key.
    }
    const result = await reconcileApple(user.id);
    const url = Deno.env.get("SUPABASE_URL"); const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) throw new Error("billing_not_configured");
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data: entitlements, error } = await userClient.rpc("my_entitlements");
    if (error) throw new Error("entitlement_check_failed");
    const hasPaidAccess = entitlements?.[0]?.source === "subscription";
    return json({ ...result, hasPaidAccess, provider: result.active ? "apple" : hasPaidAccess ? "web" : null });
  } catch (error) {
    if (error instanceof RevenueCatError) return json({ error: "provider_unavailable", status: error.status, details: error.details }, error.status === 401 || error.status === 403 ? 503 : error.status);
    console.error("Apple subscription verification failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "verification_failed", message: "Apple subscription verification is unavailable. Restore purchases to retry; do not buy again." }, 503);
  }
});