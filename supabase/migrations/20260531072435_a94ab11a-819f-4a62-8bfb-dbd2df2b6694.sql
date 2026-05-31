
CREATE TABLE public.subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_label TEXT NOT NULL,
  price_period TEXT,
  cta_label TEXT NOT NULL DEFAULT 'Get started',
  cta_href TEXT NOT NULL DEFAULT '/auth',
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  highlighted BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_public_read" ON public.subscription_plans
  FOR SELECT USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "plans_admin_insert" ON public.subscription_plans
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "plans_admin_update" ON public.subscription_plans
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "plans_admin_delete" ON public.subscription_plans
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER subscription_plans_set_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.subscription_plans (slug, name, price_label, price_period, cta_label, cta_href, features, highlighted, sort_order) VALUES
  ('free', 'Free', '€0', 'Forever', 'Get started', '/auth',
    '["Live quotes (delayed)","Watchlist of 5 symbols","Basic charts & news","AI sentiment on top names"]'::jsonb, false, 1),
  ('pro', 'Pro', '€29', '/ month', 'Start 14-day trial', '/auth',
    '["Unlimited watchlists & portfolios","Real-time intraday & VWAP","Full AI Copilot & deep research","Backtesting & optimizer","Tax-loss harvesting","PDF reports"]'::jsonb, true, 2),
  ('advisor', 'Advisor', '€199', '/ seat / month', 'Talk to sales', '/auth',
    '["Everything in Pro","MiFID II suitability + KIDs","White-label client portal","Model portfolios","Compliance audit log"]'::jsonb, false, 3),
  ('enterprise', 'Enterprise', 'Custom', 'API & SSO', 'Contact us', '/auth',
    '["REST API + webhooks","SSO (SAML / OIDC)","SOC 2 / ISO 27001 docs","Dedicated SLA & on-prem"]'::jsonb, false, 4);
