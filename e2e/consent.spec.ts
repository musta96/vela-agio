import { test, expect } from "@playwright/test";

/**
 * Regression gate for the GDPR consent flow. Required behaviour:
 *   1. The banner is shown to first-time visitors.
 *   2. Analytics + marketing default OFF until the user opts in.
 *   3. "Reject all" persists a decision and dismisses the banner.
 *   4. "Accept all" persists analytics=true + marketing=true.
 *   5. The persisted decision survives a reload.
 *   6. Signup is blocked until all three legal acknowledgements are ticked.
 */

const STORAGE_KEY = "vela_consent";

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("first-time visitor sees the consent banner", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("vela_consent"));
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: /cookie consent/i })).toBeVisible({
    timeout: 5_000,
  });
});

test("reject-all persists analytics=false, marketing=false and dismisses banner", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.removeItem("vela_consent"));
  await page.goto("/");
  await page.getByRole("button", { name: /^reject all$/i }).first().click();
  await expect(page.getByRole("dialog", { name: /cookie consent/i })).toHaveCount(0);

  const stored = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
  expect(stored, "consent decision was not persisted").not.toBeNull();
  const parsed = JSON.parse(stored!);
  expect(parsed.analytics).toBe(false);
  expect(parsed.marketing).toBe(false);
  expect(parsed.essential).toBe(true);
});

test("accept-all persists analytics=true, marketing=true and survives reload", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.removeItem("vela_consent"));
  await page.goto("/");
  await page.getByRole("button", { name: /^accept all$/i }).first().click();

  const stored = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
  const parsed = JSON.parse(stored!);
  expect(parsed.analytics).toBe(true);
  expect(parsed.marketing).toBe(true);

  await page.reload();
  await expect(page.getByRole("dialog", { name: /cookie consent/i })).toHaveCount(0);
});

test("signup is blocked until all three legal acknowledgements are ticked", async ({ page }) => {
  await page.goto("/auth");
  await page.getByRole("tab", { name: /create account/i }).click();
  await page.getByLabel(/^email$/i).fill(`uat+${Date.now()}@example.com`);
  await page.getByLabel(/^password$/i).fill("test-password-123");

  const submit = page.getByRole("button", { name: /create account/i });
  await expect(submit, "submit must stay disabled until all 3 acks are ticked").toBeDisabled();
});