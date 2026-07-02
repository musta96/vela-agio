-- 1. landing_globals: restrict public reads to entries explicitly flagged public.
ALTER TABLE public.landing_globals
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "Public read landing globals" ON public.landing_globals;

CREATE POLICY "Public read landing globals (public keys only)"
  ON public.landing_globals
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

CREATE POLICY "Admins read all landing globals"
  ON public.landing_globals
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. sentiment_history: remove fully-public read, require auth.
DROP POLICY IF EXISTS "sentiment_history public read" ON public.sentiment_history;

CREATE POLICY "sentiment_history authenticated read"
  ON public.sentiment_history
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.sentiment_history FROM anon;
GRANT SELECT ON public.sentiment_history TO authenticated;
GRANT ALL ON public.sentiment_history TO service_role;