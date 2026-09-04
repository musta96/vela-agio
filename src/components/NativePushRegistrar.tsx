import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { isNativeApp } from "@/lib/native";
import { registerNativePush } from "@/lib/nativePush";
import { toast } from "sonner";

/**
 * Registers the device with APNs/FCM once a user is signed in inside the
 * native shell, and surfaces foreground pushes as toasts.
 *
 * No-op on the web build, which keeps using the Web Push flow in
 * `usePushNotifications`.
 */
export function NativePushRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!isNativeApp() || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await registerNativePush();
        if (!cancelled && result === "denied") {
          // Silent: the user declined the OS prompt. Settings offers a retry.
        }
      } catch (e) {
        console.warn("Native push registration failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!isNativeApp()) return;
    const onPush = (event: Event) => {
      const detail = (event as CustomEvent).detail as { title?: string; body?: string } | undefined;
      if (detail?.title) toast(detail.title, { description: detail.body });
    };
    window.addEventListener("vela:push", onPush);
    return () => window.removeEventListener("vela:push", onPush);
  }, []);

  return null;
}

export default NativePushRegistrar;
