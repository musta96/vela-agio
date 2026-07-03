
-- Track retention auto-apply so churn-risk hooks don't double-apply.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS retention_offer_applied_at timestamptz;

-- Tighten has_feature: past_due keeps access only within grace_period_days
-- of past_due_since; canceled requires a real cancel_at_period_end grace.
CREATE OR REPLACE FUNCTION public.has_feature(_user_id uuid, _key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH grace AS (
    SELECT COALESCE((SELECT grace_period_days FROM public.billing_settings LIMIT 1), 3) AS days
  ),
  prof AS (
    SELECT past_due_since FROM public.profiles WHERE user_id = _user_id
  )
  SELECT public.has_role(_user_id, 'beta_tester'::app_role) OR EXISTS (
    SELECT 1
    FROM public.subscriptions s
    JOIN public.subscription_plans p
      ON (p.stripe_monthly_price_id = s.price_id OR p.stripe_yearly_price_id = s.price_id)
    CROSS JOIN grace g
    LEFT JOIN prof ON true
    WHERE s.user_id = _user_id
      AND _key = ANY(p.feature_keys)
      AND (
            -- Fully paid, in-period access.
            (s.status IN ('active','trialing')
              AND (s.current_period_end IS NULL OR s.current_period_end > now()))
         OR -- Past due: bounded by the grace window from the first failure.
            (s.status = 'past_due'
              AND prof.past_due_since IS NOT NULL
              AND prof.past_due_since + make_interval(days => g.days) > now()
              AND (s.current_period_end IS NULL OR s.current_period_end > now()))
         OR -- Voluntary cancel-at-period-end: access until the period actually ends.
            (s.status = 'canceled'
              AND s.cancel_at_period_end = true
              AND s.current_period_end IS NOT NULL
              AND s.current_period_end > now())
      )
  );
$function$;

-- Mirror the same rules in my_entitlements so the client hook agrees with server gating.
CREATE OR REPLACE FUNCTION public.my_entitlements()
 RETURNS TABLE(tier text, plan_slug text, plan_name text, feature_keys text[], beta_active boolean, source text, max_portfolios integer, max_positions_per_portfolio integer, max_watchlist integer, max_ai_questions_per_month integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_beta boolean := false;
  v_grace int;
  v_past_due timestamptz;
  v_tier text; v_slug text; v_name text; v_keys text[];
  v_max_p int; v_max_pos int; v_max_w int; v_max_ai int;
  v_found boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'free'::text, NULL::text, NULL::text, ARRAY[]::text[], false, 'anonymous'::text,
                        1::int, 10::int, 5::int, 5::int;
    RETURN;
  END IF;

  v_beta := public.has_role(v_uid, 'beta_tester'::app_role);
  SELECT COALESCE(grace_period_days, 3) INTO v_grace FROM public.billing_settings LIMIT 1;
  v_grace := COALESCE(v_grace, 3);
  SELECT past_due_since INTO v_past_due FROM public.profiles WHERE user_id = v_uid;

  SELECT COALESCE(p.tier,'free'), p.slug, p.name, COALESCE(p.feature_keys, ARRAY[]::text[]),
         p.max_portfolios, p.max_positions_per_portfolio, p.max_watchlist, p.max_ai_questions_per_month
    INTO v_tier, v_slug, v_name, v_keys, v_max_p, v_max_pos, v_max_w, v_max_ai
  FROM public.subscriptions s
  LEFT JOIN public.subscription_plans p
    ON (p.stripe_monthly_price_id = s.price_id OR p.stripe_yearly_price_id = s.price_id)
  WHERE s.user_id = v_uid
    AND (
          (s.status IN ('active','trialing')
            AND (s.current_period_end IS NULL OR s.current_period_end > now()))
       OR (s.status = 'past_due'
            AND v_past_due IS NOT NULL
            AND v_past_due + make_interval(days => v_grace) > now()
            AND (s.current_period_end IS NULL OR s.current_period_end > now()))
       OR (s.status = 'canceled'
            AND s.cancel_at_period_end = true
            AND s.current_period_end IS NOT NULL
            AND s.current_period_end > now())
        )
  ORDER BY s.created_at DESC
  LIMIT 1;

  v_found := FOUND;

  IF v_found THEN
    IF v_beta THEN
      SELECT array_agg(DISTINCT k) INTO v_keys FROM (
        SELECT unnest(COALESCE(v_keys, ARRAY[]::text[])) AS k
        UNION SELECT key FROM public.feature_catalog
      ) x;
    END IF;
    RETURN QUERY SELECT v_tier, v_slug, v_name, COALESCE(v_keys, ARRAY[]::text[]), v_beta, 'subscription'::text,
                        v_max_p, v_max_pos, v_max_w, v_max_ai;
    RETURN;
  END IF;

  IF v_beta THEN
    RETURN QUERY SELECT 'beta'::text, 'beta-tester'::text, 'Beta tester'::text,
                        COALESCE((SELECT array_agg(key) FROM public.feature_catalog), ARRAY[]::text[]),
                        true, 'beta'::text,
                        NULL::int, NULL::int, NULL::int, NULL::int;
    RETURN;
  END IF;

  SELECT max_portfolios, max_positions_per_portfolio, max_watchlist, max_ai_questions_per_month
    INTO v_max_p, v_max_pos, v_max_w, v_max_ai
  FROM public.subscription_plans WHERE slug = 'explorer' LIMIT 1;

  RETURN QUERY SELECT 'free'::text, NULL::text, NULL::text, ARRAY[]::text[], false, 'free'::text,
                      COALESCE(v_max_p, 1), COALESCE(v_max_pos, 10),
                      COALESCE(v_max_w, 5), COALESCE(v_max_ai, 5);
END $function$;

-- Convenience wrapper: server-side "does this user have any active paid access?".
CREATE OR REPLACE FUNCTION public.has_pro_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_user_id, 'beta_tester'::app_role) OR EXISTS (
    SELECT 1 FROM public.subscriptions s
    JOIN public.subscription_plans p
      ON (p.stripe_monthly_price_id = s.price_id OR p.stripe_yearly_price_id = s.price_id)
    WHERE s.user_id = _user_id
      AND p.tier IN ('plus','pro','enterprise')
      AND public.has_feature(_user_id, 'ai.copilot')
  );
$function$;

GRANT EXECUTE ON FUNCTION public.has_pro_access(uuid) TO authenticated, service_role;
