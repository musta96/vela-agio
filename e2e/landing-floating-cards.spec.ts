import { test, expect, type Page } from "@playwright/test";

/**
 * Verifies the hero floating stat cards render at every supported breakpoint
 * and do not overlap the sticky header, footer, or the floating CTA pill.
 */

const BREAKPOINTS = [
  { name: "mobile", width: 375, height: 780 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
  { name: "wide", width: 1536, height: 960 },
] as const;

function overlaps(a: DOMRect | { x: number; y: number; width: number; height: number }, b: typeof a) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

async function boxOf(page: Page, selector: string) {
  const el = page.locator(selector).first();
  await expect(el).toBeVisible();
  const box = await el.boundingBox();
  if (!box) throw new Error(`No bounding box for ${selector}`);
  return box;
}

test.describe("Landing floating cards", () => {
  for (const bp of BREAKPOINTS) {
    test(`render and don't overlap chrome @ ${bp.name} (${bp.width}x${bp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // All three cards must be visible.
      const cards = page.getByTestId("floating-card");
      await expect(cards).toHaveCount(3);
      for (let i = 0; i < 3; i++) {
        await expect(cards.nth(i)).toBeVisible();
      }

      // Collect card boxes in-viewport (before scroll — hero).
      const cardBoxes = await cards.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      );
      for (const c of cardBoxes) {
        expect(c.width, "card has width").toBeGreaterThan(0);
        expect(c.height, "card has height").toBeGreaterThan(0);
      }

      // Sticky header is always in the viewport.
      const header = await boxOf(page, "header.sticky, header.glass-nav");
      for (const c of cardBoxes) {
        expect(overlaps(c, header), `card overlaps sticky header @ ${bp.name}`).toBe(false);
      }

      // Scroll a bit so the floating CTA appears, then re-check overlap.
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(400);

      const stickyCta = page.getByTestId("sticky-cta");
      // Sticky CTA becomes visible after scroll on all breakpoints.
      await expect(stickyCta).toBeVisible();
      const ctaBox = await stickyCta.boundingBox();
      expect(ctaBox).not.toBeNull();

      // Re-measure cards after scroll (they scroll with the page).
      const scrolledCardBoxes = await cards.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      );

      // Only check overlap when cards are still within the viewport bounds.
      const vh = bp.height;
      const vw = bp.width;
      for (const c of scrolledCardBoxes) {
        const inViewport = c.y + c.height > 0 && c.y < vh && c.x + c.width > 0 && c.x < vw;
        if (!inViewport) continue;
        expect(overlaps(c, ctaBox!), `card overlaps floating CTA @ ${bp.name}`).toBe(false);
      }

      // Scroll to the footer and confirm cards don't overlap it either
      // (they should be scrolled out of the viewport by then).
      await page.evaluate(() => {
        const f = document.querySelector("footer");
        f?.scrollIntoView({ block: "end" });
      });
      await page.waitForTimeout(400);

      const footer = page.locator("footer").first();
      await expect(footer).toBeVisible();
      const footerBox = (await footer.boundingBox())!;
      const finalCardBoxes = await cards.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      );
      for (const c of finalCardBoxes) {
        const inViewport = c.y + c.height > 0 && c.y < vh;
        if (!inViewport) continue;
        expect(overlaps(c, footerBox), `card overlaps footer @ ${bp.name}`).toBe(false);
      }
    });
  }
});