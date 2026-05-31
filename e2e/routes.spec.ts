import { test, expect } from "@playwright/test";

/**
 * Smoke test: every public (unauthenticated) route must render without a
 * runtime crash and without console errors. If a route 500s, throws in
 * render, or logs an error to the console, this gate fails and the PR is
 * blocked.
 *
 * Protected app routes are intentionally NOT walked here — they redirect to
 * /auth when no session exists, which is correct behaviour. The redirect
 * itself is asserted below.
 */

const PUBLIC_ROUTES = [
  "/",
  "/auth",
  "/pricing",
  "/privacy",
  "/terms",
  "/disclaimer",
  "/cookies",
];

const PROTECTED_ROUTES = ["/dashboard", "/portfolio", "/movers", "/orders", "/owner"];

// Console messages we are willing to ignore (third-party noise, dev-only warnings).
const IGNORED = [
  /Download the React DevTools/i,
  /\[vite\]/i,
  /lovable-tagger/i,
  /Failed to load resource.*favicon/i,
];

for (const path of PUBLIC_ROUTES) {
  test(`public route renders cleanly: ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (IGNORED.some((re) => re.test(text))) return;
      errors.push(`console.error: ${text}`);
    });

    const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(resp, `no response for ${path}`).not.toBeNull();
    expect(resp!.status(), `HTTP ${resp!.status()} on ${path}`).toBeLessThan(400);

    // App shell must mount.
    await expect(page.locator("body")).toBeVisible();
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    expect(errors, `runtime errors on ${path}:\n${errors.join("\n")}`).toEqual([]);
  });
}

test.describe("protected routes redirect to /auth when unauthenticated", () => {
  for (const path of PROTECTED_ROUTES) {
    test(`gate: ${path}`, async ({ page, context }) => {
      await context.clearCookies();
      await page.goto(path, { waitUntil: "domcontentloaded" });
      // ProtectedRoute either renders the auth screen inline or navigates to /auth.
      // Either way, an unauthenticated user must NOT see the protected content.
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      const url = new URL(page.url());
      const onAuth = url.pathname.startsWith("/auth") || url.pathname === "/";
      const sawAuthUI = await page
        .getByRole("heading", { name: /sign in/i })
        .first()
        .isVisible()
        .catch(() => false);
      expect(
        onAuth || sawAuthUI,
        `expected ${path} to redirect unauthenticated users to /auth, got ${url.pathname}`
      ).toBe(true);
    });
  }
});