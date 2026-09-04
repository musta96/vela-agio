import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp, nativePlatform } from "@/lib/native";

/**
 * Real native push (APNs / FCM) for the Capacitor shells.
 *
 * Web push subscriptions and native device tokens share the
 * `push_subscriptions` table:
 *   - web    → endpoint = the browser push endpoint, p256dh/auth set
 *   - native → endpoint = "apns:<token>" / "fcm:<token>", platform + device_token set
 *
 * `send-push` branches on `platform`, so a device only ever gets one transport.
 */

const ENDPOINT_PREFIX = { ios: "apns:", android: "fcm:", web: "web:" } as const;

let registered = false;

export async function registerNativePush(): Promise<"granted" | "denied" | "unsupported"> {
  if (!isNativeApp()) return "unsupported";

  const perm = await PushNotifications.checkPermissions();
  let status = perm.receive;
  if (status === "prompt" || status === "prompt-with-rationale") {
    status = (await PushNotifications.requestPermissions()).receive;
  }
  if (status !== "granted") return "denied";

  if (!registered) {
    registered = true;

    PushNotifications.addListener("registration", (token: Token) => {
      void saveDeviceToken(token.value);
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.warn("Native push registration failed", err);
    });

    // Foreground delivery: surface it in-app rather than silently dropping it.
    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      window.dispatchEvent(new CustomEvent("vela:push", { detail: notification }));
    });

    // Tapping a notification deep-links into the matching route.
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const path = (action.notification.data as Record<string, string> | undefined)?.path;
      if (path && path.startsWith("/")) window.location.assign(path);
    });
  }

  await PushNotifications.register();
  return "granted";
}

async function saveDeviceToken(token: string) {
  const platform = nativePlatform();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || !token) return;

  const endpoint = `${ENDPOINT_PREFIX[platform] ?? "web:"}${token}`;
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      // Native transports don't use the Web Push encryption keys.
      p256dh: "",
      auth: "",
      platform,
      device_token: token,
      user_agent: navigator.userAgent,
    } as never,
    { onConflict: "endpoint" },
  );
  if (error) console.warn("Could not store the device push token", error);
}

export async function unregisterNativePush() {
  if (!isNativeApp()) return;
  try {
    await PushNotifications.removeAllListeners();
    registered = false;
  } catch {
    /* ignore */
  }
}
