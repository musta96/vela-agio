
# Billing foundation for Vela

No user-facing UI in this step. This wires up the data model, Stripe products, trial rules, and an admin-tunable settings table that later prompts (checkout, retention, owner dashboard) will build on top of.

## 1. Data model — `profiles` additions

Vela already has `public.subscriptions` (populated by the Stripe webhook) as the source of truth for billing state. To match the field names you asked for, we mirror the resolved status onto `public.profiles` so the client can read it in one round-trip:

- `plan` — enum `plan_tier`: `free` | `pro_trial` | `pro` | `enterprise` (default `free`)
- `trial_ends_at` — `timestamptz` nullable
- `current_period_end` — `timestamptz` nullable
- `billing_cycle` — enum `billing_cycle`: `monthly` | `annual` nullable
- `subscription_status` — enum `sub_status`: `active` | `trialing` | `past_due` | `canceled` nullable

The Stripe webhook (`payments-webhook`) will write these fields alongside the existing `subscriptions` row on every `customer.subscription.*` event, so `profiles.plan` is always in sync with Stripe.

RLS: users read/update only their own profile (existing policy); the webhook writes via `service_role`.

## 2. Stripe products & prices

Two prices on one product, both with a 7-day trial. **Enterprise is intentionally NOT created here** — activation stays manual per Prompt 17.

| product_id | price_id      | Amount   | Cycle    |
| ---------- | ------------- | -------- | -------- |
| `pro`      | `pro_monthly` | €29 / mo | monthly  |
| `pro`      | `pro_annual`  | €290 / yr | annual  |

**Annual discount proposal — please confirm before I create the price:**

- List price 12 × €29 = €348/yr
- Proposed annual: **€290/yr** → effective **€24.17/mo**, saves €58/yr (~16.7% off, i.e. ~2 months free — the classic SaaS "2 months on us" positioning)
- Alternative if you want it punchier: **€278/yr** (~20% off, ≈ €23.17/mo) or **€261/yr** (~25% off, ≈ €21.75/mo)

Tax code: `txcd_10103001` (SaaS — electronic services).

## 3. Trial rules — 7 days, card required

Enforced server-side in `create-checkout` when opening a Pro session:

```ts
subscription_data: {
  trial_period_days: settings.trial_length_days,        // default 7
  trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
},
payment_method_collection: 'always',
```

`payment_method_collection: 'always'` + `missing_payment_method: 'cancel'` is Stripe's guarantee that no trial can start without a validated card on file. If Stripe fails to charge on day 7, the subscription auto-cancels rather than lingering as `past_due`.

## 4. Admin-tunable `billing_settings` table

Single-row config table so you can tune trial length, grace period, and the retention offer without a redeploy. Prompt 15 will render the owner UI; Prompt 14/16 will read from it.

Columns (all nullable defaults so a fresh install just works):

- `trial_length_days` int, default `7`
- `grace_period_days` int, default `3`
- `retention_offer_enabled` bool, default `true`
- `retention_discount_type` enum (`percentage` | `fixed`), default `percentage`
- `retention_discount_value` numeric, default `30` (i.e. 30% off)
- `retention_duration_months` int, default `3`
- `retention_offer_copy` text, default: *"We'd hate to see you go. Stay on Pro for 30% off the next 3 months — same features, better price."*

RLS: only admins (`has_role(auth.uid(), 'admin')`) can `SELECT`/`UPDATE`; edge functions read via `service_role`. Enforced as a single row (`id = 1`, `CHECK id = 1`).

## 5. Files & migrations that will land in the next step

- `supabase/migrations/<ts>_billing_foundation.sql` — enums, `profiles` additions, `billing_settings` table + seed row, GRANTs, RLS, policies.
- `src/integrations/supabase/types.ts` — regenerated automatically after migration approval.
- **No edge function or UI changes in this prompt.** `create-checkout` trial wiring lands with the checkout flow prompt; webhook mirror-write into `profiles.plan` lands there too, so we don't touch it in isolation.

## Awaiting your confirmation on

1. **Annual price** — €290 (16.7% off / 2 months free), €278 (20%), or €261 (25%)?
2. **Retention defaults** — 30% off for 3 months as the placeholder, editable later?

Once you confirm, I'll run the migration and create the two Stripe prices.
