import { test, expect } from "@playwright/test";

/**
 * First-paint regression: the user-avatar chip in the app header must be
 * visible and readable as soon as the page renders. Catches the class of
 * bug where sidebar-themed tokens (bg-white/5 on a cream header) make the
 * profile box collapse to white-on-white.
 *
 * Authenticated app pages live behind `/auth`, so this spec runs against
 * the landing page header (same AuthButton component). If a logged-in
 * session is present, the avatar shows; otherwise the "Sign in" CTA does
 * — either way the trigger MUST be visible.
 */
test.describe("header profile chip — first paint visibility", () => {
  test("avatar / sign-in trigger is visible and contrasts with the header", async ({ page }) => {
    await page.goto("/");
    // Trigger is rendered either as <button aria-label="Account: ..."> (auth'd)
    // or as a Sign In link (anon). Either way, header has exactly one slot.
    const trigger = page.locator('header button[aria-label^="Account:"], header a:has-text("Sign In")').first();
    await expect(trigger, "header user trigger should render on first paint").toBeVisible({ timeout: 5_000 });

    // Bounding box must be > 0 (otherwise it's collapsed / display:none).
    const box = await trigger.boundingBox();
    expect(box, "trigger has no layout box").not.toBeNull();
    expect(box!.width).toBeGreaterThan(16);
    expect(box!.height).toBeGreaterThan(16);

    // Contrast guard: the trigger's resolved background must NOT match the
    // surrounding header background — otherwise it would be invisible.
    const colors = await trigger.evaluate((el) => {
      const triggerBg = getComputedStyle(el).backgroundColor;
      const header = el.closest("header");
      const headerBg = header ? getComputedStyle(header).backgroundColor : "";
      return { triggerBg, headerBg };
    });
    expect(colors.triggerBg, "trigger has transparent background").not.toBe("rgba(0, 0, 0, 0)");
    expect(
      colors.triggerBg,
      "trigger background matches header background — would be invisible"
    ).not.toBe(colors.headerBg);
  });

  test("authenticated avatar tooltip surfaces the user identity", async ({ page }) => {
    await page.goto("/");
    const avatarTrigger = page.locator('header button[aria-label^="Account:"]').first();
    // Only run the tooltip assertion when an authenticated session exists in
    // the browser; otherwise this scenario is vacuously skipped.
    if (!(await avatarTrigger.count())) {
      test.skip(true, "no authenticated session in browser");
      return;
    }
    await avatarTrigger.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible({ timeout: 3_000 });
    await expect(tooltip).not.toBeEmpty();
  });
});