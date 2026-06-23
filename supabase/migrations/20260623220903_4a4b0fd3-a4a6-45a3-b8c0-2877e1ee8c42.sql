-- Backfill Stripe lookup keys for real paid plans. The create-checkout edge
-- function calls stripe.prices.list({ lookup_keys: [priceId] }), so it just
-- needs the human-readable slug stored on subscription_plans.
UPDATE public.subscription_plans
   SET stripe_monthly_price_id = 'plus_monthly',
       stripe_yearly_price_id  = 'plus_yearly'
 WHERE tier = 'plus';

UPDATE public.subscription_plans
   SET stripe_monthly_price_id = 'pro_monthly',
       stripe_yearly_price_id  = 'pro_yearly'
 WHERE tier = 'pro';

UPDATE public.subscription_plans
   SET stripe_monthly_price_id = 'elite_monthly',
       stripe_yearly_price_id  = 'elite_yearly'
 WHERE tier = 'elite';