## Goal

Make `/pricing` the single upgrade destination, driven by one shared component that reads from `PLAN_FEATURES` (single source of truth) and routes to the correct Stripe `price_id`. Every "Upgrade" entry point in the app funnels through it. Users always see their **current plan**, and picking a plan opens a **confirmation step** before Stripe Checkout starts.

## What changes

### 1. Shared pricing component
Create `src/components/pricing/PricingPlans.tsx` — the single source of truth for the pricing UI:
- Renders the four tiers from `PLAN_FEATURES` (Explorer, Plus, Pro, Enterprise).
- Monthly/annual toggle. Uses `lookupKey.monthly` / `lookupKey.annual` from `PLAN_FEATURES` as the `price_id` passed to checkout.
- One `CurrentPlanBanner` sub-component that reads `useEntitlements` and shows the user's active tier, cadence, renewal date, and cancel-at-period-end state.
- A `variant` prop: `"page"` (full pricing page grid) and `"modal"` (compact list for `UpgradeModal`).
- Every CTA calls a single `onSelectPlan(slug, cadence)` handler → opens the confirmation step (see §4).

### 2. Consolidate entry points
- `src/pages/Pricing.tsx`, `src/pages/PlansBilling.tsx`, `src/pages/Upgrade.tsx` all render `<PricingPlans variant="page" />`. Any tier-specific copy stays in `PLAN_FEATURES`.
- `src/components/upgrade/UpgradeModal.tsx` and `UpgradeFlow.tsx` render `<PricingPlans variant="modal" />` above the checkout embed.
- `src/components/UpgradeDialog.tsx` becomes a thin wrapper around the modal.
- Every button/link labelled "Upgrade" across `AppSidebar`, `AiCreditsBadge`, `AIBriefing`, `Watchlist`, `CopilotChat`, `FeatureGate`, `LockedPreview`, `LimitReachedCTA`, `AIAccessCard`, `PastDueBanner`, `ManageSubscriptionButton`, `Settings`, `Reactivate`, `Features`, `owner/UserProfile`, `AiUsageHistory` routes to `/pricing` (or opens `UpgradeModal` where inline is required). Same copy: "Upgrade plan".

### 3. Current-plan context
- `CurrentPlanBanner` renders at the top of `/pricing` and inside every upgrade modal.
- Shows: tier name, price, cadence, next renewal / expiry, badge for `cancel_at_period_end`.
- On plan cards in `PricingPlans`, the user's current tier is disabled with a "Current plan" pill; higher tiers show "Upgrade to X", lower tiers show "Downgrade to X".

### 4. Confirmation step before Stripe Checkout
- New `src/components/pricing/PlanConfirmDialog.tsx`. When the user clicks a plan, opens a dialog summarizing:
  - Plan name, monthly vs annual, effective monthly price and total charged.
  - Trial info (if `trialDays` present on the tier).
  - What changes vs current plan (feature deltas from `PLAN_FEATURES`).
  - Primary CTA: **Continue to payment** → opens `StripeEmbeddedCheckout` with the resolved `price_id`.
  - Secondary CTA: **Back**.

### 5. Automated route + CTA audit
- New `src/lib/pricingAudit.ts` exporting:
  - `AUDIT_UPGRADE_ROUTES` — the canonical map: any "upgrade" CTA must resolve to `/pricing` or open `UpgradeModal`.
  - `getExpectedPriceId(slug, cadence)` — returns `PLAN_FEATURES[slug].lookupKey[cadence]`.
- New test `src/components/__tests__/pricingAudit.test.tsx`:
  - Renders `<PricingPlans />` in both variants for each tier, clicks each plan button, and asserts the `PlanConfirmDialog` reports the exact `price_id` from `PLAN_FEATURES`.
  - Renders every registered "upgrade" entry point (from a small registry list) inside `MemoryRouter`, clicks the CTA, and asserts navigation goes to `/pricing` or opens `UpgradeModal` — never to legacy `/upgrade` or `/plans-billing` deep links.
  - Snapshot-asserts the four tiers, plan names, and Stripe price ids to catch drift from `PLAN_FEATURES`.

## Technical details

- No backend/schema changes. `create-checkout` already resolves human-readable `price_id` via `lookup_keys` — the confirmation step just passes the slug returned by `PLAN_FEATURES[slug].lookupKey[cadence]`.
- Enterprise stays as `Contact sales` (no Stripe checkout).
- Routes `/upgrade`, `/plans`, `/plans-billing` remain mounted as redirects to `/pricing` to preserve inbound links and analytics.
- `verifyFeaturesCtaBindings` in Features.tsx and existing bindings tests get updated to match the new single-destination rule.
- Files not touched: `src/integrations/supabase/*`, edge functions, `PLAN_FEATURES` itself.

## Out of scope

- No changes to Stripe products/prices (already created).
- No new billing flows (cancel/undo/webhooks stay as-is).
- No visual redesign of the pricing table beyond the current-plan banner + confirmation dialog.
