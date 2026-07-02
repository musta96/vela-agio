import { test, expect, type Page } from "@playwright/test";

/**
 * Sidebar behavior:
 *   1. Expand/collapse persistence across reloads (localStorage keys under `vela.sidebar.group.*`).
 *   2. Breadcrumb reflects the active page on mobile viewports.
 *
 * These tests rely on the AppShell rendering `<AppSidebar />`. When no auth
 * session is injected, the app redirects to `/auth`, which does NOT render the
 * sidebar — so we skip in that case rather than fail.
 */

async function injectSession(page: Page, baseURL?: string) {
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  if (!sessionJson || !storageKey) return false;
  await page.goto(baseURL ?? "/");
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k, v),
    [storageKey, sessionJson] as const,
  );
  return true;
}

async function ensureSidebarVisible(page: Page) {
  const sidebar = page.locator('[data-sidebar="sidebar"]').first();
  if (await sidebar.isVisible().catch(() => false)) return sidebar;
  const trigger = page.getByRole("button", { name: /toggle sidebar/i }).first();
  if (await trigger.isVisible().catch(() => false)) await trigger.click();
  await sidebar.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
  return sidebar;
}

test.describe("Sidebar behavior", () => {
  test("group open/closed state persists across reload", async ({ page, baseURL }) => {
    const hasSession = await injectSession(page, baseURL);
    test.skip(!hasSession, "requires an authenticated session");

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await ensureSidebarVisible(page);

    // Find the Research group trigger and toggle it closed.
    const researchTrigger = page
      .locator('[data-sidebar-nav="group"]', { hasText: /Research/i })
      .first();
    await researchTrigger.waitFor({ state: "visible", timeout: 5000 });

    const initiallyOpen = (await researchTrigger.getAttribute("aria-expanded")) === "true";
    await researchTrigger.click();
    const toggledOpen = (await researchTrigger.getAttribute("aria-expanded")) === "true";
    expect(toggledOpen).toBe(!initiallyOpen);

    // Reload and assert the state was restored from localStorage.
    await page.reload({ waitUntil: "domcontentloaded" });
    await ensureSidebarVisible(page);
    const afterReload = page
      .locator('[data-sidebar-nav="group"]', { hasText: /Research/i })
      .first();
    await afterReload.waitFor({ state: "visible", timeout: 5000 });
    const persistedOpen = (await afterReload.getAttribute("aria-expanded")) === "true";
    expect(persistedOpen).toBe(toggledOpen);

    // Confirm the underlying localStorage key was written.
    const stored = await page.evaluate(
      () => window.localStorage.getItem("vela.sidebar.group.Research"),
    );
    expect(stored === "1" || stored === "0").toBe(true);
  });

  test("breadcrumb reflects the active page on small screens", async ({ page, baseURL }) => {
    const hasSession = await injectSession(page, baseURL);
    test.skip(!hasSession, "requires an authenticated session");

    await page.setViewportSize({ width: 390, height: 780 }); // iPhone-ish
    await page.goto("/watchlist", { waitUntil: "domcontentloaded" });
    await ensureSidebarVisible(page);

    const crumb = page.getByRole("navigation", { name: "Breadcrumb" }).first();
    await expect(crumb).toBeVisible();
    // Section and current page — Watchlist lives under Markets in AppSidebar.
    await expect(crumb).toContainText(/Markets/i);
    await expect(crumb.locator('[aria-current="page"]')).toHaveText(/Watchlist/i);
  });
});