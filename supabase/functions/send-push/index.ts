// Sends a Web Push notification to one user (or all of a user's devices).
// Body: { user_id: string, title: string, body?: string, url?: string, tag?: string, data?: Record<string, unknown> }
//
// Requires secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. "mailto:support@vela.ai")
// The function uses the service role to read push_subscriptions across users —
// callers should be other trusted edge functions (alerts evaluator, digest, etc.)
// or admins. JWT verification stays on; pass the user's JWT or an admin JWT.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// @ts-expect-error - Deno-only npm specifier
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


// ---------------------------------------------------------------------------
// Native delivery (APNs / FCM)
// ---------------------------------------------------------------------------

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(body);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Token-based APNs auth: ES256 JWT signed with the .p8 key from App Store Connect. */
async function apnsJwt(): Promise<string | null> {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const p8 = Deno.env.get("APNS_PRIVATE_KEY");
  if (!keyId || !teamId || !p8) return null;
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: keyId })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(p8),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${claims}`)),
  );
  return `${header}.${claims}.${b64url(sig)}`;
}

async function sendApns(
  token: string,
  payload: { title: string; body?: string; url?: string; data?: Record<string, unknown> },
): Promise<{ ok: boolean; dead: boolean }> {
  const jwt = await apnsJwt();
  const topic = Deno.env.get("APNS_BUNDLE_ID");
  if (!jwt || !topic) return { ok: false, dead: false };
  const host = (Deno.env.get("APNS_ENV") || "production") === "sandbox"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
  const res = await fetch(`${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
      url: payload.url,
      ...(payload.data || {}),
    }),
  });
  // 410 = device token no longer active; 400 BadDeviceToken is also terminal.
  const dead = res.status === 410 || res.status === 400;
  return { ok: res.ok, dead };
}

async function sendFcm(
  token: string,
  payload: { title: string; body?: string; url?: string; data?: Record<string, unknown> },
): Promise<{ ok: boolean; dead: boolean }> {
  const serverKey = Deno.env.get("FCM_SERVER_KEY");
  if (!serverKey) return { ok: false, dead: false };
  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: { authorization: `key=${serverKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      to: token,
      notification: { title: payload.title, body: payload.body },
      data: { url: payload.url ?? "", ...(payload.data || {}) },
    }),
  });
  const json = await res.json().catch(() => ({}));
  const err = json?.results?.[0]?.error;
  return { ok: res.ok && !err, dead: err === "NotRegistered" || err === "InvalidRegistration" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:support@vela.ai";
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const { user_id, title, body, url, tag, data } = await req.json();
    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "user_id and title are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Authorization: allow only (a) trusted server-to-server calls carrying the CRON_SECRET,
    // (b) the target user themself, or (c) an admin. Prevents anyone with the anon key from
    // sending arbitrary push notifications to any user.
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const providedCron = req.headers.get("x-cron-secret") ?? "";
    const isCron = !!cronSecret && providedCron === cronSecret;
    if (!isCron) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { data: userData } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
      const callerId = userData?.user?.id as string | undefined;
      if (!callerId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (callerId !== user_id) {
        const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: callerId, _role: "admin" });
        if (!isAdmin) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, platform, device_token")
      .eq("user_id", user_id);
    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({ title, body, url, tag, data });
    const dead: string[] = [];

    // Web Push rows keep the existing VAPID path; native rows go to APNs/FCM.
    const webSubs = subs.filter((s) => (s.platform ?? "web") === "web" && s.p256dh && s.auth);
    const nativeSubs = subs.filter((s) => (s.platform === "ios" || s.platform === "android") && s.device_token);

    const results = await Promise.allSettled(
      webSubs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        ),
      ),
    );
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        const code = (r.reason && (r.reason.statusCode || r.reason.status)) || 0;
        if (code === 404 || code === 410) dead.push(webSubs[i].endpoint);
      }
    });

    const nativeResults = await Promise.allSettled(
      nativeSubs.map((s) =>
        s.platform === "ios"
          ? sendApns(s.device_token as string, { title, body, url, data })
          : sendFcm(s.device_token as string, { title, body, url, data }),
      ),
    );
    nativeResults.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value.dead) dead.push(nativeSubs[i].endpoint);
    });

    if (dead.length) await supabase.from("push_subscriptions").delete().in("endpoint", dead);

    const sent =
      results.filter((r) => r.status === "fulfilled").length +
      nativeResults.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    const total = results.length + nativeResults.length;
    return new Response(JSON.stringify({ sent, failed: total - sent, pruned: dead.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});