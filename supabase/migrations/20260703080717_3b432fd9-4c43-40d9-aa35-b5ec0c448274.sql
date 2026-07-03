-- 1) Plan-level numeric limits (NULL = unlimited).
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS max_portfolios int,
  ADD COLUMN IF NOT EXISTS max_positions_per_portfolio int,
  ADD COLUMN IF NOT EXISTS max_watchlist int,
  ADD COLUMN IF NOT EXISTS max_ai_questions_per_month int;

COMMENT ON COLUMN public.subscription_plans.max_portfolios              IS 'Free-tier cap on total portfolios. NULL = unlimited.';
COMMENT ON COLUMN public.subscription_plans.max_positions_per_portfolio IS 'Cap on positions per portfolio. NULL = unlimited.';
COMMENT ON COLUMN public.subscription_plans.max_watchlist               IS 'Cap on tickers in a watchlist. NULL = unlimited.';
COMMENT ON COLUMN public.subscription_plans.max_ai_questions_per_month  IS 'Cap on AI-question sends per month (rolling calendar month). NULL = unlimited.';

-- 2) Free-tier caps.
UPDATE public.subscription_plans
   SET max_portfolios = 1,
       max_positions_per_portfolio = 10,
       max_watchlist = 5,
       max_ai_questions_per_month = 5
 WHERE slug = 'free';

-- 3) Register gated feature keys.
INSERT INTO public.feature_catalog (key, name, description) VALUES
  ('research.full_memo',             'Full research memo',            'Multi-page single-name research: valuation ranges, scenarios, correlation, catalysts.'),
  ('portfolio.stress_test',          'Portfolio stress test',         'Portfolio-level stress scenarios (rate shocks, drawdowns, macro regimes).'),
  ('portfolio.correlation',          'Portfolio correlation matrix',  'Cross-holding correlation and concentration analytics.'),
  ('portfolio.macro_scenario',       'Macro-scenario report',         'What-if macro scenarios applied to your portfolio.'),
  ('portfolio.lookthrough_allocation','Look-through allocation',      'ETF/fund look-through geography and sector breakdown.'),
  ('strategy.proposal_builder',      'Strategy proposal builder',     'Guided builder that proposes a full multi-asset strategy.'),
  ('export.pdf',                     'PDF export',                    'Export reports and dashboards to PDF.'),
  ('data.realtime_refresh',          'Real-time data refresh',        'Faster data refresh cadence than the free delayed feed.'),
  ('portfolios.unlimited',           'Unlimited portfolios',          'Create more than one portfolio.'),
  ('positions.unlimited',            'Unlimited positions',           'Track more than 10 positions per portfolio.'),
  ('watchlist.unlimited',            'Unlimited watchlist',           'Watch more than 5 tickers.'),
  ('ai.unlimited_questions',         'Unlimited AI questions',        'Ask the AI copilot without a monthly cap.'),
  ('advisor.multi_client',           'Multi-client management',       'Advisor workspace for managing multiple clients.'),
  ('export.pdf_whitelabel',          'White-labeled PDF export',      'Client-branded PDF exports.'),
  ('compliance.mifid_ii',            'MiFID II suitability',          'Suitability workflow tooling required by MiFID II.'),
  ('api.bulk_export',                'Bulk / API export',             'Programmatic bulk export of client and portfolio data.')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 4) Grant keys to plans.
WITH pro_keys(k) AS (VALUES
  ('research.full_memo'), ('portfolio.stress_test'), ('portfolio.correlation'),
  ('portfolio.macro_scenario'), ('portfolio.lookthrough_allocation'),
  ('strategy.proposal_builder'), ('export.pdf'), ('data.realtime_refresh'),
  ('portfolios.unlimited'), ('positions.unlimited'),
  ('watchlist.unlimited'), ('ai.unlimited_questions')
),
ent_keys(k) AS (
  SELECT k FROM pro_keys
  UNION ALL VALUES
  ('advisor.multi_client'), ('export.pdf_whitelabel'),
  ('compliance.mifid_ii'),  ('api.bulk_export')
),
pro_arr AS (SELECT array_agg(k) AS keys FROM pro_keys),
ent_arr AS (SELECT array_agg(k) AS keys FROM ent_keys)
UPDATE public.subscription_plans p
   SET feature_keys = (
     SELECT ARRAY(
       SELECT DISTINCT unnest(COALESCE(p.feature_keys, ARRAY[]::text[]) ||
                              CASE WHEN p.slug IN ('elite','advisor','enterprise')
                                   THEN (SELECT keys FROM ent_arr)
                                   ELSE (SELECT keys FROM pro_arr) END)
     )
   )
 WHERE p.slug IN ('plus','pro','elite','advisor','enterprise');

-- 5) Rebuild my_entitlements with the new return signature (limits included).
DROP FUNCTION IF EXISTS public.my_entitlements();
CREATE FUNCTION public.my_entitlements()
RETURNS TABLE(
  tier text, plan_slug text, plan_name text, feature_keys text[],
  beta_active boolean, source text,
  max_portfolios int, max_positions_per_portfolio int,
  max_watchlist int, max_ai_questions_per_month int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_beta boolean := false;
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

  SELECT coalesce(p.tier,'free'), p.slug, p.name, coalesce(p.feature_keys, ARRAY[]::text[]),
         p.max_portfolios, p.max_positions_per_portfolio, p.max_watchlist, p.max_ai_questions_per_month
    INTO v_tier, v_slug, v_name, v_keys, v_max_p, v_max_pos, v_max_w, v_max_ai
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
    IF v_beta THEN
      SELECT array_agg(DISTINCT k) INTO v_keys FROM (
        SELECT unnest(coalesce(v_keys, ARRAY[]::text[])) AS k
        UNION SELECT key FROM public.feature_catalog
      ) x;
    END IF;
    RETURN QUERY SELECT v_tier, v_slug, v_name, coalesce(v_keys, ARRAY[]::text[]), v_beta, 'subscription'::text,
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
  FROM public.subscription_plans WHERE slug = 'free' LIMIT 1;

  RETURN QUERY SELECT 'free'::text, NULL::text, NULL::text, ARRAY[]::text[], false, 'free'::text,
                      COALESCE(v_max_p, 1), COALESCE(v_max_pos, 10),
                      COALESCE(v_max_w, 5), COALESCE(v_max_ai, 5);
END $$;

GRANT EXECUTE ON FUNCTION public.my_entitlements() TO anon, authenticated;