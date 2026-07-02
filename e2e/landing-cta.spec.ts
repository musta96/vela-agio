import { test, expect, devices } from "@playwright/test";

/**
 * Landing-page CTA behaviour:
 *   1. The floating "Get started free" CTA is hidden at the top of the page
 *      and becomes visible after the user scrolls past the hero.
 *   2. The header "Sign in" link routes to /auth on every breakpoint.
 */

const BREAKPOINTS = [
  { name: "mobile", viewport: devices["iPhone 13"].viewport },
  { name: "tablet", viewport: { width: 768, height: 1024 } },
  { name: "desktop", viewport: { width: 1280, height: 900 } },
];

test.describe("landing sticky CTA", () => {
  for (const bp of BREAKPOINTS) {
    test(`sticky "Get started free" appears after scroll (${bp.name})`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: bp.viewport });
      const page = await context.newPage();
      await page.goto("/", { waitUntil: "domcontentloaded" });

      const sticky = page.getByTestId("sticky-cta-link");

      // Hidden at the top of the page.
      await expect(sticky).toHaveCount(1);
      await expect(sticky).not.toBeVisible();

      // Scroll well past the hero threshold (640px) — reveals the sticky CTA.
      await page.evaluate(() => window.scrollTo(0, 1500));
      await expect(sticky).toBeVisible();
      await expect(sticky).toHaveAttribute("aria-label", /get started free/i);

      await context.close();
    });
  }
});

test.describe("landing sign-in link", () => {
  for (const bp of BREAKPOINTS) {
    test(`"Sign in" routes to /auth (${bp.name})`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: bp.viewport });
      const page = await context.newPage();
      await page.goto("/", { waitUntil: "domcontentloaded" });

      // On mobile the nav sign-in link is visually hidden (`hidden sm:inline-flex`)
      // but the mobile "Get started free" pill still routes to /auth. We assert
      // the desktop link is reachable on ≥sm and check the mobile hero CTA on
      // narrow viewports so both cohorts have a working sign-in path.
      if (bp.viewport.width >= 640) {
        const signIn = page.getByTestId("nav-sign-in");
        await expect(signIn).toBeVisible();
        await signIn.click();
      } else {
        const getStarted = page.getByTestId("nav-get-started");
        await expect(getStarted).toBeVisible();
        await getStarted.click();
      }

      await page.waitForURL(/\/auth/);
      expect(new URL(page.url()).pathname).toBe("/auth");

      await context.close();
    });
  }
});