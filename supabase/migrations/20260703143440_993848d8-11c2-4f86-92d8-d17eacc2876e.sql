-- Fix Pro annual price ID to match the Stripe price we actually created (pro_annual)
UPDATE public.subscription_plans
SET stripe_yearly_price_id = 'pro_annual',
    yearly_price_cents = 29000,
    monthly_price_cents = 2900
WHERE slug = 'pro';