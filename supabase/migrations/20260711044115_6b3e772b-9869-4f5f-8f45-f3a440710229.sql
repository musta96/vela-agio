CREATE TABLE public.bond_saved_bonds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  inputs JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bond_saved_bonds TO authenticated;
GRANT ALL ON public.bond_saved_bonds TO service_role;

ALTER TABLE public.bond_saved_bonds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own saved bonds" ON public.bond_saved_bonds
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own saved bonds" ON public.bond_saved_bonds
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own saved bonds" ON public.bond_saved_bonds
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own saved bonds" ON public.bond_saved_bonds
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER bond_saved_bonds_updated_at
  BEFORE UPDATE ON public.bond_saved_bonds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX bond_saved_bonds_user_idx ON public.bond_saved_bonds(user_id, updated_at DESC);