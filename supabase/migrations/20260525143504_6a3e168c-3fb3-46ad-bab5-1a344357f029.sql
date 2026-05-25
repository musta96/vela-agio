
CREATE TABLE IF NOT EXISTS public.investor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score integer NOT NULL DEFAULT 0,
  profile_name text,
  risk_level smallint,
  horizon_years integer,
  esg_preference text,
  loss_tolerance_pct integer,
  objectives text[],
  excluded_sectors text[],
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.investor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own investor profile" ON public.investor_profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own investor profile" ON public.investor_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own investor profile" ON public.investor_profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own investor profile" ON public.investor_profiles
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER investor_profiles_set_updated_at
  BEFORE UPDATE ON public.investor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
