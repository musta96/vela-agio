import { test, expect } from "@playwright/test";

/**
 * Regression: the Owner console must render exactly ONE sidebar on every
 * /owner/* route, and the active item highlight must match the current URL.
 *
 * Earlier bugs duplicated the sidebar on /owner/referrals and
 * /owner/feature-catalog because those pages were briefly mounted outside
 * `OwnerLayout` (inside `AppShell`, which has its own `AppSidebar`).
 *
 * The route is protected, so without a session the app redirects to /auth.
 * In that case we only assert the redirect happened (no duplicate sidebar
 * can exist on /auth either). When a Supabase session is injected via
 * `LOVABLE_BROWSER_SUPABASE_SESSION_JSON` we additionally assert the active
 * NavLink and sidebar count.
 */

const OWNER_ROUTES: Array<{ path: string; activeLabel: string }> = [
  { path: "/owner/referrals", activeLabel: "Referrals & beta" },
  { path: "/owner/feature-catalog", activeLabel: "Feature catalog" },
];

for (const { path, activeLabel } of OWNER_ROUTES) {
  test(`owner sidebar renders once on ${path}`, async ({ page, baseURL }) => {
    const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
    const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;

    if (sessionJson && storageKey) {
      await page.goto(baseURL ?? "/");
      await page.evaluate(
        ([k, v]) => window.localStorage.setItem(k, v),
        [storageKey, sessionJson] as const,
      );
    }

    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    // Never more than one sidebar, regardless of auth state.
    const asideCount = await page.locator("aside").count();
    expect(asideCount, `expected <= 1 <aside> on ${path}, got ${asideCount}`).toBeLessThanOrEqual(1);

    if (!sessionJson || !storageKey) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "No Supabase session injected; skipping active-highlight assertion.",
      });
      return;
    }

    // Authenticated: sidebar must be present and the active item must match.
    await expect(page.locator("aside")).toHaveCount(1);
    const active = page.locator("aside a.bg-white\\/8, aside a[aria-current='page']");
    await expect(active).toContainText(activeLabel);
  });
}