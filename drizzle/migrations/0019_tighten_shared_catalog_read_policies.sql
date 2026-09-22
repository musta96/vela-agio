-- strategy_presets: shared strategy catalog, signed-in users only.
DROP POLICY IF EXISTS "Authenticated users can read presets" ON public.strategy_presets;
CREATE POLICY "Signed-in users read strategy presets"
  ON public.strategy_presets
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

REVOKE SELECT ON public.strategy_presets FROM anon;

-- sentiment_history: market-wide sentiment cache, signed-in users only.
DROP POLICY IF EXISTS "sentiment_history authenticated read" ON public.sentiment_history;
CREATE POLICY "Signed-in users read sentiment history"
  ON public.sentiment_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

REVOKE SELECT ON public.sentiment_history FROM anon;
