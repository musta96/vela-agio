
CREATE TABLE public.trading_strategies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  symbol TEXT,
  timeframe TEXT,
  entry_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  exit_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trading_strategies TO authenticated;
GRANT ALL ON public.trading_strategies TO service_role;

ALTER TABLE public.trading_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own trading strategies"
  ON public.trading_strategies
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trading_strategies_updated_at
  BEFORE UPDATE ON public.trading_strategies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX trading_strategies_user_id_idx ON public.trading_strategies(user_id, updated_at DESC);
