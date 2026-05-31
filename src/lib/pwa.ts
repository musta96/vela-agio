// VAPID public key (safe to expose). Generated for Vela.ai web push.
export const VAPID_PUBLIC_KEY =
  "BE6R63yOaI6RdTQdnrMw22nqT1ZbukQHGHZvV6xcwWRO3ByhseOg8aRZ6XKGqU-U4euINTf_NRHMooZdztE1n1k";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export type BrowserKind =
  | "ios-safari"
  | "ios-chrome"
  | "ios-firefox"
  | "ios-other"
  | "android-chrome"
  | "android-samsung"
  | "android-firefox"
  | "android-other"
  | "desktop-chrome"
  | "desktop-edge"
  | "desktop-firefox"
  | "desktop-safari"
  | "desktop-other";

export function detectBrowser(): BrowserKind {
  if (typeof navigator === "undefined") return "desktop-other";
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
  const android = /Android/.test(ua);
  if (iOS) {
    if (/CriOS/.test(ua)) return "ios-chrome";
    if (/FxiOS/.test(ua)) return "ios-firefox";
    if (/Safari/.test(ua)) return "ios-safari";
    return "ios-other";
  }
  if (android) {
    if (/SamsungBrowser/.test(ua)) return "android-samsung";
    if (/Firefox/.test(ua)) return "android-firefox";
    if (/Chrome/.test(ua)) return "android-chrome";
    return "android-other";
  }
  if (/Edg\//.test(ua)) return "desktop-edge";
  if (/Firefox/.test(ua)) return "desktop-firefox";
  if (/Chrome/.test(ua)) return "desktop-chrome";
  if (/Safari/.test(ua)) return "desktop-safari";
  return "desktop-other";
}