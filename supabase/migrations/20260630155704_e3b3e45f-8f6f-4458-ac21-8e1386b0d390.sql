CREATE OR REPLACE FUNCTION public.check_paid_plans_stripe_ids()
RETURNS TABLE(slug text, tier text, missing_monthly boolean, missing_yearly boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.slug, p.tier,
         (p.stripe_monthly_price_id IS NULL OR p.stripe_monthly_price_id = '') AS missing_monthly,
         (p.stripe_yearly_price_id  IS NULL OR p.stripe_yearly_price_id  = '') AS missing_yearly
  FROM public.subscription_plans p
  WHERE p.is_active = true
    AND ((p.monthly_price_cents IS NOT NULL AND p.monthly_price_cents > 0)
      OR (p.yearly_price_cents  IS NOT NULL AND p.yearly_price_cents  > 0))
    AND ((p.stripe_monthly_price_id IS NULL OR p.stripe_monthly_price_id = '')
      OR (p.stripe_yearly_price_id  IS NULL OR p.stripe_yearly_price_id  = ''));
$$;

GRANT EXECUTE ON FUNCTION public.check_paid_plans_stripe_ids() TO anon, authenticated, service_role;