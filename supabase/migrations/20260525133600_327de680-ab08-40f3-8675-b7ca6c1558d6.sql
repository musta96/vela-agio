-- 1. Portfolios table
CREATE TABLE public.portfolios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  base_currency TEXT NOT NULL DEFAULT 'EUR',
  benchmark_symbol TEXT NOT NULL DEFAULT 'FTSEMIB.MI',
  is_simulation BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own portfolios" ON public.portfolios
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own portfolios" ON public.portfolios
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own portfolios" ON public.portfolios
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own portfolios" ON public.portfolios
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER portfolios_set_updated_at
  BEFORE UPDATE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_portfolios_user ON public.portfolios(user_id);

-- 2. Add portfolio_id to holdings (nullable first, backfill, then we keep nullable for safety)
ALTER TABLE public.portfolio_holdings
  ADD COLUMN portfolio_id UUID;

-- Backfill: create a default portfolio per existing user who has holdings, assign all to it
DO $$
DECLARE
  rec RECORD;
  new_pid UUID;
BEGIN
  FOR rec IN SELECT DISTINCT user_id FROM public.portfolio_holdings WHERE portfolio_id IS NULL LOOP
    INSERT INTO public.portfolios (user_id, name, description, base_currency, benchmark_symbol, is_simulation)
    VALUES (rec.user_id, 'My Portfolio', 'Default portfolio', 'EUR', 'FTSEMIB.MI', false)
    RETURNING id INTO new_pid;

    UPDATE public.portfolio_holdings
      SET portfolio_id = new_pid
      WHERE user_id = rec.user_id AND portfolio_id IS NULL;
  END LOOP;
END $$;

CREATE INDEX idx_portfolio_holdings_portfolio ON public.portfolio_holdings(portfolio_id);

-- Drop old unique constraint on (user_id, symbol) if it exists, replace with (portfolio_id, symbol)
ALTER TABLE public.portfolio_holdings
  DROP CONSTRAINT IF EXISTS portfolio_holdings_user_id_symbol_key;

CREATE UNIQUE INDEX portfolio_holdings_portfolio_symbol_unique
  ON public.portfolio_holdings(portfolio_id, symbol)
  WHERE portfolio_id IS NOT NULL;

-- Also store currency on the holding row (so each position remembers what currency the avg_price is in)
ALTER TABLE public.portfolio_holdings
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';

-- 3. Simulations table (Monte-Carlo & scenario runs)
CREATE TABLE public.portfolio_simulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'monte_carlo',
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own simulations" ON public.portfolio_simulations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own simulations" ON public.portfolio_simulations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own simulations" ON public.portfolio_simulations
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_simulations_portfolio ON public.portfolio_simulations(portfolio_id);
CREATE INDEX idx_simulations_user ON public.portfolio_simulations(user_id);