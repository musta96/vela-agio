import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { App as CapApp } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";

/**
 * Native shell detection.
 *
 * The same React bundle powers the website and the Capacitor iOS/Android
 * shells. Anything that differs between the two (App Store rules, native
 * plugins, safe areas) must branch on these helpers rather than on the
 * user agent, which lies inside a WKWebView.
 */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): "ios" | "android" | "web" {
  try {
    const p = Capacitor.getPlatform();
    return p === "ios" || p === "android" ? p : "web";
  } catch {
    return "web";
  }
}

export const isIosNative = () => nativePlatform() === "ios";

/**
 * Hide website checkout in native shells. iOS uses a separate Apple purchase
 * panel; this function must never expose Stripe purchase links in the app.
 * No reader-app exception is assumed. Android IAP is not implemented.
 */
export function hidePurchaseUi(): boolean {
  return isNativeApp();
}

/**
 * Initialize native iOS / Android behaviors. Safe no-op on web.
 * Call once at app startup.
 */
export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;

  document.documentElement.classList.add("native-app", `native-${Capacitor.getPlatform()}`);

  try {
    // Status bar: dark content area, light text, app theme background
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: "#0F172A" });
    }
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch (e) {
    console.warn("StatusBar init failed", e);
  }

  try {
    // Hide splash once React has mounted
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch (e) {
    console.warn("SplashScreen hide failed", e);
  }

  try {
    // Android hardware back button: navigate back, or exit at root
    CapApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        CapApp.exitApp();
      }
    });
  } catch (e) {
    console.warn("App backButton listener failed", e);
  }

  try {
    // Keyboard niceties — add a CSS var apps can use to offset content
    Keyboard.addListener("keyboardWillShow", (info) => {
      document.documentElement.style.setProperty("--keyboard-height", `${info.keyboardHeight}px`);
    });
    Keyboard.addListener("keyboardWillHide", () => {
      document.documentElement.style.setProperty("--keyboard-height", "0px");
    });
  } catch (e) {
    console.warn("Keyboard listeners failed", e);
  }
}
