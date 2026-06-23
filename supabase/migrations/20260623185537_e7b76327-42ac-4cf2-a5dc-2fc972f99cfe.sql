
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS ab_test_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ab_price_label text,
  ADD COLUMN IF NOT EXISTS ab_price_period text,
  ADD COLUMN IF NOT EXISTS ab_monthly_price_cents integer,
  ADD COLUMN IF NOT EXISTS ab_yearly_price_cents integer,
  ADD COLUMN IF NOT EXISTS ab_variant_label text;
