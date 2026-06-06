ALTER TABLE public.ai_usage_log
  ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cache_hit boolean NOT NULL DEFAULT false;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS monthly_credit_cap integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.ai_output_cache (
  cache_key text PRIMARY KEY,
  ticker text NOT NULL,
  day date NOT NULL,
  analysis_type text NOT NULL,
  model text,
  payload jsonb NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS ai_output_cache_ticker_day_idx
  ON public.ai_output_cache (ticker, day, analysis_type);

GRANT SELECT ON public.ai_output_cache TO authenticated;
GRANT ALL ON public.ai_output_cache TO service_role;

ALTER TABLE public.ai_output_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read ai cache" ON public.ai_output_cache;
CREATE POLICY "Authenticated can read ai cache" ON public.ai_output_cache
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.ai_credits_this_month(_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(credits), 0)::integer
  FROM public.ai_usage_log
  WHERE user_id = _user_id
    AND provider = 'lovable'
    AND created_at >= date_trunc('month', now());
$$;

CREATE OR REPLACE FUNCTION public.ai_margin_summary()
RETURNS TABLE (
  tier text,
  users bigint,
  ai_cost_cents bigint,
  ai_credits bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(p.tier, 'free') AS tier,
    COUNT(DISTINCT u.user_id) AS users,
    COALESCE(SUM(u.cost_cents), 0)::bigint AS ai_cost_cents,
    COALESCE(SUM(u.credits), 0)::bigint AS ai_credits
  FROM public.ai_usage_log u
  LEFT JOIN public.subscriptions s
    ON s.user_id = u.user_id
    AND s.status IN ('active','trialing','past_due')
  LEFT JOIN public.subscription_plans p
    ON p.stripe_monthly_price_id = s.price_id
    OR p.stripe_yearly_price_id = s.price_id
  WHERE u.created_at >= now() - interval '30 days'
    AND u.provider = 'lovable'
  GROUP BY COALESCE(p.tier, 'free');
$$;

GRANT EXECUTE ON FUNCTION public.ai_credits_this_month(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_margin_summary() TO authenticated, service_role;