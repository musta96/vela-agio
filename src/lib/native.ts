import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { App as CapApp } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";

/**
 * Initialize native iOS / Android behaviors. Safe no-op on web.
 * Call once at app startup.
 */
export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;

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