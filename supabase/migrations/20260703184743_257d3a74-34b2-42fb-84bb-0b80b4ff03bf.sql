
DROP POLICY IF EXISTS "Authenticated can read ai cache" ON public.ai_output_cache;
DROP POLICY IF EXISTS "brief insights readable to signed-in users" ON public.daily_brief_insights;
DROP POLICY IF EXISTS "Authenticated read deal flow" ON public.deal_flow_cache;
DROP POLICY IF EXISTS "Authenticated users read cache" ON public.market_data_cache;

REVOKE SELECT ON public.ai_output_cache FROM authenticated, anon;
REVOKE SELECT ON public.daily_brief_insights FROM authenticated, anon;
REVOKE SELECT ON public.deal_flow_cache FROM authenticated, anon;
REVOKE SELECT ON public.market_data_cache FROM authenticated, anon;

GRANT ALL ON public.ai_output_cache TO service_role;
GRANT ALL ON public.daily_brief_insights TO service_role;
GRANT ALL ON public.deal_flow_cache TO service_role;
GRANT ALL ON public.market_data_cache TO service_role;
