CREATE TABLE public.private_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'startup' CHECK (kind IN ('startup','private')),
  name text NOT NULL,
  website text,
  country text NOT NULL DEFAULT 'IT',
  sector text NOT NULL DEFAULT 'software',
  stage text NOT NULL DEFAULT 'seed',
  currency text NOT NULL DEFAULT 'EUR',
  round_name text,
  round_date date,
  round_size numeric,
  pre_money numeric,
  post_money numeric,
  amount_invested numeric,
  ownership_pct numeric,
  current_valuation numeric,
  status text NOT NULL DEFAULT 'watching',
  description text,
  notes text,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_valuation jsonb,
  last_valued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_companies TO authenticated;
GRANT ALL ON public.private_companies TO service_role;

ALTER TABLE public.private_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own private companies select" ON public.private_companies
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own private companies insert" ON public.private_companies
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own private companies update" ON public.private_companies
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own private companies delete" ON public.private_companies
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX private_companies_user_kind_idx ON public.private_companies (user_id, kind, created_at DESC);
