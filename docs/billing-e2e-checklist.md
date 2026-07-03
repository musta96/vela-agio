# Billing E2E Test Checklist

Use Stripe test card `4242 4242 4242 4242` (any future expiry / any CVC).
Run through this in the **preview** (sandbox environment) before every publish.

## 1. Four-tier ladder — entitlements sanity

For each tier, sign in as a user on that plan and verify:

| Tier | AI questions/day | Live data | Portfolio sync | Alerts | Backtesting | Compliance / KID | Report export (PDF) | API access | Advisor seats |
|------|------------------|-----------|----------------|--------|-------------|------------------|---------------------|------------|---------------|
| Explorer (free) | 5 | ❌ (delayed) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 0 |
| Plus (€12/mo · €108/yr) | 100 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | 0 |
| Pro (€29/mo · €288/yr) | Unlimited | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | 0 |
| Enterprise (€149/mo · €1500/yr) | Unlimited | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 3 |

**How to check**
- `/plans-billing` "Entitlement source" panel shows the right tier + feature count.
- Hit `/backtesting`, `/optimizer`, `/api-docs` on each tier — locked tiers should render `<FeatureGate>` upgrade prompt, unlocked tiers render the feature.
- The upgrade prompt must name the **lowest** tier that unlocks the feature (via `requiredTierFor` in `src/lib/planFeatures.ts`) and route to `/pricing`.

## 2. Effective annual pricing display

On `/plans-billing` → *Available plans*:
- Toggle **Monthly** → card shows `€X/mo` and secondary line `or €Y/yr annually`.
- Toggle **Annual · save ~20%** → card shows effective `€(Y/12)/mo · effective` and secondary line `Billed €Y/yr`.
- Verify effective monthly matches published `priceAnnualMonthly` in `PLAN_FEATURES` (Plus €9, Pro €24, Enterprise €125).

On `/pricing`:
- Same toggle behaviour, and the "You save" copy shows `(priceMonthly*12 − priceAnnualTotal)` euros.

## 3. Upgrade / downgrade with proration

Start as **Plus monthly**. On `/plans-billing` click **Choose** on Pro monthly:
- [ ] Embedded Stripe checkout opens. Card `4242…` succeeds.
- [ ] After redirect to `/checkout/return`, `/plans-billing` shows Pro as *Current plan* within ~10s (webhook + realtime channel).
- [ ] The Stripe invoice (portal → invoices) shows a **prorated** line item for the mid-cycle switch.
- [ ] `my_entitlements()` now returns `tier = 'pro'`; backtesting is unlocked immediately.

Downgrade Pro → Plus via the customer portal (Manage billing → Update plan → Plus):
- [ ] Portal reports "Scheduled" — no immediate charge, no immediate feature loss.
- [ ] `subscriptions.cancel_at_period_end` stays `false`; a `pending_update` fires the switch at `current_period_end`.
- [ ] After the period ends (or force it with `stripe trigger customer.subscription.updated`), tier flips to Plus, backtesting locks.

## 4. Cancellation — access continues until period end, then Explorer

From `/plans-billing` → SubscriptionActionsCard → **Cancel plan**:
- [ ] Retention offer modal appears (if configured). Decline it.
- [ ] Exit survey submits; a `cancellation` row lands in `cancellation_feedback`.
- [ ] `subscriptions.cancel_at_period_end = true`; UI badge shows "Ends at period end".
- [ ] Feature access is **unchanged** until `current_period_end` (verified via `has_feature`).
- [ ] After `current_period_end` passes, the `period-end-downgrade-cron` (runs every 15 min) flips `profiles.plan = 'explorer'` and `subscription_status = 'canceled'`.
- [ ] Reload — user is now Explorer; Pro features render the upgrade prompt.

Undo cancellation before period end:
- [ ] Click **Resume subscription** — `cancel_at_period_end` flips back to `false` and the "Ends at period end" badge disappears via the realtime channel.

## 5. Webhook sync — plan and status

With the Stripe CLI (`stripe listen --forward-to https://<project>.functions.supabase.co/payments-webhook?env=sandbox`), fire each event and verify the `subscriptions` and `profiles` tables update:

- [ ] `customer.subscription.created` → row upserted, `environment = 'sandbox'`, `price_id = lookup_key`.
- [ ] `customer.subscription.updated` (price change) → `price_id`, `current_period_end` updated.
- [ ] `customer.subscription.updated` (`cancel_at_period_end: true`) → mirrors onto `profiles.cancel_at_period_end` and inserts a `cancellation_feedback` audit row (deduped within 60s).
- [ ] `customer.subscription.updated` (`cancel_at_period_end: false`) → mirrors flag off, inserts `cancellation_undone` audit row.
- [ ] `invoice.payment_failed` → `status = 'past_due'`, `profiles.past_due_since` set; grace-period banner appears.
- [ ] `invoice.paid` (after retry) → `status = 'active'`, `past_due_since` cleared.
- [ ] `customer.subscription.deleted` → `status = 'canceled'`, entitlements downgrade to Explorer on next `my_entitlements()` call.

## 6. Upgrade modal — tier + Stripe routing

Trigger `<FeatureGate>` on a Pro-only feature (e.g. `/backtesting`) as an Explorer user:
- [ ] Modal title reads "Upgrade to Vela Pro" (matches `requiredTierFor(f => f.backtesting)`).
- [ ] "Upgrade to Pro" button opens embedded Stripe checkout with the **Pro** lookup key (`pro_monthly` or `pro_annual`, matching the selected cadence).
- [ ] After successful payment, redirect lands back on `returnPath` (the gated page), not a generic dashboard.
- [ ] Trigger the same gate on a Plus-only feature (portfolio sync) — modal should route to the Plus lookup key.

## 7. Regression guardrails

Run these in the browser console on `/plans-billing`:

```js
// All gated features read from PLAN_FEATURES (single source of truth)
import("/src/lib/planFeatures.ts").then(m => console.table(
  Object.values(m.PLAN_FEATURES).map(p => ({
    tier: p.slug, monthly: p.priceMonthly, annual: p.priceAnnualTotal,
    effMonthly: p.priceAnnualMonthly, ...p.features,
  }))
));
```

Then confirm:
- [ ] No hardcoded price strings in `src/components/upgrade/*` or `src/pages/Pricing.tsx` — everything reads from `PLAN_FEATURES` or the `subscription_plans` table.
- [ ] `useEntitlements` and `has_feature` return the same tier for the signed-in user.
- [ ] `has_active_subscription(user, 'sandbox')` and `has_active_subscription(user, 'live')` are correctly scoped by environment.
