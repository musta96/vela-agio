import { z } from "npm:zod@4";
import { billingAdmin, reconcileApple } from "../_shared/revenuecat.ts";
const EventSchema = z.object({ id: z.string().min(1).max(255), type: z.string(), app_user_id: z.string().optional(),
  environment: z.enum(["SANDBOX", "PRODUCTION"]).optional(), event_timestamp_ms: z.number(),
  transferred_from: z.array(z.string()).optional(), transferred_to: z.array(z.string()).optional() });
function sameSecret(a: string, b: string) { const x = new TextEncoder().encode(a); const y = new TextEncoder().encode(b); let difference = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) difference |= (x[i] ?? 0) ^ (y[i] ?? 0); return difference === 0; }
Deno.serve(async req => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("REVENUECAT_WEBHOOK_AUTH");
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  if (!sameSecret(req.headers.get("Authorization") ?? "", secret)) return new Response("Unauthorized", { status: 401 });
  try {
    const event = z.object({ event: EventSchema }).parse(await req.json()).event;
    if (event.type === "TEST") return new Response("ok");
    const admin = billingAdmin();
    const { data: done, error: readError } = await admin.from("apple_subscription_events").select("id").eq("id", event.id).maybeSingle();
    if (readError) throw readError;
    if (done) return new Response("ok");
    const ids = [...new Set([event.app_user_id, ...(event.transferred_from ?? []), ...(event.transferred_to ?? [])].filter((id): id is string => !!id && z.string().uuid().safeParse(id).success))];
    for (const id of ids) {
      const { data: { user }, error } = await admin.auth.admin.getUserById(id);
      if (error || !user) continue; // Deleted or non-Vela account; no entitlement grant.
      await reconcileApple(id);
    }
    const { error } = await admin.from("apple_subscription_events").upsert({ id: event.id, customer_id: event.app_user_id ?? "transfer", environment: event.environment ?? "UNKNOWN", event_type: event.type, event_timestamp_ms: event.event_timestamp_ms }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
    return new Response("ok");
  } catch { return new Response("Reconciliation failed; retry", { status: 503 }); }
});