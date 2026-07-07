
CREATE TABLE public.thematic_watchlists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  theme TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'all',
  size TEXT NOT NULL DEFAULT 'all',
  discovery_mode BOOLEAN NOT NULL DEFAULT false,
  snapshot JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.thematic_watchlists TO authenticated;
GRANT ALL ON public.thematic_watchlists TO service_role;

ALTER TABLE public.thematic_watchlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own thematic watchlists"
  ON public.thematic_watchlists FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own thematic watchlists"
  ON public.thematic_watchlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own thematic watchlists"
  ON public.thematic_watchlists FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own thematic watchlists"
  ON public.thematic_watchlists FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_thematic_watchlists_user ON public.thematic_watchlists(user_id, created_at DESC);

CREATE TRIGGER thematic_watchlists_set_updated_at
  BEFORE UPDATE ON public.thematic_watchlists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
