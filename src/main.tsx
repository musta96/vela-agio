import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { initNative } from "./lib/native";

// Service worker hygiene for Lovable preview iframes.
// In iframes or on preview hostnames, unregister any SW so cached shells
// don't lock the editor preview to a stale build.
(function swGuard() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const previewHost =
    location.hostname.includes("id-preview--") ||
    location.hostname.includes("lovableproject.com");
  if (inIframe || previewHost) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  }
})();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

// Initialize native plugins (no-op on web)
initNative();
