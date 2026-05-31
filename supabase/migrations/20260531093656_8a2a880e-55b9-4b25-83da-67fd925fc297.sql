-- =====================================================================
-- AI access tiering + usage tracking + plan pricing fields
-- =====================================================================

-- 1) Extend subscription_plans with AI tier & price metadata
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS monthly_price_cents integer,
  ADD COLUMN IF NOT EXISTS yearly_price_cents integer,
  ADD COLUMN IF NOT EXISTS ai_model_tier text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS ai_monthly_quota integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_monthly_price_id text,
  ADD COLUMN IF NOT EXISTS stripe_yearly_price_id text;

-- ai_model_tier values: none | flash | mid | premium
-- ai_monthly_quota: 0 means no AI; -1 means unlimited

-- 2) AI usage log (one row per AI request, used for quota enforcement)
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  feature text NOT NULL,           -- 'copilot' | 'briefing' | 'sentiment' | 'backtest' | ...
  model text,
  provider text NOT NULL DEFAULT 'lovable', -- 'lovable' | 'byo'
  tokens_in integer DEFAULT 0,
  tokens_out integer DEFAULT 0,
  cost_cents integer DEFAULT 0,
  success boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_log_user_month_idx
  ON public.ai_usage_log (user_id, created_at DESC);

GRANT SELECT ON public.ai_usage_log TO authenticated;
GRANT ALL ON public.ai_usage_log TO service_role;

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ai usage"
  ON public.ai_usage_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all ai usage"
  ON public.ai_usage_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Deny client writes — only edge functions (service role) may insert
CREATE POLICY "Deny client writes (ai_usage_log i)"
  ON public.ai_usage_log FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "Deny client writes (ai_usage_log u)"
  ON public.ai_usage_log FOR UPDATE
  TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny client writes (ai_usage_log d)"
  ON public.ai_usage_log FOR DELETE
  TO anon, authenticated
  USING (false);

-- 3) Helper: current-month AI usage count for a user
CREATE OR REPLACE FUNCTION public.ai_usage_this_month(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.ai_usage_log
  WHERE user_id = _user_id
    AND provider = 'lovable'
    AND created_at >= date_trunc('month', now());
$$;

-- 4) Seed plans with new pricing tiers (idempotent upsert by slug)
INSERT INTO public.subscription_plans
  (slug, name, tier, price_label, price_period, monthly_price_cents, yearly_price_cents,
   ai_model_tier, ai_monthly_quota, features, cta_label, cta_href, sort_order, is_active, highlighted)
VALUES
  ('free', 'Free', 'free', '€0', 'forever', 0, 0, 'none', 0,
   '["Helper bot (no AI)","Bring your own AI key (free)","Watchlists, paper trading, basic charts"]'::jsonb,
   'Get started', '/auth', 1, true, false),
  ('plus', 'Plus', 'plus', '€14.99', 'per month', 1499, 14990, 'flash', 500,
   '["AI briefing & chat (Gemini Flash)","500 AI messages/month","All free features","Email alerts"]'::jsonb,
   'Start Plus', '/auth?plan=plus_monthly', 2, true, false),
  ('pro', 'Pro', 'pro', '€29.99', 'per month', 2999, 29990, 'mid', 2000,
   '["Faster + mid-tier models (GPT-5 mini)","2,000 AI messages/month","AI sentiment, AI backtests","Priority queue"]'::jsonb,
   'Start Pro', '/auth?plan=pro_monthly', 3, true, true),
  ('elite', 'Elite', 'elite', '€79.99', 'per month', 7999, 79990, 'premium', 10000,
   '["All premium models (GPT-5, Gemini Pro)","10,000 AI messages/month","Early access to new features","Dedicated support"]'::jsonb,
   'Start Elite', '/auth?plan=elite_monthly', 4, true, false)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  tier = EXCLUDED.tier,
  price_label = EXCLUDED.price_label,
  price_period = EXCLUDED.price_period,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  yearly_price_cents = EXCLUDED.yearly_price_cents,
  ai_model_tier = EXCLUDED.ai_model_tier,
  ai_monthly_quota = EXCLUDED.ai_monthly_quota,
  features = EXCLUDED.features,
  cta_label = EXCLUDED.cta_label,
  cta_href = EXCLUDED.cta_href,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  highlighted = EXCLUDED.highlighted,
  updated_at = now();

-- Deactivate old advisor/enterprise tiers (kept for history)
UPDATE public.subscription_plans SET is_active = false WHERE slug IN ('advisor','enterprise');

-- 5) Seed the global beta override control if missing
INSERT INTO public.platform_controls (key, enabled, value, reason)
VALUES ('ai_beta_override', false, '{"model_cap":"flash"}'::jsonb,
        'When enabled, grants Lovable AI access to all users (free + paid). model_cap restricts to flash|mid|premium.')
ON CONFLICT (key) DO NOTHING;