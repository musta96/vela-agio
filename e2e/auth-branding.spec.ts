import { test, expect, devices, type Page } from "@playwright/test";

/**
 * Verifies that Vela's auth surfaces (login, signup, password reset) never
 * expose third-party "Lovable" branding — no badge, watermark, iframe, or
 * outbound link. Runs across desktop + mobile viewports.
 *
 * Visual-regression snapshots are captured with `toHaveScreenshot` so any
 * future change that reintroduces the badge trips the diff.
 */

const ROUTES = [
  { name: "login", path: "/auth" },
  { name: "signup", path: "/auth?tab=signup" },
  { name: "reset", path: "/auth/reset" },
] as const;

const VIEWPORTS = [
  { name: "desktop", ...devices["Desktop Chrome"].viewport },
  { name: "mobile", ...devices["iPhone 13"].viewport },
] as const;

async function assertNoLovableBranding(page: Page) {
  // 1. Visible text — case-insensitive scan of the rendered body copy.
  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  expect(bodyText, "auth screen must not contain the word 'lovable'").not.toMatch(/lovable/);

  // 2. DOM attributes — id / class / data-* selectors used by the platform badge.
  const badgeSelectors = [
    "[id*='lovable' i]",
    "[class*='lovable' i]",
    "[data-lovable]",
    "a[href*='lovable.dev' i]",
    "a[href*='lovable.app' i]",
    "iframe[src*='lovable' i]",
    "img[alt*='lovable' i]",
  ];
  for (const sel of badgeSelectors) {
    await expect(page.locator(sel), `no element should match ${sel}`).toHaveCount(0);
  }
}

for (const viewport of VIEWPORTS) {
  test.describe(`auth branding — ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of ROUTES) {
      test(`${route.name} shows only Vela branding`, async ({ page }) => {
        await page.goto(route.path, { waitUntil: "domcontentloaded" });
        // Give the badge (if any) a chance to inject after hydration.
        await page.waitForTimeout(500);

        await assertNoLovableBranding(page);

        // Vela wordmark / logo must be present so we know we're on the branded surface.
        const velaHits = await page.locator("text=/vela/i").count();
        expect(velaHits, "Vela branding should be visible").toBeGreaterThan(0);

        // Visual regression — snapshot the full auth card region.
        await expect(page).toHaveScreenshot(
          `auth-${route.name}-${viewport.name}.png`,
          {
            fullPage: false,
            maxDiffPixelRatio: 0.02,
            animations: "disabled",
          },
        );
      });
    }
  });
}