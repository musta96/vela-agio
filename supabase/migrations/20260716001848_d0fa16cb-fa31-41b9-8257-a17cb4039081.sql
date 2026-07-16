-- Strategy presets library: curated entry/exit/risk rulesets that seed the Strategy Lab.
CREATE TABLE IF NOT EXISTS public.strategy_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  family text NOT NULL,          -- smc | trend | news | volatility | fib | flow | pattern
  timeframe text,
  entry_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  exit_rules  jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.strategy_presets TO authenticated;
GRANT ALL    ON public.strategy_presets TO service_role;

ALTER TABLE public.strategy_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read presets"
  ON public.strategy_presets FOR SELECT
  TO authenticated USING (true);

CREATE TRIGGER strategy_presets_set_updated_at
  BEFORE UPDATE ON public.strategy_presets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed a handful of presets covering the requested strategy families.
INSERT INTO public.strategy_presets (slug, name, description, family, timeframe, entry_rules, exit_rules, risk_config, tags) VALUES
('smc-sweep-reclaim',       'SMC · Liquidity sweep + reclaim',    'Buy after price sweeps a prior swing low and RSI recovers from oversold.', 'smc',        '1h', '[{"type":"rsi_below","value":32},{"type":"price_pct_change","period":3,"value":-2}]'::jsonb, '[{"type":"rsi_above","value":62}]'::jsonb, '{"stopPct":3,"targetPct":6,"riskPct":1}'::jsonb, ARRAY['smc','liquidity','reversal']),
('trend-ema-stack',         'Trend · EMA stack pullback',          'Enter when fast SMA crosses above slow with price above the 200 SMA (trend filter).','trend',     '1d', '[{"type":"sma_cross_up","fast":20,"slow":50},{"type":"price_above_sma","period":200}]'::jsonb, '[{"type":"sma_cross_down","fast":20,"slow":50}]'::jsonb, '{"stopPct":5,"targetPct":15,"riskPct":1}'::jsonb, ARRAY['trend','ma','systematic']),
('donchian-breakout',       'Trend · Donchian breakout',           'Buy fresh highs with volume expansion; classic turtle-style rule.','trend',     '1d', '[{"type":"price_pct_change","period":20,"value":8},{"type":"volume_spike","value":1.8}]'::jsonb, '[{"type":"sma_cross_down","fast":10,"slow":30}]'::jsonb, '{"stopPct":6,"targetPct":18,"riskPct":1}'::jsonb, ARRAY['trend','breakout']),
('news-event-drift',        'News · Post-headline drift',           'Enter N bars after bullish headline; hold for horizon or stop.','news',       '15m','[{"type":"price_pct_change","period":1,"value":1.5},{"type":"volume_spike","value":2.5}]'::jsonb, '[{"type":"price_pct_change","period":6,"value":-1}]'::jsonb, '{"stopPct":2,"targetPct":4,"riskPct":0.5}'::jsonb, ARRAY['news','intraday','event']),
('vol-breakout-atr',        'Volatility · ATR breakout',            'Enter on volatility expansion after low-vol regime.','volatility','1h','[{"type":"price_pct_change","period":5,"value":4},{"type":"volume_spike","value":1.5}]'::jsonb, '[{"type":"rsi_above","value":72}]'::jsonb, '{"stopPct":4,"targetPct":10,"riskPct":1}'::jsonb, ARRAY['volatility','breakout']),
('fib-golden-pullback',     'Fibonacci · Golden zone pullback',     'Enter on RSI turn inside the 0.5–0.618 retracement of the last impulse.','fib','1h','[{"type":"rsi_below","value":40},{"type":"price_pct_change","period":3,"value":-3}]'::jsonb, '[{"type":"rsi_above","value":65}]'::jsonb, '{"stopPct":3,"targetPct":9,"riskPct":1}'::jsonb, ARRAY['fibonacci','pullback','reversal']),
('avwap-reclaim',           'AVWAP · Reclaim + RSI turn',           'Buy when price reclaims an anchored VWAP with momentum turning up.','flow','1h','[{"type":"price_above_sma","period":50},{"type":"rsi_below","value":45}]'::jsonb, '[{"type":"price_below_sma","period":20}]'::jsonb, '{"stopPct":3,"targetPct":8,"riskPct":1}'::jsonb, ARRAY['avwap','flow','reclaim']),
('pattern-hs-break',        'Pattern · Head & Shoulders break',     'Short after neckline break with MACD confirmation.','pattern','1d','[{"type":"macd_cross_down"},{"type":"price_pct_change","period":5,"value":-3}]'::jsonb, '[{"type":"rsi_below","value":30}]'::jsonb, '{"stopPct":5,"targetPct":12,"riskPct":1}'::jsonb, ARRAY['pattern','reversal','short'])
ON CONFLICT (slug) DO NOTHING;