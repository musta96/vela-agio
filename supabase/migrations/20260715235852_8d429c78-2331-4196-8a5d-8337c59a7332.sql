
ALTER TABLE public.trading_strategies
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.trading_strategies(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.trading_strategy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid NOT NULL REFERENCES public.trading_strategies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  version integer NOT NULL,
  name text NOT NULL,
  description text,
  symbol text,
  timeframe text,
  entry_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  exit_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trading_strategy_versions TO authenticated;
GRANT ALL ON public.trading_strategy_versions TO service_role;

ALTER TABLE public.trading_strategy_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own strategy versions"
  ON public.trading_strategy_versions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS trading_strategy_versions_strategy_idx
  ON public.trading_strategy_versions(strategy_id, version DESC);

-- Auto-snapshot every insert/update into the versions table and bump version on update.
CREATE OR REPLACE FUNCTION public.snapshot_trading_strategy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    -- Only snapshot when meaningful fields change.
    IF NEW.entry_rules IS DISTINCT FROM OLD.entry_rules
       OR NEW.exit_rules IS DISTINCT FROM OLD.exit_rules
       OR NEW.risk_config IS DISTINCT FROM OLD.risk_config
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.description IS DISTINCT FROM OLD.description THEN
      NEW.version := COALESCE(OLD.version, 1) + 1;
      INSERT INTO public.trading_strategy_versions
        (strategy_id, user_id, version, name, description, symbol, timeframe, entry_rules, exit_rules, risk_config)
      VALUES
        (NEW.id, NEW.user_id, NEW.version, NEW.name, NEW.description, NEW.symbol, NEW.timeframe,
         NEW.entry_rules, NEW.exit_rules, NEW.risk_config);
    END IF;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO public.trading_strategy_versions
      (strategy_id, user_id, version, name, description, symbol, timeframe, entry_rules, exit_rules, risk_config)
    VALUES
      (NEW.id, NEW.user_id, NEW.version, NEW.name, NEW.description, NEW.symbol, NEW.timeframe,
       NEW.entry_rules, NEW.exit_rules, NEW.risk_config);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_trading_strategy_ins ON public.trading_strategies;
DROP TRIGGER IF EXISTS trg_snapshot_trading_strategy_upd ON public.trading_strategies;

CREATE TRIGGER trg_snapshot_trading_strategy_ins
  AFTER INSERT ON public.trading_strategies
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_trading_strategy();

CREATE TRIGGER trg_snapshot_trading_strategy_upd
  BEFORE UPDATE ON public.trading_strategies
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_trading_strategy();
