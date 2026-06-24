
CREATE OR REPLACE FUNCTION public.admin_revenue_overview(_env text DEFAULT 'live')
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total int;
  v_active int;
  v_trialing int;
  v_past_due int;
  v_canceled int;
  v_new_30d int;
  v_churn_30d int;
  v_mrr numeric;
  v_by_tier jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.subscriptions WHERE environment = _env;
  SELECT COUNT(*) INTO v_active FROM public.subscriptions WHERE environment = _env AND status = 'active';
  SELECT COUNT(*) INTO v_trialing FROM public.subscriptions WHERE environment = _env AND status = 'trialing';
  SELECT COUNT(*) INTO v_past_due FROM public.subscriptions WHERE environment = _env AND status = 'past_due';
  SELECT COUNT(*) INTO v_canceled FROM public.subscriptions WHERE environment = _env AND status = 'canceled';
  SELECT COUNT(*) INTO v_new_30d FROM public.subscriptions WHERE environment = _env AND created_at >= now() - interval '30 days';
  SELECT COUNT(*) INTO v_churn_30d FROM public.subscriptions WHERE environment = _env AND status = 'canceled' AND updated_at >= now() - interval '30 days';

  -- MRR estimate: parse price_label digits, treat yearly as /12
  SELECT COALESCE(SUM(
    CASE
      WHEN p.stripe_yearly_price_id = s.price_id THEN
        COALESCE(NULLIF(regexp_replace(p.price_label, '[^0-9.]', '', 'g'), '')::numeric, 0) / 12.0
      ELSE
        COALESCE(NULLIF(regexp_replace(p.price_label, '[^0-9.]', '', 'g'), '')::numeric, 0)
    END
  ), 0) INTO v_mrr
  FROM public.subscriptions s
  JOIN public.subscription_plans p
    ON p.stripe_monthly_price_id = s.price_id OR p.stripe_yearly_price_id = s.price_id
  WHERE s.environment = _env
    AND s.status IN ('active','trialing','past_due');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'tier', tier, 'plan', plan_name, 'subs', subs, 'mrr', mrr
  ) ORDER BY mrr DESC), '[]'::jsonb)
  INTO v_by_tier
  FROM (
    SELECT
      COALESCE(p.tier, 'unknown') AS tier,
      p.name AS plan_name,
      COUNT(*)::int AS subs,
      SUM(
        CASE
          WHEN p.stripe_yearly_price_id = s.price_id THEN
            COALESCE(NULLIF(regexp_replace(p.price_label, '[^0-9.]', '', 'g'), '')::numeric, 0) / 12.0
          ELSE
            COALESCE(NULLIF(regexp_replace(p.price_label, '[^0-9.]', '', 'g'), '')::numeric, 0)
        END
      )::numeric AS mrr
    FROM public.subscriptions s
    LEFT JOIN public.subscription_plans p
      ON p.stripe_monthly_price_id = s.price_id OR p.stripe_yearly_price_id = s.price_id
    WHERE s.environment = _env
      AND s.status IN ('active','trialing','past_due')
    GROUP BY COALESCE(p.tier, 'unknown'), p.name
  ) x;

  RETURN jsonb_build_object(
    'env', _env,
    'total', v_total,
    'active', v_active,
    'trialing', v_trialing,
    'past_due', v_past_due,
    'canceled', v_canceled,
    'new_30d', v_new_30d,
    'churn_30d', v_churn_30d,
    'mrr', v_mrr,
    'arr', v_mrr * 12,
    'by_tier', v_by_tier
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revenue_overview(text) TO authenticated;
