import { test, expect } from "@playwright/test";

/**
 * Regression: /owner/referrals and /owner/feature-catalog must render inside
 * the Owner console shell only, never the customer AppShell menu/404 page.
 *
 * The route is protected, so without a session we only assert no duplicate
 * sidebar can exist. When a session is injected via
 * `LOVABLE_BROWSER_SUPABASE_SESSION_JSON` we additionally assert the active
 * owner-menu button and sidebar count.
 */

const OWNER_ROUTES: Array<{ path: string; activeLabel: string }> = [
  { path: "/owner/referrals", activeLabel: "Referrals & beta" },
  { path: "/owner/feature-catalog", activeLabel: "Feature catalog" },
];

async function injectSession(page: Parameters<typeof test>[0] extends infer _ ? any : never, baseURL?: string) {
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;

  if (sessionJson && storageKey) {
    await page.goto(baseURL ?? "/");
    await page.evaluate(
      ([k, v]) => window.localStorage.setItem(k, v),
      [storageKey, sessionJson] as const,
    );
  }

  return Boolean(sessionJson && storageKey);
}

for (const { path, activeLabel } of OWNER_ROUTES) {
  test(`owner sidebar renders once on ${path}`, async ({ page, baseURL }) => {
    const hasSession = await injectSession(page, baseURL);

    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    // Never more than one sidebar, regardless of auth state.
    const asideCount = await page.locator("aside").count();
    expect(asideCount, `expected <= 1 <aside> on ${path}, got ${asideCount}`).toBeLessThanOrEqual(1);

    if (!hasSession) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "No session injected; skipping active-highlight assertion.",
      });
      return;
    }

    // Authenticated: owner sidebar must be present and the active item must match.
    await expect(page.locator("aside")).toHaveCount(1);
    await expect(page.getByText("OWNER")).toBeVisible();
    await expect(page.locator("aside button.bg-primary\\/10")).toContainText(activeLabel);
  });
}

test("owner billing sidebar items keep the same Owner console layout", async ({ page, baseURL }) => {
  const hasSession = await injectSession(page, baseURL);
  test.skip(!hasSession, "No session injected; owner click-flow assertions require auth.");

  await page.goto("/owner/referrals", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await expect(page.locator("aside")).toHaveCount(1);
  await expect(page.locator("aside button.bg-primary\\/10")).toContainText("Referrals & beta");
  await expect(page.getByText("Referral codes & beta access")).toBeVisible();

  await page.getByRole("button", { name: /Feature catalog/i }).click();
  await expect(page).toHaveURL(/\/owner$/);
  await expect(page.locator("aside")).toHaveCount(1);
  await expect(page.getByText("OWNER")).toBeVisible();
  await expect(page.locator("aside button.bg-primary\\/10")).toContainText("Feature catalog");
  await expect(page.getByRole("heading", { name: "Feature catalog" })).toBeVisible();

  await page.getByRole("button", { name: /Referrals & beta/i }).click();
  await expect(page).toHaveURL(/\/owner$/);
  await expect(page.locator("aside")).toHaveCount(1);
  await expect(page.getByText("OWNER")).toBeVisible();
  await expect(page.locator("aside button.bg-primary\\/10")).toContainText("Referrals & beta");
  await expect(page.getByText("Referral codes & beta access")).toBeVisible();
});