
-- Watchlist
CREATE TABLE public.watchlist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own watchlist"
  ON public.watchlist_items FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own watchlist"
  ON public.watchlist_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own watchlist"
  ON public.watchlist_items FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own watchlist"
  ON public.watchlist_items FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_watchlist_user ON public.watchlist_items(user_id);

-- Portfolio
CREATE TABLE public.portfolio_holdings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  shares NUMERIC NOT NULL DEFAULT 0,
  avg_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);
ALTER TABLE public.portfolio_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own portfolio"
  ON public.portfolio_holdings FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own portfolio"
  ON public.portfolio_holdings FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own portfolio"
  ON public.portfolio_holdings FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own portfolio"
  ON public.portfolio_holdings FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_portfolio_user ON public.portfolio_holdings(user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER portfolio_holdings_set_updated_at
  BEFORE UPDATE ON public.portfolio_holdings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
