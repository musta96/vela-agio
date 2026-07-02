/**
 * Defensive stripper for the Lovable editor-preview badge on auth surfaces.
 *
 * The published site already hides the badge via publish settings
 * (`hide_badge = true`), but inside the workspace preview iframe the platform
 * injects an "Edit with Lovable" pill into the DOM after our React tree
 * mounts. On login / signup / reset screens that third-party overlay competes
 * with Vela's own branding, so we watch for it and remove it as soon as it
 * appears.
 *
 * Runs only on `/auth*` routes and only while the app is in an iframe or on a
 * Lovable preview host — never on the live production site.
 */

const BADGE_SELECTORS = [
  "[id*='lovable-badge' i]",
  "[id*='lovable-edit' i]",
  "[class*='lovable-badge' i]",
  "[class*='lovable-edit' i]",
  "a[href*='lovable.dev' i][target='_blank']",
  "a[href*='lovable.app' i][target='_blank']",
];

function isPreviewContext(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  return (
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host.includes("lovable.app")
  );
}

function isAuthRoute(): boolean {
  const p = window.location.pathname;
  return p === "/auth" || p.startsWith("/auth/");
}

function purge() {
  if (!isAuthRoute()) return;
  for (const sel of BADGE_SELECTORS) {
    document.querySelectorAll(sel).forEach((el) => el.remove());
  }
}

let started = false;
export function installAuthBadgeStripper() {
  if (started || typeof window === "undefined") return;
  if (!isPreviewContext()) return;
  started = true;

  const run = () => {
    purge();
    const observer = new MutationObserver(() => purge());
    observer.observe(document.body, { childList: true, subtree: true });
    // Re-check on client-side route changes.
    window.addEventListener("popstate", purge);
  };

  if (document.body) run();
  else document.addEventListener("DOMContentLoaded", run, { once: true });
}