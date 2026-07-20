import { test, expect, request, type Page } from "@playwright/test";
import { signInViaApi } from "./helpers/auth";

/**
 * End-to-end coverage for the "locked sidebar item → upgrade prompt →
 * unlocked navigation after reload" journey.
 *
 * Flow per test run:
 *   1. Sign in as the Plus-seeded account. The sidebar marks Pro-only
 *      routes with `data-sidebar-locked="true"`.
 *   2. For every locked Pro sidebar entry:
 *        a. Click it; assert navigation is blocked (URL unchanged) and
 *           the upgrade dialog opens.
 *        b. Assert the dialog surfaces copy tied to the *correct* feature
 *           key for that route (name pulled from feature_catalog) — the
 *           regression that motivated ROUTE_FEATURE_MAP.
 *        c. Dismiss the dialog.
 *   3. "Complete the unlock" by swapping to the Pro-seeded account (which
 *      owns those feature keys) and doing a full page reload.
 *   4. Re-navigate to each previously-locked route from the sidebar and
 *      confirm the URL updates and no upgrade CTA is rendered.
 *
 * Requires the same secrets as `feature-gating.spec.ts`:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
 *   E2E_PLUS_EMAIL, E2E_PLUS_PASSWORD
 *   E2E_PRO_EMAIL,  E2E_PRO_PASSWORD
 */

// Kept intentionally aligned with `ROUTE_FEATURE_MAP`. The `check:gating`
// script + `AppSidebar.routeCoverage.test.ts` already enforce that every
// gated route is reachable from the sidebar, so we assert the E2E surface
// against the same list.
const CANDIDATE_ROUTES: { path: string; feature: string }[] = [
  { path: "/sentiment", feature: "ai.sentiment" },
  { path: "/backtest", feature: "ai.backtests" },
  { path: "/strategy-lab", feature: "strategy.proposal_builder" },
  { path: "/risk", feature: "portfolio.stress_test" },
  { path: "/simulations", feature: "portfolio.simulations" },
  { path: "/event-study", feature: "research.event_study" },
  { path: "/tax-harvest", feature: "tax.harvest" },
  { path: "/optimizer", feature: "portfolio.optimizer" },
  { path: "/rebalance", feature: "portfolio.rebalance" },
  { path: "/quant", feature: "quant.alpha" },
  { path: "/advisor", feature: "portfolio.doctor" },
];

interface PlanRow { slug: string; feature_keys: string[] }
interface CatalogRow { key: string; name: string | null }

async function fetchPlan(slug: string): Promise<PlanRow> {
  const url = process.env.VITE_SUPABASE_URL!;
  const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  const ctx = await request.newContext();
  const res = await ctx.get(
    `${url}/rest/v1/subscription_plans?slug=eq.${encodeURIComponent(slug)}&select=slug,feature_keys`,
    { headers: { apikey: anon, Authorization: `Bearer ${anon}` } },
  );
  if (!res.ok()) throw new Error(`fetchPlan(${slug}): ${res.status()} ${await res.text()}`);
  const rows = (await res.json()) as PlanRow[];
  if (!rows.length) throw new Error(`plan "${slug}" not found`);
  return { slug: rows[0].slug, feature_keys: rows[0].feature_keys ?? [] };
}

async function fetchCatalog(keys: string[]): Promise<Map<string, string>> {
  if (!keys.length) return new Map();
  const url = process.env.VITE_SUPABASE_URL!;
  const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  const ctx = await request.newContext();
  const inList = `(${keys.map((k) => `"${k}"`).join(",")})`;
  const res = await ctx.get(
    `${url}/rest/v1/feature_catalog?key=in.${encodeURIComponent(inList)}&select=key,name`,
    { headers: { apikey: anon, Authorization: `Bearer ${anon}` } },
  );
  if (!res.ok()) throw new Error(`fetchCatalog: ${res.status()} ${await res.text()}`);
  const rows = (await res.json()) as CatalogRow[];
  return new Map(rows.map((r) => [r.key, r.name ?? ""]));
}

/** Locate a sidebar link by pathname. Sidebar nav items expose
 * `data-sidebar-nav="item"` and their `href` matches the target route. */
function sidebarLinkFor(page: Page, path: string) {
  return page.locator(`[data-sidebar-nav="item"][href="${path}"]`).first();
}

/** Ensure the group containing `path` is expanded so its link is visible.
 * Groups auto-persist state in localStorage; on a fresh session they may
 * be collapsed by default. */
async function revealSidebarLink(page: Page, path: string) {
  const link = sidebarLinkFor(page, path);
  if (await link.isVisible().catch(() => false)) return link;
  // Expand every collapsed group as a coarse fallback — cheaper than
  // reverse-mapping paths to groups, and idempotent.
  const groupToggles = page.locator('[data-sidebar-group-toggle]:not([data-state="open"])');
  const count = await groupToggles.count();
  for (let i = 0; i < count; i++) {
    await groupToggles.nth(i).click().catch(() => {});
  }
  await expect(link).toBeVisible({ timeout: 5_000 });
  return link;
}

const plusEmail = process.env.E2E_PLUS_EMAIL;
const plusPassword = process.env.E2E_PLUS_PASSWORD;
const proEmail = process.env.E2E_PRO_EMAIL;
const proPassword = process.env.E2E_PRO_PASSWORD;

test.describe("Sidebar locked-item upgrade journey", () => {
  test.skip(
    !plusEmail || !plusPassword || !proEmail || !proPassword,
    "E2E_PLUS_* and E2E_PRO_* credentials are required",
  );

  // The full journey — click every locked Pro sidebar item, verify the
  // upgrade prompt is wired to the correct feature key, then re-run after
  // signing in with an unlocked account to confirm navigation works.
  test("locks → upgrade prompt → unlock via account swap → navigate after reload", async ({ page, context }) => {
    const [plusPlan, proPlan] = await Promise.all([fetchPlan("plus"), fetchPlan("pro")]);
    const plusFeatures = new Set(plusPlan.feature_keys);
    const proFeatures = new Set(proPlan.feature_keys);

    // Locked for Plus but unlocked for Pro: the exact set we can validate
    // through the unlock swap.
    const locked = CANDIDATE_ROUTES.filter(
      (r) => !plusFeatures.has(r.feature) && proFeatures.has(r.feature),
    );
    test.skip(locked.length === 0, "no Pro-only routes found for the seeded plans");

    const catalog = await fetchCatalog(locked.map((r) => r.feature));

    // ── Phase 1: locked for Plus ──────────────────────────────────────
    await signInViaApi(page, plusEmail!, plusPassword!);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard/);

    for (const route of locked) {
      const link = await revealSidebarLink(page, route.path);
      // Locked items must be marked so the sidebar's onClick handler
      // preventDefaults and opens the upgrade prompt instead of routing.
      await expect(link).toHaveAttribute("data-sidebar-locked", "true");

      const urlBefore = page.url();
      await link.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog, `dialog should open for locked ${route.path}`).toBeVisible({ timeout: 5_000 });

      // The dialog must surface the *correct* feature key's copy — this is
      // the regression ROUTE_FEATURE_MAP was introduced to prevent (deal
      // flow text leaking onto /simulations, etc.).
      const featureName = catalog.get(route.feature);
      if (featureName) {
        await expect(
          dialog.getByText(featureName, { exact: false }).first(),
          `dialog should mention "${featureName}" for ${route.path}`,
        ).toBeVisible();
      }

      // Navigation must be blocked while locked.
      expect(page.url(), `URL should not change on locked click to ${route.path}`).toBe(urlBefore);

      // Close via keyboard — matches the a11y contract validated in unit tests.
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden({ timeout: 5_000 });
    }

    // ── Phase 2: unlock by swapping to Pro-seeded account + hard reload ─
    // Clear the Plus session and mint a Pro one, then do a full navigation
    // to prove the unlocked state survives a real page load (not just an
    // in-memory state flip).
    await context.clearCookies();
    await page.evaluate(() => window.localStorage.clear());
    await signInViaApi(page, proEmail!, proPassword!);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });

    for (const route of locked) {
      const link = await revealSidebarLink(page, route.path);
      // The lock marker must be gone now that the account owns the feature.
      await expect(link).not.toHaveAttribute("data-sidebar-locked", "true");

      await link.click();
      await expect(page).toHaveURL(new RegExp(route.path.replace(/\//g, "\\/")), { timeout: 10_000 });

      // Landing page must not render the upgrade CTA now that we're unlocked.
      await expect(
        page.getByRole("button", { name: /Upgrade to /i }).or(
          page.getByRole("link", { name: /Upgrade to /i }),
        ),
      ).toHaveCount(0);
    }
  });
});