CREATE TABLE public.financial_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My goal',
  initial numeric NOT NULL DEFAULT 0,
  monthly numeric NOT NULL DEFAULT 0,
  years integer NOT NULL DEFAULT 25,
  target numeric NOT NULL DEFAULT 0,
  expected_return numeric NOT NULL DEFAULT 0.07,
  volatility numeric NOT NULL DEFAULT 0.15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_goals TO authenticated;
GRANT ALL ON public.financial_goals TO service_role;

ALTER TABLE public.financial_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own goals"
  ON public.financial_goals
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER financial_goals_set_updated_at
  BEFORE UPDATE ON public.financial_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX financial_goals_user_idx ON public.financial_goals(user_id, updated_at DESC);