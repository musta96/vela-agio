
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allow_cross_asset boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_shorts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_derivatives boolean NOT NULL DEFAULT false;

INSERT INTO public.feature_flags (key, label, enabled, description)
VALUES ('advisor_unrestricted_enabled', 'Advisor: unrestricted suggestions', false, 'Master switch enabling cross-asset, short and derivative suggestions in the Advisor for users who also have profile toggles on.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.advisor_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  portfolio_id uuid,
  run_at timestamptz NOT NULL DEFAULT now(),
  base_currency text NOT NULL DEFAULT 'EUR',
  total_value numeric NOT NULL DEFAULT 0,
  cash_available numeric NOT NULL DEFAULT 0,
  risk_profile text,
  suitability_summary text,
  gating jsonb NOT NULL DEFAULT '{}'::jsonb,
  strategies jsonb NOT NULL DEFAULT '[]'::jsonb,
  winner_strategy text,
  blended_weights jsonb NOT NULL DEFAULT '[]'::jsonb,
  picked_basis text NOT NULL DEFAULT 'blended',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advisor_runs TO authenticated;
GRANT ALL ON public.advisor_runs TO service_role;
ALTER TABLE public.advisor_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own advisor runs" ON public.advisor_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own advisor runs" ON public.advisor_runs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own advisor runs" ON public.advisor_runs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own advisor runs" ON public.advisor_runs FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS advisor_runs_user_idx ON public.advisor_runs (user_id, run_at DESC);

CREATE TABLE IF NOT EXISTS public.advisor_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.advisor_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  seq int NOT NULL DEFAULT 0,
  action text NOT NULL,
  asset_class text NOT NULL DEFAULT 'equity',
  symbol text NOT NULL,
  symbol_label text,
  side text NOT NULL,
  qty numeric NOT NULL DEFAULT 0,
  order_type text NOT NULL DEFAULT 'market',
  limit_price numeric,
  est_price numeric,
  est_notional numeric,
  currency text NOT NULL DEFAULT 'USD',
  rationale text,
  option_structure text,
  option_expiry date,
  option_strike numeric,
  option_right text,
  paper_order_id uuid,
  status text NOT NULL DEFAULT 'draft',
  status_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advisor_orders TO authenticated;
GRANT ALL ON public.advisor_orders TO service_role;
ALTER TABLE public.advisor_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own advisor orders" ON public.advisor_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own advisor orders" ON public.advisor_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own advisor orders" ON public.advisor_orders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own advisor orders" ON public.advisor_orders FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS advisor_orders_run_idx ON public.advisor_orders (run_id, seq);
CREATE INDEX IF NOT EXISTS advisor_orders_user_idx ON public.advisor_orders (user_id, created_at DESC);
