
-- 1) Smarter my_entitlements: paid sub wins; beta only adds keys on top.
DROP FUNCTION IF EXISTS public.my_entitlements();

CREATE OR REPLACE FUNCTION public.my_entitlements()
RETURNS TABLE(
  tier text,
  plan_slug text,
  plan_name text,
  feature_keys text[],
  beta_active boolean,
  source text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_beta boolean := false;
  v_tier text;
  v_slug text;
  v_name text;
  v_keys text[];
  v_found boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'free'::text, NULL::text, NULL::text, ARRAY[]::text[], false, 'anonymous'::text;
    RETURN;
  END IF;

  v_beta := public.has_role(v_uid, 'beta_tester'::app_role);

  SELECT coalesce(p.tier,'free'), p.slug, p.name, coalesce(p.feature_keys, ARRAY[]::text[])
    INTO v_tier, v_slug, v_name, v_keys
  FROM public.subscriptions s
  LEFT JOIN public.subscription_plans p
    ON (p.stripe_monthly_price_id = s.price_id OR p.stripe_yearly_price_id = s.price_id)
  WHERE s.user_id = v_uid
    AND ((s.status IN ('active','trialing','past_due')
            AND (s.current_period_end IS NULL OR s.current_period_end > now()))
      OR (s.status = 'canceled' AND s.current_period_end > now()))
  ORDER BY s.created_at DESC
  LIMIT 1;

  v_found := FOUND;

  IF v_found THEN
    -- Paid subscription takes precedence. Beta role only ADDS extra feature keys.
    IF v_beta THEN
      SELECT array_agg(DISTINCT k) INTO v_keys FROM (
        SELECT unnest(coalesce(v_keys, ARRAY[]::text[])) AS k
        UNION
        SELECT key AS k FROM public.feature_catalog
      ) x;
    END IF;
    RETURN QUERY SELECT v_tier, v_slug, v_name, coalesce(v_keys, ARRAY[]::text[]), v_beta, 'subscription'::text;
    RETURN;
  END IF;

  IF v_beta THEN
    RETURN QUERY SELECT
      'beta'::text,
      'beta-tester'::text,
      'Beta tester'::text,
      COALESCE((SELECT array_agg(key) FROM public.feature_catalog), ARRAY[]::text[]),
      true,
      'beta'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'free'::text, NULL::text, NULL::text, ARRAY[]::text[], false, 'free'::text;
END
$$;

-- 2) Admin referral analytics (per-code rollup).
CREATE OR REPLACE FUNCTION public.admin_referral_analytics()
RETURNS TABLE(
  code_id uuid,
  code text,
  label text,
  kind text,
  active boolean,
  expires_at timestamptz,
  created_at timestamptz,
  plan_id uuid,
  plan_name text,
  percent_off integer,
  stripe_coupon_id text,
  max_uses integer,
  uses_count integer,
  redemptions bigint,
  unique_users bigint,
  paid_signups bigint,
  beta_signups bigint,
  last_redeemed_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id, c.code, c.label, c.kind, c.active, c.expires_at, c.created_at,
    c.plan_id, p.name, c.percent_off, c.stripe_coupon_id, c.max_uses, c.uses_count,
    COUNT(r.id)::bigint AS redemptions,
    COUNT(DISTINCT r.user_id)::bigint AS unique_users,
    COUNT(DISTINCT s.user_id) FILTER (
      WHERE s.status IN ('active','trialing','past_due')
    )::bigint AS paid_signups,
    COUNT(DISTINCT r.user_id) FILTER (WHERE c.kind = 'beta')::bigint AS beta_signups,
    MAX(r.redeemed_at) AS last_redeemed_at
  FROM public.referral_codes c
  LEFT JOIN public.referral_redemptions r ON r.code_id = c.id
  LEFT JOIN public.subscription_plans p ON p.id = c.plan_id
  LEFT JOIN LATERAL (
    SELECT ss.user_id, ss.status FROM public.subscriptions ss
    WHERE ss.user_id = r.user_id
    ORDER BY ss.created_at DESC LIMIT 1
  ) s ON true
  WHERE public.has_role(auth.uid(), 'admin'::app_role)
  GROUP BY c.id, p.name
  ORDER BY c.created_at DESC;
$$;

-- 3) Admin referral redemption log (per-redemption audit list).
CREATE OR REPLACE FUNCTION public.admin_referral_redemption_log(_limit integer DEFAULT 1000)
RETURNS TABLE(
  redemption_id uuid,
  redeemed_at timestamptz,
  code_id uuid,
  code text,
  code_label text,
  kind text,
  user_id uuid,
  user_email text,
  plan_id uuid,
  plan_name text,
  percent_off integer,
  stripe_coupon_id text,
  current_sub_status text,
  current_plan_name text,
  has_beta_role boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.redeemed_at,
    c.id,
    c.code,
    c.label,
    r.kind,
    r.user_id,
    u.email::text,
    r.plan_id,
    p.name,
    c.percent_off,
    c.stripe_coupon_id,
    s.status,
    sp.name,
    public.has_role(r.user_id, 'beta_tester'::app_role)
  FROM public.referral_redemptions r
  JOIN public.referral_codes c ON c.id = r.code_id
  LEFT JOIN auth.users u ON u.id = r.user_id
  LEFT JOIN public.subscription_plans p ON p.id = r.plan_id
  LEFT JOIN LATERAL (
    SELECT ss.status, ss.price_id FROM public.subscriptions ss
    WHERE ss.user_id = r.user_id
    ORDER BY ss.created_at DESC LIMIT 1
  ) s ON true
  LEFT JOIN public.subscription_plans sp
    ON (sp.stripe_monthly_price_id = s.price_id OR sp.stripe_yearly_price_id = s.price_id)
  WHERE public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY r.redeemed_at DESC
  LIMIT COALESCE(_limit, 1000);
$$;

GRANT EXECUTE ON FUNCTION public.my_entitlements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_referral_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_referral_redemption_log(integer) TO authenticated;
