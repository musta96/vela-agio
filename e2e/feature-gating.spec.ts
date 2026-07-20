import { test, expect, request, type Page } from "@playwright/test";
import { signInViaApi } from "./helpers/auth";

/**
 * End-to-end gating smoke: signs in as Plus and Pro seeded accounts and walks
 * every RouteFeatureGate-wrapped route in App.tsx, asserting either the
 * upgrade card (with the correct target plan name) or the unlocked page.
 *
 * Requires the following secrets in CI (or a local .env):
 *   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
 *   E2E_PLUS_EMAIL, E2E_PLUS_PASSWORD
 *   E2E_PRO_EMAIL,  E2E_PRO_PASSWORD
 */

type GatedRoute = { path: string; feature: string };

// Keep in sync with src/App.tsx — verified by `bun run check:gating`.
const GATED_ROUTES: GatedRoute[] = [
  { path: "/sentiment", feature: "ai.sentiment" },
  { path: "/backtest", feature: "ai.backtests" },
  { path: "/strategy-lab", feature: "strategy.proposal_builder" },
  { path: "/risk", feature: "portfolio.stress_test" },
  { path: "/simulations", feature: "portfolio.simulations" },
  { path: "/event-study", feature: "research.event_study" },
  { path: "/tax-harvest", feature: "tax.harvest" },
  { path: "/api", feature: "enterprise.api" },
  { path: "/optimizer", feature: "portfolio.optimizer" },
  { path: "/rebalance", feature: "portfolio.rebalance" },
  { path: "/quant", feature: "quant.alpha" },
  { path: "/dealflow", feature: "dealflow.access" },
  { path: "/advisor", feature: "portfolio.doctor" },
];

// Regex the upgrade card's headline must match ("Upgrade to <PlanName>").
// A Plus user can be upsold to any higher tier; a Pro user only to Elite/Advisor/Enterprise.
const PLAN_UPGRADE_TARGET: Record<"plus" | "pro", RegExp> = {
  plus: /Upgrade to (Pro|Elite|Advisor|Enterprise)/i,
  pro: /Upgrade to (Elite|Advisor|Enterprise)/i,
};

/**
 * Fetch the plan's feature_keys from Supabase so this spec stays in sync with
 * the DB: a route is "blocked" for a given plan iff that plan's feature_keys
 * does NOT contain the route's feature key.
 */
async function fetchPlanFeatureKeys(slug: string): Promise<Set<string>> {
  const url = process.env.VITE_SUPABASE_URL!;
  const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  const ctx = await request.newContext();
  const res = await ctx.get(
    `${url}/rest/v1/subscription_plans?slug=eq.${encodeURIComponent(slug)}&select=feature_keys`,
    { headers: { apikey: anon, Authorization: `Bearer ${anon}` } },
  );
  if (!res.ok()) throw new Error(`fetchPlanFeatureKeys(${slug}): ${res.status()} ${await res.text()}`);
  const rows = (await res.json()) as { feature_keys: string[] }[];
  if (!rows.length) throw new Error(`plan slug "${slug}" not found in subscription_plans`);
  return new Set(rows[0].feature_keys ?? []);
}

async function assertBlocked(page: Page, planKey: "plus" | "pro", path: string) {
  const upgrade = page.getByRole("button", { name: /Upgrade to /i }).first()
    .or(page.getByRole("link", { name: /Upgrade to /i }).first());
  await expect(upgrade, `expected upgrade CTA on ${path} for ${planKey}`).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText(PLAN_UPGRADE_TARGET[planKey]).first(),
    `expected correct target plan name on ${path} for ${planKey}`,
  ).toBeVisible();
}

async function assertUnlocked(page: Page, path: string) {
  // No upgrade CTA should be rendered when the page content is available.
  const upgrade = page.getByRole("button", { name: /Upgrade to /i })
    .or(page.getByRole("link", { name: /Upgrade to /i }));
  await expect(upgrade, `expected NO upgrade CTA on ${path}`).toHaveCount(0);
}

for (const planKey of ["plus", "pro"] as const) {
  const envPrefix = `E2E_${planKey.toUpperCase()}`;
  const email = process.env[`${envPrefix}_EMAIL`];
  const password = process.env[`${envPrefix}_PASSWORD`];

  test.describe(`FeatureGate smoke — ${planKey} plan`, () => {
    test.skip(
      !email || !password,
      `${envPrefix}_EMAIL / ${envPrefix}_PASSWORD not set; skipping ${planKey} gating suite`,
    );

    let planKeys: Set<string>;
    test.beforeAll(async () => {
      planKeys = await fetchPlanFeatureKeys(planKey);
    });

    test.beforeEach(async ({ page }) => {
      await signInViaApi(page, email!, password!);
    });

    for (const { path, feature } of GATED_ROUTES) {
      test(`${path} (${feature})`, async ({ page }) => {
        const shouldBlock = !planKeys.has(feature);
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

        if (shouldBlock) {
          await assertBlocked(page, planKey, path);
        } else {
          await assertUnlocked(page, path);
        }
      });
    }
  });
}