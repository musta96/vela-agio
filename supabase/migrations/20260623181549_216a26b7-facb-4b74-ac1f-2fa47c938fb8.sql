
-- 1) Catalog ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_catalog (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.feature_catalog TO anon, authenticated;
GRANT ALL ON public.feature_catalog TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.feature_catalog TO authenticated;

ALTER TABLE public.feature_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_catalog_public_read"
  ON public.feature_catalog FOR SELECT USING (true);
CREATE POLICY "feature_catalog_admin_insert"
  ON public.feature_catalog FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "feature_catalog_admin_update"
  ON public.feature_catalog FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "feature_catalog_admin_delete"
  ON public.feature_catalog FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER feature_catalog_set_updated_at
  BEFORE UPDATE ON public.feature_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Plan column --------------------------------------------------------
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS feature_keys text[] NOT NULL DEFAULT '{}';

-- 3) Seed catalog -------------------------------------------------------
INSERT INTO public.feature_catalog (key, name, description, category, sort_order) VALUES
  ('ai.copilot',           'AI Copilot',            'Chat with the AI assistant about markets, screening and your portfolio.', 'ai',         10),
  ('ai.briefing',          'AI daily briefing',     'Personalized AI-written market & portfolio brief each morning.',          'ai',         20),
  ('ai.sentiment',         'AI sentiment',          'AI-scored news and social sentiment on tickers and watchlists.',          'ai',         30),
  ('ai.backtests',         'AI backtests',          'Natural-language strategy backtesting with AI-generated rules.',          'ai',         40),
  ('ai.deep_research',     'AI deep research',      'Long-form, multi-source research reports written by premium models.',     'ai',         50),
  ('alerts.email',         'Email alerts',          'Get alerts via email when conditions on your watchlist trigger.',         'alerts',     60),
  ('alerts.push',          'Push & SMS alerts',     'Mobile push and SMS delivery for time-sensitive alerts.',                 'alerts',     70),
  ('portfolio.simulations','Portfolio simulations', 'Monte Carlo & scenario simulations on your portfolio.',                   'portfolio', 110),
  ('portfolio.doctor',     'Portfolio Doctor',      'Risk, concentration and diversification diagnostics.',                    'portfolio', 120),
  ('copilot.priority',     'Priority queue',        'Skip the line for AI requests during peak load.',                         'ai',        130),
  ('advisor.client_portal','White-label client portal','Branded portal for your advisory clients.',                             'advisor',   200),
  ('advisor.mifid_kids',   'MiFID II + KIDs',       'Suitability assessments and KID document generation.',                    'advisor',   210),
  ('advisor.audit_log',    'Compliance audit log',  'Immutable advisory action audit trail.',                                  'advisor',   220),
  ('enterprise.api',       'REST API & webhooks',   'Programmatic access to Vela data and events.',                            'enterprise',300),
  ('enterprise.sso',       'SSO (SAML / OIDC)',     'Single sign-on for teams.',                                               'enterprise',310),
  ('enterprise.soc2',      'SOC 2 / ISO 27001',     'Compliance documentation & dedicated SLA.',                               'enterprise',320)
ON CONFLICT (key) DO NOTHING;

-- 4) Back-fill feature_keys for existing tiers --------------------------
UPDATE public.subscription_plans
  SET feature_keys = ARRAY[]::text[]
  WHERE slug = 'free' AND coalesce(array_length(feature_keys,1),0) = 0;

UPDATE public.subscription_plans
  SET feature_keys = ARRAY['ai.copilot','ai.briefing','alerts.email']
  WHERE slug = 'plus' AND coalesce(array_length(feature_keys,1),0) = 0;

UPDATE public.subscription_plans
  SET feature_keys = ARRAY[
    'ai.copilot','ai.briefing','ai.sentiment','ai.backtests',
    'alerts.email','alerts.push','copilot.priority',
    'portfolio.simulations','portfolio.doctor'
  ]
  WHERE slug = 'pro' AND coalesce(array_length(feature_keys,1),0) = 0;

UPDATE public.subscription_plans
  SET feature_keys = ARRAY[
    'ai.copilot','ai.briefing','ai.sentiment','ai.backtests','ai.deep_research',
    'alerts.email','alerts.push','copilot.priority',
    'portfolio.simulations','portfolio.doctor'
  ]
  WHERE slug = 'elite' AND coalesce(array_length(feature_keys,1),0) = 0;

UPDATE public.subscription_plans
  SET feature_keys = ARRAY[
    'ai.copilot','ai.briefing','ai.sentiment','ai.backtests','ai.deep_research',
    'alerts.email','alerts.push','copilot.priority',
    'portfolio.simulations','portfolio.doctor',
    'advisor.client_portal','advisor.mifid_kids','advisor.audit_log'
  ]
  WHERE slug = 'advisor' AND coalesce(array_length(feature_keys,1),0) = 0;

UPDATE public.subscription_plans
  SET feature_keys = ARRAY[
    'ai.copilot','ai.briefing','ai.sentiment','ai.backtests','ai.deep_research',
    'alerts.email','alerts.push','copilot.priority',
    'portfolio.simulations','portfolio.doctor',
    'enterprise.api','enterprise.sso','enterprise.soc2'
  ]
  WHERE slug = 'enterprise' AND coalesce(array_length(feature_keys,1),0) = 0;

-- 5) Entitlement RPC ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_feature(_user_id uuid, _key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    JOIN public.subscription_plans p
      ON (p.stripe_monthly_price_id = s.price_id
          OR p.stripe_yearly_price_id = s.price_id)
    WHERE s.user_id = _user_id
      AND (
        (s.status IN ('active','trialing','past_due')
          AND (s.current_period_end IS NULL OR s.current_period_end > now()))
        OR (s.status = 'canceled' AND s.current_period_end > now())
      )
      AND _key = ANY(p.feature_keys)
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, anon, service_role;

-- 6) RPC to fetch the caller's full entitlement set ---------------------
CREATE OR REPLACE FUNCTION public.my_entitlements()
RETURNS TABLE(tier text, plan_slug text, plan_name text, feature_keys text[])
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(p.tier, 'free') AS tier,
    p.slug AS plan_slug,
    p.name AS plan_name,
    coalesce(p.feature_keys, ARRAY[]::text[]) AS feature_keys
  FROM public.subscriptions s
  LEFT JOIN public.subscription_plans p
    ON (p.stripe_monthly_price_id = s.price_id
        OR p.stripe_yearly_price_id = s.price_id)
  WHERE s.user_id = auth.uid()
    AND (
      (s.status IN ('active','trialing','past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now()))
      OR (s.status = 'canceled' AND s.current_period_end > now())
    )
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.my_entitlements() TO authenticated, service_role;
