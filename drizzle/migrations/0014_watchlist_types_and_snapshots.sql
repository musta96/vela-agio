ALTER TABLE public.watchlist_items ADD COLUMN IF NOT EXISTS instrument_type TEXT;

CREATE TABLE IF NOT EXISTS public.watchlist_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  captured_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  price NUMERIC,
  currency TEXT,
  change_pct NUMERIC,
  vela_score NUMERIC,
  vela_risk_score NUMERIC,
  morningstar_rating NUMERIC,
  instrument_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol, captured_on)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist_snapshots TO authenticated;
GRANT ALL ON public.watchlist_snapshots TO service_role;

ALTER TABLE public.watchlist_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own watchlist snapshots"
  ON public.watchlist_snapshots FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own watchlist snapshots"
  ON public.watchlist_snapshots FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own watchlist snapshots"
  ON public.watchlist_snapshots FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own watchlist snapshots"
  ON public.watchlist_snapshots FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS watchlist_snapshots_user_symbol_idx
  ON public.watchlist_snapshots (user_id, symbol, captured_on DESC);