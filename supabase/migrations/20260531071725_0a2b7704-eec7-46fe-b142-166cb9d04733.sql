
CREATE TABLE public.paper_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  portfolio_id uuid NOT NULL,
  symbol text NOT NULL,
  name text,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  price numeric NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  fees numeric NOT NULL DEFAULT 0,
  notes text,
  executed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX paper_trades_user_idx ON public.paper_trades(user_id, portfolio_id, executed_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paper_trades TO authenticated;
GRANT ALL ON public.paper_trades TO service_role;
ALTER TABLE public.paper_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own paper trades" ON public.paper_trades FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own paper trades" ON public.paper_trades FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own paper trades" ON public.paper_trades FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own paper trades" ON public.paper_trades FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.paper_cash (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  portfolio_id uuid NOT NULL UNIQUE,
  currency text NOT NULL DEFAULT 'EUR',
  starting_cash numeric NOT NULL DEFAULT 100000,
  cash numeric NOT NULL DEFAULT 100000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paper_cash TO authenticated;
GRANT ALL ON public.paper_cash TO service_role;
ALTER TABLE public.paper_cash ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own paper cash" ON public.paper_cash FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own paper cash" ON public.paper_cash FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own paper cash" ON public.paper_cash FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own paper cash" ON public.paper_cash FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER paper_cash_updated BEFORE UPDATE ON public.paper_cash FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
