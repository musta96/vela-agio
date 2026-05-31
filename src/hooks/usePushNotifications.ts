import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "@/lib/pwa";
import { toast } from "sonner";

export type PushSupport = "supported" | "unsupported" | "ios-needs-install";

function detectSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
  if (iOS && !standalone) return "ios-needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  return "supported";
}

export function usePushNotifications() {
  const [support] = useState<PushSupport>(detectSupport);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Detect current subscription
  useEffect(() => {
    if (support !== "supported") return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch {/* ignore */}
    })();
  }, [support]);

  const subscribe = useCallback(async () => {
    if (support !== "supported") return false;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast.error("Notifications were blocked. Enable them in your browser settings.");
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      const raw = sub.toJSON();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sign in to enable push notifications.");
        return false;
      }
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: sub.endpoint,
          p256dh: raw.keys?.p256dh ?? "",
          auth: raw.keys?.auth ?? "",
          user_agent: navigator.userAgent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
      if (error) throw error;
      setSubscribed(true);
      toast.success("Push notifications enabled");
      return true;
    } catch (err: any) {
      toast.error(err?.message || "Could not enable notifications");
      return false;
    } finally {
      setBusy(false);
    }
  }, [support]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Push notifications disabled");
    } catch (err: any) {
      toast.error(err?.message || "Could not disable notifications");
    } finally {
      setBusy(false);
    }
  }, []);

  return { support, permission, subscribed, busy, subscribe, unsubscribe };
}